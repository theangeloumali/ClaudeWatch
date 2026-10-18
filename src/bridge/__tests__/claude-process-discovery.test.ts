import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { fixtureIo, registryEntry } from '../__fixtures__/helpers'
import { OPEN_TOOL_HOLD_MS } from '../liveness'
import { parseProcessTable, type ProcessRow } from '../process-table'
import { collectClaude } from '../registry'
import { projectSlug } from '../transcript-tail'

const ROOT = '/claude'
const OTHER_ROOT = '/other-claude'
const CWD = '/repo'
const START = 'Thu Oct 15 11:50:00 2026'
const NOW = Date.parse('2026-10-15T12:00:00Z')
const LEAD = 'dd4b3ece-31f8-4994-9914-57d4cc5dc03c'
const REGISTRY_SENTINEL = join(ROOT, 'sessions', '.keep')

function nativeProcess(pid: number, command = 'claude'): ProcessRow {
  const [process] = parseProcessTable(`${pid} ${START} ${command}`)
  if (!process) throw new Error('Invalid process fixture')
  return process
}

// dry-new: mutable process and transcript fixtures exercise discovery across collector ticks.
function discoveryFixture(processes: ProcessRow[]) {
  const files: Record<string, string | null> = {
    [REGISTRY_SENTINEL]: '',
    [join(CWD, '.git')]: null,
    '/other/.git': null
  }
  const stamps = new Map<string, number>()
  const state = { processes, folders: new Map(processes.map(({ pid }) => [pid, CWD])) }
  const io = fixtureIo(files)
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), mtimeMs: stamps.get(path) ?? 1000 })
  io.exec = vi.fn(async (program: string, args: string[]) => {
    const pid = Number(args[args.indexOf('-p') + 1])
    if (program.endsWith('lsof')) {
      const cwd = state.folders.get(pid)
      return cwd ? `p${pid}\nn${cwd}\n` : ''
    }
    if (program.endsWith('ps'))
      return state.processes.find((process) => process.pid === pid)?.lstart ?? ''
    throw new Error(`Unexpected fixture program: ${program}`)
  })
  const readText = vi.spyOn(io, 'readText')
  const readProcesses = vi.fn(async () => state.processes)
  const collect = (atMs = NOW, roots = [ROOT]) =>
    collectClaude(roots, io, atMs, undefined, readProcesses, 'darwin')
  const register = (process: ProcessRow, session: { id: string; root?: string }): void => {
    files[join(session.root ?? ROOT, 'sessions', `${process.pid}.json`)] = JSON.stringify({
      ...registryEntry('darwin'),
      pid: process.pid,
      procStart: process.lstart,
      sessionId: session.id,
      cwd: state.folders.get(process.pid),
      updatedAtMs: NOW - 1000
    })
  }
  const addFamily = (
    sessionId: string,
    options: { root?: string; children?: number; atMs?: number } = {}
  ): string => {
    const directory = join(options.root ?? ROOT, 'projects', projectSlug(CWD))
    const transcript = join(directory, `${sessionId}.jsonl`)
    files[transcript] = `${JSON.stringify({
      type: 'assistant',
      sessionId,
      cwd: CWD,
      timestamp: new Date(options.atMs ?? NOW - 1000).toISOString(),
      message: { content: [{ type: 'text', text: 'PRIVATE_TRANSCRIPT_TEXT' }] }
    })}\n`
    stamps.set(transcript, options.atMs ?? NOW - 1000)
    for (let index = 0; index < (options.children ?? 0); index++) {
      const child = join(directory, sessionId, 'subagents', `agent-child-${index}.jsonl`)
      files[child] = `${JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: `tool-${index}`, name: 'Read', input: {} }] }
      })}\n`
      files[child.replace(/\.jsonl$/, '.meta.json')] = '{"agentType":"Explore"}'
      stamps.set(child, NOW - 1000)
    }
    return transcript
  }
  return { files, stamps, state, io, collect, register, addFamily, readText, readProcesses }
}

