import { join, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { POWERSHELL, startTimeQuery } from '../shared/platform-process'
import { WINDOWS_PROCESS_TABLE_SCRIPT } from './process-table'
import { collectClaude, parseRegistry } from './registry'
import { listAgentFiles, liveSubagents } from './subagents'
import { projectSlug } from './transcript-tail'
import {
  fixtureIo,
  gitPath,
  hostPath,
  hostStart,
  hostTable,
  isTableQuery,
  registryEntry,
  windowsTableLine
} from './__fixtures__/helpers'

const root = hostPath('/claude')
const entry = registryEntry(process.platform)
const file = join(root, 'sessions', '42.json')
const repoGit = hostPath('/repo/.git')
const projects = join(root, 'projects', projectSlug(entry.cwd))
const startedAtMs = Date.parse('Sat Oct 10 15:29:12 2026 UTC')
const reusedStart = hostStart('Sun Oct 11 15:29:12 2026')
const ownStartQuery = startTimeQuery(entry.pid)

describe('Claude registry', () => {
  it('drops reused pids and never reads sibling keys', async () => {
    const io = fixtureIo({
      [file]: JSON.stringify(entry),
      [join(root, 'sessions', '42.key')]: 'DO_NOT_READ'
    })
    io.exec = vi.fn(async () => reusedStart)
    const read = vi.spyOn(io, 'readText')
    const batch = await collectClaude([root], io, 1000)
    expect(batch.sessions).toEqual([])
    expect(batch.sources[0].ok).toBe(true)
    expect(read.mock.calls.flat().some((path) => path.endsWith('.key'))).toBe(false)
    expect(io.exec).toHaveBeenCalledWith(ownStartQuery.file, ownStartQuery.args)
  })
  it('proves a session live from the process table without asking about its pid', async () => {
    const io = fixtureIo({ [file]: JSON.stringify(entry), [repoGit]: null })
    const exec = vi.fn(async (program: string, args: string[]) =>
      isTableQuery(program, args)
        ? hostTable([{ pid: 42, start: entry.procStart, command: 'claude' }])
        : ''
    )
    io.exec = exec
    expect((await collectClaude([root], io, 1000)).sessions).toHaveLength(1)
    expect(exec.mock.calls.filter(([program, args]) => !isTableQuery(program, args))).toEqual([])
  })
  it('drops a pid the process table lists under another start time, without a second ask', async () => {
    const io = fixtureIo({ [file]: JSON.stringify(entry), [repoGit]: null })
    const exec = vi.fn(async (program: string, args: string[]) =>
      isTableQuery(program, args)
        ? hostTable([{ pid: 42, start: reusedStart, command: 'claude' }])
        : entry.procStart
    )
    io.exec = exec
    expect((await collectClaude([root], io, 1000)).sessions).toEqual([])
    expect(exec.mock.calls.filter(([program, args]) => !isTableQuery(program, args))).toEqual([])
  })
  it('still proves a session live, by its pid, when the process table cannot be read', async () => {
    const io = fixtureIo({ [file]: JSON.stringify(entry), [repoGit]: null })
    io.exec = async (program, args) => {
      if (isTableQuery(program, args)) throw new Error('timeout')
      return entry.procStart
    }
    const batch = await collectClaude([root], io, 1000)
    expect(batch.sessions.map((session) => session.sessionId)).toEqual(['a'])
  })
  it('says the registry read failed while PowerShell cannot answer for a pid', async () => {
    const io = fixtureIo({ [file]: JSON.stringify(entry), [repoGit]: null })
    io.exec = async () => {
      throw Object.assign(new Error('timed out'), { killed: true, code: null, signal: 'SIGTERM' })
    }
    const batch = await collectClaude([root], io, 1000)
    expect(batch.sessions).toEqual([])
    // ps exits with a status for a pid it cannot find; only PowerShell's silence is unknown.
    expect(batch.sources[0].ok).toBe(process.platform !== 'win32')
  })
  it('reads a transcript tail again only when the file changed, and afresh for a session that came back', async () => {
    const transcript = join(projects, 'a.jsonl')
    const files: Record<string, string | null> = {
      [file]: JSON.stringify(entry),
      [repoGit]: null,
      [transcript]: 'x\n'
    }
    const io = fixtureIo(files)
    let live = true
    io.exec = async (program, args) => (!isTableQuery(program, args) && live ? entry.procStart : '')
    const readTail = vi.spyOn(io, 'readTail')
    await collectClaude([root], io, 1000)
    await collectClaude([root], io, 3000)
    expect(readTail).toHaveBeenCalledTimes(1)
    files[transcript] += 'y\n'
    await collectClaude([root], io, 5000)
    expect(readTail).toHaveBeenCalledTimes(2)
    live = false
    await collectClaude([root], io, 7000)
    live = true
    await collectClaude([root], io, 9000)
    expect(readTail).toHaveBeenCalledTimes(3)
  })
  it('looks for a folder’s project once a minute, not on every tick', async () => {
    const io = fixtureIo({ [file]: JSON.stringify(entry), [repoGit]: null })
    io.exec = async (program, args) => (isTableQuery(program, args) ? '' : entry.procStart)
    const stat = vi.spyOn(io, 'stat')
    const lookups = (): number => stat.mock.calls.filter(([path]) => path === repoGit).length
    await collectClaude([root], io, 1000)
    await collectClaude([root], io, 3000)
    expect(lookups()).toBe(1)
    await collectClaude([root], io, 61_000)
    expect(lookups()).toBe(2)
  })
  it('collects sessions side by side and still lists them in registry order', async () => {
    const io = fixtureIo({
      [file]: JSON.stringify(entry),
      [join(root, 'sessions', '43.json')]: JSON.stringify({ ...entry, pid: 43, sessionId: 'b' }),
      [repoGit]: null,
      [join(projects, 'a.jsonl')]: '',
      [join(projects, 'b.jsonl')]: ''
    })
    io.exec = async (program, args) =>
      isTableQuery(program, args)
        ? hostTable([
            { pid: 42, start: entry.procStart, command: 'claude' },
            { pid: 43, start: entry.procStart, command: 'claude' }
          ])
        : ''
    // The first session's tail is held back until the second's has been asked for.
    let secondAsked = (): void => {}
    const untilSecondAsked = new Promise<void>((resolve) => (secondAsked = resolve))
    io.readTail = async (path) => {
      if (path.endsWith(`${sep}b.jsonl`)) secondAsked()
      else await untilSecondAsked
      return ''
    }
    const batch = await collectClaude([root], io, 1000)
    expect(batch.sessions.map((session) => session.sessionId)).toEqual(['a', 'b'])
  })
  it('treats a missing root as healthy and empty', async () => {
    const batch = await collectClaude([root], fixtureIo(), 1000)
    expect(batch.sessions).toEqual([])
    expect(batch.sources).toEqual([{ id: `claude:${root}`, ok: true, detail: 'empty' }])
  })
  it('ingests live entries, fallback transcripts and permission attention', async () => {
    const waiting = {
      ...entry,
      status: 'waiting',
      waitingFor: 'approval requested',
      statusUpdatedAt: '2026-10-11T00:00:00Z'
    }
    const io = fixtureIo({
      [file]: JSON.stringify(waiting),
      [repoGit]: null,
      [join(root, 'projects', 'old', 'a.jsonl')]: ''
    })
    io.exec = async () => ` ${entry.procStart} \r\n`
    const batch = await collectClaude([root], io, 1000)
    expect(batch.sessions[0]).toMatchObject({
      attention: 'permission',
      projectLabel: 'repo',
      currentTool: null
    })
  })
  it('skips malformed entries and marks inaccessible roots unhealthy', async () => {
    const io = fixtureIo({
      [file]: '{',
      [join(root, 'sessions', '43.json')]: JSON.stringify({ ...entry, sessionId: '../unsafe' })
    })
    expect((await collectClaude([root], io, 1000)).sessions).toEqual([])
    io.list = async () => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' })
    }
    expect((await collectClaude([root], io, 1000)).sources[0].ok).toBe(false)
  })
})