it('finds the unregistered resumed lead and its 15 children beside three registered leads', async () => {
  const lead = nativeProcess(60345, `claude --resume ${LEAD}`)
  const registered = [42, 43, 44].map((pid) => nativeProcess(pid))
  const fixture = discoveryFixture([...registered, lead])
  for (const process of registered) fixture.register(process, { id: `registered-${process.pid}` })
  const transcript = fixture.addFamily(LEAD, { children: 15 })

  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(4)
  const discovered = batch.sessions.find((session) => session.pid === lead.pid)
  expect(discovered).toMatchObject({ provider: 'claude', sessionId: LEAD, cwd: CWD })
  expect(discovered?.subagents).toHaveLength(15)
  expect(new Set(discovered?.subagents.map((agent) => agent.id)).size).toBe(15)
  expect(batch.transcripts.get(discovered?.key ?? '')?.main).toBe(transcript)
  expect(batch.transcripts.get(discovered?.key ?? '')?.agents).toHaveLength(15)
  expect(fixture.readProcesses).toHaveBeenCalledTimes(1)
  expect(fixture.readText.mock.calls.some(([path]) => path.endsWith('.jsonl'))).toBe(false)
  expect(JSON.stringify(batch.sessions)).not.toContain('PRIVATE_TRANSCRIPT_TEXT')
})

it('discovers an explicit session even when the registry folder does not exist', async () => {
  const fixture = discoveryFixture([nativeProcess(60345, `claude --resume ${LEAD}`)])
  delete fixture.files[REGISTRY_SENTINEL]
  fixture.addFamily(LEAD, { children: 1 })
  const batch = await fixture.collect()
  expect(batch.sessions).toMatchObject([{ pid: 60345, sessionId: LEAD }])
  expect(batch.sessions[0]?.subagents).toHaveLength(1)
})

it.each(['--resume', '--resume=', '--session-id', '--session-id='])(
  'uses the explicit %s session claim of a full-path native CLI',
  async (flag) => {
    const argument = flag.endsWith('=') ? `${flag}${LEAD}` : `${flag} ${LEAD}`
    const fixture = discoveryFixture([nativeProcess(60345, `/opt/bin/claude ${argument}`)])
    fixture.addFamily(LEAD)
    fixture.addFamily('newer-unrelated', { atMs: NOW })
    expect((await fixture.collect()).sessions).toMatchObject([{ pid: 60345, sessionId: LEAD }])
  }
)

it('discovers a non-resumed native CLI from its proven cwd and fresh matching transcript', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  const transcript = fixture.addFamily('fresh-session', { children: 2 })
  const batch = await fixture.collect()
  expect(batch.sessions).toMatchObject([{ pid: 19502, sessionId: 'fresh-session', cwd: CWD }])
  expect(batch.sessions[0]?.subagents).toHaveLength(2)
  expect(batch.transcripts.get(batch.sessions[0]?.key ?? '')?.main).toBe(transcript)
})

it('shows an unmatched native CLI without borrowing a historical parent or its fresh children', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily('historical-session', { children: 3, atMs: NOW - OPEN_TOOL_HOLD_MS - 1 })
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]).toMatchObject({ pid: 19502, cwd: CWD, subagents: [] })
  expect(batch.sessions[0]?.sessionId).not.toBe('historical-session')
  expect(batch.transcripts.has(batch.sessions[0]?.key ?? '')).toBe(false)
})

it('does not guess a non-resumed CLI session when its working directory cannot be proven', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily(LEAD, { children: 3 })
  fixture.state.folders.delete(19502)
  const batch = await fixture.collect()
  expect(batch.sessions.some((session) => session.sessionId === LEAD)).toBe(false)
  expect(batch.sessions.every((session) => session.subagents.length === 0)).toBe(true)
  expect(batch.transcripts.size).toBe(0)
})

it('keeps a proven native process as an honest placeholder when transcript discovery cannot read it', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  const transcript = fixture.addFamily(LEAD, { children: 3 })
  const readFrom = fixture.io.readFrom
  fixture.io.readFrom = async (path, offset, maxBytes) => {
    if (path === transcript) throw Object.assign(new Error('denied'), { code: 'EACCES' })
    return readFrom(path, offset, maxBytes)
  }
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]).toMatchObject({ pid: 19502, cwd: CWD, subagents: [] })
  expect(batch.sessions[0]?.sessionId).not.toBe(LEAD)
  expect(batch.sources.some((source) => !source.ok)).toBe(true)
  expect(batch.transcripts.size).toBe(0)
})

it('rejects an invalid explicit claim instead of borrowing a fresh session in the same cwd', async () => {
  const fixture = discoveryFixture([nativeProcess(19502, 'claude --resume ../../unsafe')])
  fixture.addFamily(LEAD, { children: 3 })
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]).toMatchObject({ pid: 19502, subagents: [] })
  expect(batch.sessions[0]?.sessionId).not.toBe(LEAD)
  expect(batch.transcripts.size).toBe(0)
})

it('rejects a transcript ID with a trailing newline rather than attaching its children', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily('unsafe\n', { children: 2 })
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]?.sessionId).not.toBe('unsafe\n')
  expect(batch.sessions[0]?.subagents).toEqual([])
  expect(batch.transcripts.size).toBe(0)
})