describe('registry records', () => {
  const record = (cwd: string): string => JSON.stringify({ ...entry, cwd })

  it('keeps a record only for an absolute folder of the platform that wrote it', () => {
    expect(parseRegistry(record('/repo'), 'darwin')?.cwd).toBe('/repo')
    expect(parseRegistry(record('C:\\repo'), 'darwin')).toBeNull()
    expect(parseRegistry(record('C:\\repo'), 'win32')?.cwd).toBe('C:\\repo')
    expect(parseRegistry(record('\\\\server\\share\\repo'), 'win32')?.cwd).toBe(
      '\\\\server\\share\\repo'
    )
    expect(parseRegistry(record('/repo'), 'win32')).toBeNull()
    expect(parseRegistry(record('repo'), 'win32')).toBeNull()
  })
})

describe('agent teams', () => {
  const lead = '6a654bca-1111-2222-3333-444444444444'
  const team = 'session-6a654bca'
  const transcript = join(projects, `${lead}.jsonl`)
  const leadAgent = join(projects, lead, 'subagents', 'agent-abc.jsonl')
  const mate = join(projects, 'mate.jsonl')
  const mateAgent = join(projects, 'mate', 'subagents', 'agent-xyz.jsonl')
  const files = {
    [file]: JSON.stringify({ ...entry, sessionId: lead }),
    [repoGit]: null,
    [transcript]: '',
    [leadAgent]: '',
    [join(projects, lead, 'subagents', 'agent-abc.meta.json')]: '{"agentType":"Explore"}',
    [mate]: `${JSON.stringify({ teamName: team, agentName: 'lena-b0' })}\n`,
    [mateAgent]: '',
    [join(root, 'teams', team, 'config.json')]: JSON.stringify({
      leadSessionId: lead,
      members: [
        { agentId: `team-lead@${team}`, name: 'team-lead', agentType: 'team-lead' },
        {
          agentId: `lena-b0@${team}`,
          name: 'lena-b0',
          agentType: 'lena',
          cwd: entry.cwd,
          joinedAt: 1
        }
      ]
    })
  }
  const table = hostTable([
    {
      pid: 93143,
      start: entry.procStart,
      command: `/versions/2.1.296 --agent-id lena-b0@${team} --parent-session-id ${lead}`
    }
  ])
  const tableOrStart = async (program: string, args: string[]): Promise<string> =>
    isTableQuery(program, args) ? table : entry.procStart

  it('reports a live teammate under its lead, though it has no registry file of its own', async () => {
    const io = fixtureIo(files)
    const exec = vi.fn(tableOrStart)
    io.exec = exec
    const batch = await collectClaude([root], io, 2000)
    expect(batch.sessions).toHaveLength(1)
    expect(batch.sessions[0].usage).toBeNull()
    expect(batch.sessions[0].subagents).toEqual([
      { id: 'abc', type: 'Explore', activity: 'thinking' },
      {
        id: `lena-b0@${team}`,
        type: 'lena',
        activity: 'thinking',
        kind: 'teammate',
        name: 'lena-b0',
        cwd: entry.cwd,
        pid: 93143,
        startedAtMs,
        orcaPaneKey: null,
        tokens: null
      }
    ])
    expect(batch.transcripts.get(`claude:${lead}`)).toEqual({
      main: transcript,
      agents: [{ id: 'abc', path: leadAgent, size: 0, mtimeMs: 1000 }],
      // The teammate's own transcript, then those of the agents it spawned.
      teammates: new Map([[`lena-b0@${team}`, [mate, mateAgent]]])
    })
    // One process table serves every lead in the tick.
    expect(exec.mock.calls.filter(([program, args]) => isTableQuery(program, args))).toHaveLength(1)
  })
  it('keeps the lead when its team cannot be read, and says so', async () => {
    const io = fixtureIo(files)
    io.exec = async (program, args) => {
      if (isTableQuery(program, args)) throw new Error('timeout')
      return entry.procStart
    }
    const batch = await collectClaude([root], io, 2000)
    expect(batch.sessions[0].subagents).toEqual([
      { id: 'abc', type: 'Explore', activity: 'thinking' }
    ])
    expect(batch.sources[0]).toEqual({
      id: `claude:${root}`,
      ok: false,
      detail: 'team read failed'
    })
  })
  it('still says the team read failed when a later session of the same root reads fine', async () => {
    const io = fixtureIo({
      ...files,
      [join(root, 'sessions', '43.json')]: JSON.stringify({ ...entry, pid: 43, sessionId: 'plain' })
    })
    io.exec = async (program, args) => {
      if (isTableQuery(program, args)) throw new Error('timeout')
      return entry.procStart
    }
    const batch = await collectClaude([root], io, 2000)
    expect(batch.sessions.map((session) => session.sessionId)).toEqual([lead, 'plain'])
    expect(batch.sources[0]).toEqual({
      id: `claude:${root}`,
      ok: false,
      detail: 'team read failed'
    })
  })

  describe('a teammate whose lead has exited', () => {
    // The lead's registry file is gone; its roster and its teammate's process are not.
    const orphaned: Record<string, string | null> = { ...files }
    delete orphaned[file]
    const key = `claude:lena-b0@${team}`

    it('is shown as a session of its own, with its own process, folder and transcripts', async () => {
      const io = fixtureIo(orphaned)
      io.exec = tableOrStart
      const batch = await collectClaude([root], io, 2000)
      expect(batch.sessions).toHaveLength(1)
      expect(batch.sessions[0]).toMatchObject({
        key,
        provider: 'claude',
        pid: 93143,
        name: 'lena-b0',
        cwd: entry.cwd,
        projectLabel: 'repo',
        activity: 'thinking',
        attention: 'none',
        subagents: [],
        startedAtMs
      })
      expect(batch.transcripts.get(key)).toEqual({
        main: mate,
        agents: [{ id: 'xyz', path: mateAgent, size: 0, mtimeMs: 1000 }],
        teammates: new Map()
      })
      expect(batch.sources[0].ok).toBe(true)
    })

    it('is not shown twice while its lead lives', async () => {
      const io = fixtureIo(files)
      io.exec = tableOrStart
      const batch = await collectClaude([root], io, 2000)
      expect(batch.sessions.map((session) => session.key)).toEqual([`claude:${lead}`])
    })

    it('is looked for only under a parent id that is a session id', async () => {
      const io = fixtureIo(orphaned)
      const read = vi.spyOn(io, 'readText')
      io.exec = async (program, args) =>
        isTableQuery(program, args)
          ? hostTable([
              {
                pid: 93143,
                start: entry.procStart,
                command: '/versions/2.1.296 --agent-id x@y --parent-session-id ../../..'
              }
            ])
          : entry.procStart
      expect((await collectClaude([root], io, 2000)).sessions).toEqual([])
      expect(read.mock.calls.flat().every((path) => !path.includes('..'))).toBe(true)
      expect(read.mock.calls.flat().some((path) => path.includes(`${sep}teams${sep}`))).toBe(false)
    })

    it('is not guessed at while the registry itself cannot be read', async () => {
      const io = fixtureIo(orphaned)
      io.exec = tableOrStart
      const list = io.list
      io.list = async (path) => {
        if (path === join(root, 'sessions'))
          throw Object.assign(new Error('denied'), { code: 'EACCES' })
        return list(path)
      }
      const batch = await collectClaude([root], io, 2000)
      expect(batch.sessions).toEqual([])
      expect(batch.sources[0].ok).toBe(false)
    })
  })
})

describe('subagents', () => {
  const agents = hostPath('/t/subagents')
  const at = (...segments: string[]): string => join(agents, ...segments)
  const transcript = hostPath('/t.jsonl')

  it('keeps only fresh id and agent type, excluding descriptions', async () => {
    const io = fixtureIo({
      [at('agent-abc.meta.json')]: JSON.stringify({
        agentType: 'Explore',
        description: 'PRIVATE_DESCRIPTION'
      }),
      [at('agent-abc.jsonl')]: 'PRIVATE_TRANSCRIPT',
      [at('agent-old.meta.json')]: '{}'
    })
    const files = await listAgentFiles(transcript, io)
    expect(await liveSubagents(files, io, 2000)).toEqual([
      { id: 'abc', type: 'Explore', activity: 'thinking' }
    ])
    expect(await liveSubagents(files, io, 62000)).toEqual([])
  })
  it('shows what a subagent is doing from the open tool at the end of its transcript', async () => {
    const opened = (name: string) =>
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: `t-${name}`, name, input: {} }] }
      })
    const meta = JSON.stringify({ agentType: 'ravi' })
    const io = fixtureIo({
      [at('agent-e.meta.json')]: meta,
      [at('agent-e.jsonl')]: opened('Edit'),
      [at('agent-r.meta.json')]: meta,
      [at('agent-r.jsonl')]: opened('Read'),
      [at('agent-b.meta.json')]: meta,
      [at('agent-b.jsonl')]: opened('Bash')
    })
    const files = await listAgentFiles(transcript, io)
    expect(await liveSubagents(files, io, 2000)).toEqual([
      { id: 'b', type: 'ravi', activity: 'running' },
      { id: 'e', type: 'ravi', activity: 'editing' },
      { id: 'r', type: 'ravi', activity: 'reading' }
    ])
  })
  it('keeps a quiet subagent live while a tool it opened is still running, up to a cap', async () => {
    const io = fixtureIo({
      [at('agent-b.meta.json')]: JSON.stringify({ agentType: 'ravi' }),
      [at('agent-b.jsonl')]: JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] }
      }),
      [at('agent-q.meta.json')]: JSON.stringify({ agentType: 'maya' }),
      [at('agent-q.jsonl')]: 'PRIVATE_TRANSCRIPT'
    })
    const files = await listAgentFiles(transcript, io)
    expect(await liveSubagents(files, io, 1000 + 5 * 60_000)).toEqual([
      { id: 'b', type: 'ravi', activity: 'running' }
    ])
    expect(await liveSubagents(files, io, 1000 + 16 * 60_000)).toEqual([])
  })
  it('reads nothing more for a held subagent whose transcript has not moved', async () => {
    const io = fixtureIo({
      [at('agent-b.meta.json')]: JSON.stringify({ agentType: 'ravi' }),
      [at('agent-b.jsonl')]: JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] }
      })
    })
    const files = await listAgentFiles(transcript, io)
    await liveSubagents(files, io, 1000 + 5 * 60_000)
    const stat = vi.spyOn(io, 'stat')
    const readText = vi.spyOn(io, 'readText')
    const readTail = vi.spyOn(io, 'readTail')
    expect(await liveSubagents(files, io, 1000 + 6 * 60_000)).toEqual([
      { id: 'b', type: 'ravi', activity: 'running' }
    ])
    expect([stat, readText, readTail].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0])
  })
  it('keeps a subagent written a moment after the tick began', async () => {
    const io = fixtureIo({
      [at('agent-a.meta.json')]: JSON.stringify({ agentType: 'ravi' }),
      [at('agent-a.jsonl')]: 'x'
    })
    const files = await listAgentFiles(transcript, io)
    expect(await liveSubagents(files, io, 0)).toEqual([
      { id: 'a', type: 'ravi', activity: 'thinking' }
    ])
  })
  it('finds workflow agents beside plain ones and skips journals and stray files', async () => {
    const meta = (agentType: string) => JSON.stringify({ agentType })
    const io = fixtureIo({
      [at('agent-abc.meta.json')]: meta('Explore'),
      [at('agent-abc.jsonl')]: 'four',
      [at('agent-abc.forked-skill.json')]: '{}',
      [at('workflows', 'wf_1', 'agent-def.meta.json')]: meta('general-purpose'),
      [at('workflows', 'wf_1', 'agent-def.jsonl')]: 'sixsix',
      [at('workflows', 'wf_1', 'journal.jsonl')]: 'PRIVATE_JOURNAL',
      [at('workflows', 'stray')]: 'not a folder'
    })
    const files = await listAgentFiles(transcript, io)
    expect(files).toEqual([
      { id: 'abc', path: at('agent-abc.jsonl'), size: 4, mtimeMs: 1000 },
      { id: 'def', path: at('workflows', 'wf_1', 'agent-def.jsonl'), size: 6, mtimeMs: 1000 }
    ])
    expect(await liveSubagents(files, io, 2000)).toEqual([
      { id: 'abc', type: 'Explore', activity: 'thinking' },
      { id: 'def', type: 'general-purpose', activity: 'thinking' }
    ])
    expect(await listAgentFiles(hostPath('/none.jsonl'), io)).toEqual([])
  })
})