it('does not claim an older transcript merely because its file and children were written recently', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  const transcript = fixture.addFamily(LEAD, {
    children: 3,
    atMs: NOW - OPEN_TOOL_HOLD_MS - 1
  })
  fixture.stamps.set(transcript, NOW - 1000)
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]?.sessionId).not.toBe(LEAD)
  expect(batch.sessions[0]?.subagents).toEqual([])
  expect(batch.transcripts.size).toBe(0)
})

it('does not use a teammate transcript as the unregistered native lead', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  const transcript = fixture.addFamily(LEAD, { children: 2 })
  fixture.files[transcript] +=
    `${JSON.stringify({ teamName: 'session-other', agentName: 'worker' })}\n`
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]?.sessionId).not.toBe(LEAD)
  expect(batch.sessions[0]?.subagents).toEqual([])
})

it('reserves explicit claims before matching another lead in the same cwd across duplicate roots', async () => {
  const fixture = discoveryFixture([
    nativeProcess(60345, `claude --resume ${LEAD}`),
    nativeProcess(19502)
  ])
  for (const root of [ROOT, OTHER_ROOT]) {
    fixture.addFamily(LEAD, { root, children: 1, atMs: NOW })
    fixture.addFamily('fresh-session', { root, children: 2, atMs: NOW - 1000 })
  }
  const batch = await fixture.collect(NOW, [ROOT, OTHER_ROOT, ROOT])
  expect(batch.sessions).toHaveLength(2)
  expect(
    Object.fromEntries(batch.sessions.map((session) => [session.pid, session.sessionId]))
  ).toEqual({
    60345: LEAD,
    19502: 'fresh-session'
  })
  expect(batch.sessions.find((session) => session.pid === 60345)?.subagents).toHaveLength(1)
  expect(batch.sessions.find((session) => session.pid === 19502)?.subagents).toHaveLength(2)
  expect(batch.transcripts.size).toBe(2)
})

it('does not duplicate a discovered lead or its children when registry entries later appear', async () => {
  const process = nativeProcess(60345, `claude --resume ${LEAD}`)
  const fixture = discoveryFixture([process])
  fixture.addFamily(LEAD, { children: 2 })
  const before = await fixture.collect()
  expect(before.sessions).toHaveLength(1)
  fixture.register(process, { id: LEAD })
  fixture.register(process, { id: LEAD, root: OTHER_ROOT })
  const after = await fixture.collect(NOW + 1000, [ROOT, OTHER_ROOT])
  expect(after.sessions).toHaveLength(1)
  expect(after.sessions[0]?.key).toBe(before.sessions[0]?.key)
  expect(after.sessions[0]?.subagents).toHaveLength(2)
  expect(after.transcripts.size).toBe(1)
})

it('keeps a placeholder key through transcript discovery and registry arrival without rereading unchanged heads', async () => {
  const process = nativeProcess(19502)
  const fixture = discoveryFixture([process])
  const readFrom = vi.spyOn(fixture.io, 'readFrom')
  const before = await fixture.collect()
  expect(before.sessions).toHaveLength(1)
  fixture.addFamily(LEAD, { children: 1 })
  const discovered = await fixture.collect(NOW + 1000)
  expect(discovered.sessions).toHaveLength(1)
  expect(discovered.sessions[0]).toMatchObject({ key: before.sessions[0]?.key, sessionId: LEAD })
  expect(readFrom).toHaveBeenCalledTimes(1)
  await fixture.collect(NOW + 2000)
  expect(readFrom).toHaveBeenCalledTimes(1)
  fixture.register(process, { id: LEAD })
  const registered = await fixture.collect(NOW + 3000)
  expect(registered.sessions).toHaveLength(1)
  expect(registered.sessions[0]).toMatchObject({ key: before.sessions[0]?.key, sessionId: LEAD })
  expect(registered.transcripts.has(before.sessions[0]?.key ?? '')).toBe(true)
})

it('rediscovers a reset conversation without inheriting the old conversation children', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily(LEAD, { children: 2 })
  expect((await fixture.collect()).sessions[0]?.sessionId).toBe(LEAD)
  fixture.addFamily('reset-session', { children: 1, atMs: NOW + 30_000 })
  const after = await fixture.collect(NOW + 31_000)
  expect(after.sessions).toHaveLength(1)
  expect(after.sessions[0]?.sessionId).toBe('reset-session')
  expect(after.sessions[0]?.subagents).toHaveLength(1)
})