const company = hostPath('/company/repo')
const worktree = join(company, '.claude', '.worktree', 'task')
it.each([company, worktree])('keeps main project and company identity for %s', async (cwd) => {
  const io = fixtureIo({
    [join(company, '.git')]: null,
    [join(worktree, '.git')]: `gitdir: ${gitPath(join(company, '.git', 'worktrees', 'task'))}\n`,
    [join(root, 'sessions', '42.json')]: JSON.stringify({ ...registryEntry(process.platform), cwd })
  })
  io.exec = async () => registryEntry(process.platform).procStart
  const batch = await collectClaude([root], io, 1000)
  expect(batch.sessions[0]).toMatchObject({
    projectRoot: company,
    projectLabel: 'repo',
    companyLabel: 'company',
    worktree: cwd === company ? null : cwd
  })
})

describe.each([
  {
    platform: 'darwin' as const,
    root: '/claude',
    cwd: '/repo',
    start: 'Sat Oct 10 15:29:12 2026',
    table: (pid: number, start: string) => `${pid} ${start} /bin/claude\n`
  },
  {
    platform: 'win32' as const,
    root: 'C:\\claude',
    cwd: 'C:\\repo',
    start: '134361197520000000',
    table: (pid: number, start: string) => windowsTableLine(pid, start, 'claude.exe')
  }
])('a $platform registry, wherever the bridge runs', ({ platform, root, cwd, start, table }) => {
  const own = { ...registryEntry(process.platform), cwd, procStart: start }
  const files = {
    [`${root}/sessions/42.json`]: JSON.stringify(own),
    [`${cwd}/.git`]: null
  }
  const exec = (output: string) => async (program: string, args: string[]) =>
    program === (platform === 'win32' ? POWERSHELL : '/bin/ps') && !args.includes('lstart=')
      ? output
      : ''

  it('proves its session live with that platform’s own process table', async () => {
    const io = fixtureIo(files)
    io.exec = exec(table(42, start))
    const batch = await collectClaude([root], io, 1000, undefined, undefined, platform)
    expect(batch.sessions.map((session) => [session.sessionId, session.projectRoot])).toEqual([
      ['a', cwd]
    ])
  })
  it('drops it when that table lists its pid under another start', async () => {
    const io = fixtureIo(files)
    io.exec = exec(table(42, `${start.slice(0, -1)}9`))
    const batch = await collectClaude([root], io, 1000, undefined, undefined, platform)
    expect(batch.sessions).toEqual([])
  })
})