it('removes an exited terminal lead despite its still-fresh transcript and children', async () => {
  const fixture = discoveryFixture([nativeProcess(60345, `claude --resume ${LEAD}`)])
  fixture.addFamily(LEAD, { children: 2 })
  expect((await fixture.collect()).sessions).toHaveLength(1)
  fixture.state.processes = []
  const after = await fixture.collect(NOW + 1000)
  expect(after.sessions).toEqual([])
  expect(after.transcripts.size).toBe(0)
})

it('resets a reused PID instead of inheriting its previous cwd, identity or children', async () => {
  const fixture = discoveryFixture([nativeProcess(60345, `claude --resume ${LEAD}`)])
  fixture.addFamily(LEAD, { children: 2 })
  const before = await fixture.collect()
  expect(before.sessions).toHaveLength(1)
  fixture.state.processes = parseProcessTable('60345 Thu Oct 15 12:00:02 2026 claude')
  fixture.state.folders.set(60345, '/other')
  const after = await fixture.collect(NOW + 3000)
  expect(after.sessions).toHaveLength(1)
  expect(after.sessions[0]).toMatchObject({
    pid: 60345,
    startedAtMs: NOW + 2000,
    cwd: '/other',
    subagents: []
  })
  expect(after.sessions[0]?.sessionId).not.toBe(LEAD)
  expect(after.sessions[0]?.key).not.toBe(before.sessions[0]?.key)
})

it('excludes Chrome native hosts and non-Claude processes even when their cwd has a fresh transcript', async () => {
  const fixture = discoveryFixture([
    nativeProcess(60345, `claude --resume ${LEAD}`),
    nativeProcess(11, 'claude --chrome-native-host'),
    nativeProcess(12, '/opt/bin/claude --chrome-native-host'),
    nativeProcess(13, `node server.js --resume ${LEAD}`),
    nativeProcess(14, `not-claude --resume ${LEAD}`),
    nativeProcess(15, `sh -c claude --resume ${LEAD}`),
    nativeProcess(16, 'claude doctor'),
    nativeProcess(17, `/Applications/Host.app/Contents/MacOS/claude --resume ${LEAD}`),
    nativeProcess(18, `claude --agent-id child@team --parent-session-id ${LEAD}`),
    nativeProcess(19, `claude.cmd --resume ${LEAD}`)
  ])
  fixture.addFamily(LEAD, { children: 1 })
  const batch = await fixture.collect()
  expect(batch.sessions.map((session) => session.pid)).toEqual([60345])
})

it('does not invent completed stale children under a discovered lead', async () => {
  const fixture = discoveryFixture([nativeProcess(60345, `claude --resume ${LEAD}`)])
  const transcript = fixture.addFamily(LEAD, { children: 2 })
  const completed = join(transcript.slice(0, -6), 'subagents', 'agent-child-1.jsonl')
  fixture.files[completed] += `${JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'done' }] }
  })}\n`
  fixture.stamps.set(completed, NOW - OPEN_TOOL_HOLD_MS - 1)
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]?.subagents.map((agent) => agent.id)).toEqual(['child-0'])
})

it('never promotes fresh orphan transcripts to leads without a live native CLI', async () => {
  const fixture = discoveryFixture([])
  fixture.addFamily(LEAD, { children: 15 })
  const batch = await fixture.collect()
  expect(batch.sessions).toEqual([])
  expect(batch.transcripts.size).toBe(0)
})

it('does not assign interchangeable anonymous processes to conversations by recency alone', async () => {
  const fixture = discoveryFixture([nativeProcess(19502), nativeProcess(19503)])
  fixture.addFamily('first-conversation', { children: 2, atMs: NOW - 1000 })
  fixture.addFamily('second-conversation', { children: 3, atMs: NOW })
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(2)
  expect(batch.sessions.every((session) => session.subagents.length === 0)).toBe(true)
  expect(batch.transcripts.size).toBe(0)
})

it('does not guess which anonymous process owns the only fresh conversation in a shared cwd', async () => {
  const fixture = discoveryFixture([nativeProcess(19502), nativeProcess(19503)])
  fixture.addFamily('unproven-owner', { children: 3 })
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(2)
  expect(batch.sessions.every((session) => session.subagents.length === 0)).toBe(true)
  expect(batch.transcripts.size).toBe(0)
})

it('leaves one anonymous process unassigned when multiple fresh conversations could belong to it', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily('first-conversation', { children: 2, atMs: NOW - 1000 })
  fixture.addFamily('second-conversation', { children: 3, atMs: NOW })
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]?.subagents).toEqual([])
  expect(batch.transcripts.size).toBe(0)
})

it('keeps a retained claim and gives an interchangeable newcomer no borrowed conversation', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily(LEAD, { children: 2 })
  expect((await fixture.collect()).sessions[0]?.sessionId).toBe(LEAD)
  fixture.state.processes.push(nativeProcess(19503))
  fixture.state.folders.set(19503, CWD)
  fixture.addFamily('unproven-new-conversation', { children: 3, atMs: NOW + 30_000 })
  const after = await fixture.collect(NOW + 31_000)
  expect(after.sessions).toHaveLength(2)
  expect(after.sessions.find((session) => session.pid === 19502)).toMatchObject({ sessionId: LEAD })
  expect(after.sessions.find((session) => session.pid === 19502)?.subagents).toHaveLength(2)
  expect(after.sessions.find((session) => session.pid === 19503)?.subagents).toEqual([])
  expect(after.transcripts.size).toBe(1)
})

it('keeps unique ownership in a proven cwd when another anonymous process runs elsewhere', async () => {
  const fixture = discoveryFixture([nativeProcess(19502), nativeProcess(19503)])
  fixture.state.folders.set(19503, '/other')
  fixture.addFamily(LEAD, { children: 15 })
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(2)
  expect(batch.sessions.find((session) => session.pid === 19502)?.sessionId).toBe(LEAD)
  expect(batch.sessions.find((session) => session.pid === 19502)?.subagents).toHaveLength(15)
  expect(batch.sessions.find((session) => session.pid === 19503)?.subagents).toEqual([])
})

it('does not assume an unlocated anonymous competitor belongs to a different cwd', async () => {
  const fixture = discoveryFixture([nativeProcess(19502), nativeProcess(19503)])
  fixture.state.folders.delete(19503)
  fixture.addFamily(LEAD, { children: 3 })
  const batch = await fixture.collect()
  expect(batch.sessions.some((session) => session.pid === 19502)).toBe(true)
  expect(batch.sessions.every((session) => session.subagents.length === 0)).toBe(true)
  expect(batch.transcripts.size).toBe(0)
})

it('does not infer uniqueness from a truncated candidate window', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily(LEAD, { children: 2 })
  for (let index = 0; index < 512; index++)
    fixture.addFamily(`history-${index}`, { atMs: NOW - OPEN_TOOL_HOLD_MS - 1 })
  const stat = vi.spyOn(fixture.io, 'stat')
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]?.subagents).toEqual([])
  expect(batch.transcripts.size).toBe(0)
  expect(stat.mock.calls.filter(([path]) => path.endsWith('.jsonl')).length).toBeLessThanOrEqual(
    512
  )
})

it('does not infer uniqueness when another possible conversation cannot be read', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily(LEAD, { children: 2 })
  const unreadable = fixture.addFamily('unreadable-conversation', { children: 3 })
  const readFrom = fixture.io.readFrom
  fixture.io.readFrom = async (path, offset, maxBytes) => {
    if (path === unreadable) throw Object.assign(new Error('denied'), { code: 'EACCES' })
    return readFrom(path, offset, maxBytes)
  }
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]?.subagents).toEqual([])
  expect(batch.transcripts.size).toBe(0)
  expect(batch.sources.some((source) => !source.ok)).toBe(true)
})

it('does not count a proven teammate transcript as another possible lead conversation', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  fixture.addFamily(LEAD, { children: 15 })
  const teammate = fixture.addFamily('teammate-conversation')
  fixture.files[teammate] +=
    `${JSON.stringify({ teamName: 'session-other', agentName: 'worker' })}\n`
  const batch = await fixture.collect()
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]?.sessionId).toBe(LEAD)
  expect(batch.sessions[0]?.subagents).toHaveLength(15)
})

it('does not reset a retained conversation back to older history after a fresh file touch', async () => {
  const fixture = discoveryFixture([nativeProcess(19502)])
  const older = fixture.addFamily(LEAD, { children: 2 })
  expect((await fixture.collect()).sessions[0]?.sessionId).toBe(LEAD)
  fixture.addFamily('reset-session', { children: 1, atMs: NOW + 30_000 })
  expect((await fixture.collect(NOW + 31_000)).sessions[0]?.sessionId).toBe('reset-session')
  fixture.stamps.set(older, NOW + 90_000)
  const after = await fixture.collect(NOW + 91_000)
  expect(after.sessions).toHaveLength(1)
  expect(after.sessions[0]?.sessionId).toBe('reset-session')
  expect(after.sessions[0]?.subagents).toHaveLength(1)
})