describe('a Windows registry', () => {
  const root = 'C:\\claude-win'
  const startedAtMs = Date.parse('Sat Oct 10 15:29:12 2026 UTC')
  const filetime = '134361197520000000'
  const ticks = '639272429520000000'
  const files = (procStart: string) => ({
    [`${root}\\sessions\\42.json`]: JSON.stringify({ ...registryEntry('win32'), procStart }),
    'C:\\repo\\.git': null
  })
  const timedOut = (): Error =>
    Object.assign(new Error('timed out'), { killed: true, code: null, signal: 'SIGTERM' })
  const collect = (io: ReturnType<typeof fixtureIo>, now: number) =>
    collectClaude([root], io, now, undefined, undefined, 'win32')

  it.each([
    ['a FILETIME', filetime, '134361197520000009\r\n', 'GetProcessById(42)'],
    ['a CreationDate ticks', ticks, '', '"ProcessId=42"']
  ])(
    'asks about %s record proven gone only once, until its file goes',
    async (_format, start, answer, query) => {
      const tree: Record<string, string | null> = files(start)
      const io = fixtureIo(tree)
      const asked = vi.fn(async (_program: string, args: string[]) =>
        args.at(-1) === WINDOWS_PROCESS_TABLE_SCRIPT ? '' : answer
      )
      io.exec = asked
      const queries = () => asked.mock.calls.filter(([, args]) => args.at(-1)?.includes(query))
      expect((await collect(io, 1000)).sessions).toEqual([])
      expect((await collect(io, 3000)).sessions).toEqual([])
      expect(queries()).toHaveLength(1)
      const record = `${root}\\sessions\\42.json`
      const content = tree[record]
      delete tree[record]
      await collect(io, 5000)
      tree[record] = content
      await collect(io, 7000)
      expect(queries()).toHaveLength(2)
    }
  )
  it('asks again about a record it could not prove gone', async () => {
    const io = fixtureIo(files(filetime))
    const asked = vi.fn(async (_program: string, args: string[]) => {
      if (args.at(-1) === WINDOWS_PROCESS_TABLE_SCRIPT) return ''
      throw timedOut()
    })
    io.exec = asked
    await collect(io, 1000)
    await collect(io, 3000)
    expect(
      asked.mock.calls.filter(([, args]) => args.at(-1)?.includes('GetProcessById(42)'))
    ).toHaveLength(2)
  })

  it.each([
    ['a FILETIME', filetime],
    ['a CreationDate ticks', ticks]
  ])('dates a session from %s record by when its process started', async (_format, start) => {
    const io = fixtureIo(files(start))
    io.exec = async (_program, args) =>
      args.at(-1) === WINDOWS_PROCESS_TABLE_SCRIPT
        ? windowsTableLine(42, filetime, 'claude.exe', ticks)
        : ''
    expect((await collect(io, 1000)).sessions.map((session) => session.startedAtMs)).toEqual([
      startedAtMs
    ])
  })
  it('dates a session the table does not list from the FILETIME its record carries', async () => {
    const io = fixtureIo(files(filetime))
    io.exec = async (_program, args) =>
      args.at(-1) === WINDOWS_PROCESS_TABLE_SCRIPT ? '' : `${filetime}\r\n`
    expect((await collect(io, 1000)).sessions.map((session) => session.startedAtMs)).toEqual([
      startedAtMs
    ])
  })
  it('dates a ticks session the table does not list by the start CIM gives with its ticks', async () => {
    const io = fixtureIo(files(ticks))
    io.exec = async (_program, args) =>
      args.at(-1) === WINDOWS_PROCESS_TABLE_SCRIPT ? '' : `${ticks} ${filetime}\r\n`
    expect((await collect(io, 1000)).sessions.map((session) => session.startedAtMs)).toEqual([
      startedAtMs
    ])
  })
  it('keeps a session it saw live while PowerShell cannot answer, and says the check failed', async () => {
    const io = fixtureIo(files(filetime))
    let isAnswering = true
    io.exec = async (_program, args) => {
      if (!isAnswering) throw timedOut()
      return args.at(-1) === WINDOWS_PROCESS_TABLE_SCRIPT
        ? windowsTableLine(42, filetime, 'claude.exe')
        : ''
    }
    expect((await collect(io, 1000)).sessions).toHaveLength(1)
    isAnswering = false
    const batch = await collect(io, 3000)
    expect(batch.sessions.map((session) => session.sessionId)).toEqual(['a'])
    expect(batch.sources[0]).toMatchObject({ ok: false, detail: 'liveness unknown' })
  })
  it('shows no session it never saw live while PowerShell cannot answer', async () => {
    const io = fixtureIo(files(filetime))
    io.exec = async () => {
      throw timedOut()
    }
    const batch = await collect(io, 1000)
    expect(batch.sessions).toEqual([])
    expect(batch.sources[0].ok).toBe(false)
  })
})
