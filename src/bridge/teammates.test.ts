import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import {
  parseProcessTable,
  parseWindowsProcessTable,
  PROCESS_TABLE_ARGS,
  WINDOWS_PROCESS_TABLE_SCRIPT
} from './process-table'
import { teammateProcesses, TeammateSource, type TeammateProcess } from './teammates'
import { projectSlug } from './transcript-tail'
import { fixtureIo, hostPath, windowsTableLine } from './__fixtures__/helpers'

const lead = '6a654bca-1111-2222-3333-444444444444'
const team = 'session-6a654bca'
const start = 'Sun Oct 11 11:45:19 2026'
const startedAtMs = Date.parse(`${start} UTC`)
const root = hostPath('/claude')
const repo = hostPath('/work/repo')
const roster = join(root, 'teams', team, 'config.json')
const folder = join(root, 'projects', projectSlug(repo))
const inFolder = (...segments: string[]): string => join(folder, ...segments)

function member(name: string, extra: Record<string, unknown> = {}) {
  return {
    agentId: `${name}@${team}`,
    name,
    agentType: name.split('-')[0],
    joinedAt: 5000,
    tmuxPaneId: '%17',
    cwd: repo,
    backendType: 'tmux',
    prompt: 'CANARY_PROMPT',
    ...extra
  }
}
function config(members: unknown[], leadSessionId = lead): string {
  return JSON.stringify({
    name: team,
    createdAt: 1000,
    leadAgentId: `team-lead@${team}`,
    leadSessionId,
    members: [
      {
        agentId: `team-lead@${team}`,
        name: 'team-lead',
        agentType: 'team-lead',
        cwd: repo
      },
      ...members
    ]
  })
}
const alive = (name: string, pid: number, parentSessionId = lead): TeammateProcess => ({
  pid,
  startedAtMs,
  agentId: `${name}@${team}`,
  parentSessionId
})
const record = (value: Record<string, unknown>): string => `${JSON.stringify(value)}\n`
// As on disk: small setting records, then a large first record that names the team and agent.
function transcript(name: string, tail = ''): string {
  return (
    record({ type: 'agent-setting', agentSetting: 'x' }) +
    record({ type: 'mode', mode: 'default' }) +
    record({
      type: 'attachment',
      teamName: team,
      agentName: name,
      attachment: { text: 'CANARY_ATTACHMENT'.repeat(5000) }
    }) +
    tail
  )
}
// How many times the project folder itself was listed, which is what a transcript search costs.
const searches = (list: { mock: { calls: unknown[][] } }): number =>
  list.mock.calls.filter(([path]) => path === folder).length
const toolUse = record({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: 'CANARY_INPUT' }] }
})

it('reads agent id and parent session from process rows and nothing else', () => {
  const rows = [
    `93143 ${start} /versions/2.1.296 --agent-id lena-b0@${team} --agent-name lena-b0 --team-name ${team} --agent-color blue --parent-session-id ${lead} --agent-type lena --model opus SECRET=hidden`,
    `93144 ${start} /versions/2.1.296 --agent-id orphan@${team}`,
    `93145 ${start} /versions/2.1.296 --parent-session-id ${lead}`,
    `93146 ${start} /versions/2.1.296 --resume`
  ].join('\n')
  expect(teammateProcesses(parseProcessTable(rows))).toEqual([
    { pid: 93143, startedAtMs, agentId: `lena-b0@${team}`, parentSessionId: lead }
  ])
})

it('keeps roster members whose process is alive under this lead, as teammates', async () => {
  const io = fixtureIo({
    [roster]: config([member('lena-b0'), member('ravi-b4'), member('kai-b6')])
  })
  const source = new TeammateSource(io)
  const processes = async () => [
    alive('lena-b0', 93143),
    alive('kai-b6', 93150, 'another-lead-session'),
    alive('stranger', 93151)
  ]
  const teammates = await source.collect(root, lead, repo, processes, 6000)
  expect(teammates).toEqual([
    {
      transcripts: [],
      ref: {
        id: `lena-b0@${team}`,
        type: 'lena',
        activity: 'thinking',
        kind: 'teammate',
        name: 'lena-b0',
        cwd: repo,
        pid: 93143,
        startedAtMs,
        orcaPaneKey: null,
        tokens: null
      }
    }
  ])
  expect(JSON.stringify(teammates)).not.toContain('CANARY')
})

it('does not look at processes when the session leads no team, or the roster is another lead’s', async () => {
  const processes = vi.fn(async () => [alive('lena-b0', 93143)])
  expect(await new TeammateSource(fixtureIo()).collect(root, lead, repo, processes, 6000)).toEqual(
    []
  )
  const io = fixtureIo({ [roster]: config([member('lena-b0')], '6a654bca-ffff-other-lead') })
  expect(await new TeammateSource(io).collect(root, lead, repo, processes, 6000)).toEqual([])
  const broken = fixtureIo({ [roster]: '{' })
  expect(await new TeammateSource(broken).collect(root, lead, repo, processes, 6000)).toEqual([])
  expect(processes).not.toHaveBeenCalled()
})

it('skips roster members with unsafe ids or names', async () => {
  const io = fixtureIo({
    [roster]: config([
      member('lena-b0', { agentId: '../../etc@x y' }),
      member('ravi-b4', { name: 42 }),
      member('kai-b6', { agentType: null }),
      'not an object'
    ])
  })
  const processes = async () => [alive('ravi-b4', 1), alive('kai-b6', 2)]
  expect(await new TeammateSource(io).collect(root, lead, repo, processes, 6000)).toEqual([])
})

it('ties a teammate to the newest transcript naming its team and agent, and reads activity from its tail', async () => {
  const files: Record<string, string> = {
    [roster]: config([member('lena-b0')]),
    [inFolder('old.jsonl')]: transcript('lena-b0'),
    [inFolder('mine.jsonl')]: transcript('lena-b0', toolUse),
    [inFolder('newer-other-agent.jsonl')]: transcript('ravi-b4'),
    [inFolder('plain-session.jsonl')]: record({ type: 'user', message: { content: 'hello' } }),
    [inFolder('before-joining.jsonl')]: transcript('lena-b0'),
    [inFolder('mine', 'subagents', 'agent-abc.jsonl')]: transcript('lena-b0')
  }
  const io = fixtureIo(files)
  const mtimes: Record<string, number> = {
    [inFolder('old.jsonl')]: 6000,
    [inFolder('mine.jsonl')]: 8000,
    [inFolder('newer-other-agent.jsonl')]: 9000,
    [inFolder('plain-session.jsonl')]: 9000,
    [inFolder('before-joining.jsonl')]: 4000
  }
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), mtimeMs: mtimes[path] ?? 1000 })
  const source = new TeammateSource(io)
  const processes = async () => [alive('lena-b0', 93143)]
  const [teammate] = await source.collect(root, lead, repo, processes, 10000)
  // Its own transcript first, then those of the agents it spawned itself.
  expect(teammate.transcripts).toEqual([
    inFolder('mine.jsonl'),
    inFolder('mine', 'subagents', 'agent-abc.jsonl')
  ])
  expect(teammate.ref.activity).toBe('running')
  expect(JSON.stringify(teammate)).not.toContain('CANARY')

  // Once tied, the folder is looked at again only later, in case a newer transcript took over.
  const list = vi.spyOn(io, 'list')
  files[inFolder('mine.jsonl')] = transcript('lena-b0')
  const at = async (now: number): Promise<string> =>
    (await source.collect(root, lead, repo, processes, now))[0].ref.activity
  expect(await at(12000)).toBe('thinking')
  expect(searches(list)).toBe(0)
  expect(await at(70000)).toBe('idle')
  expect(searches(list)).toBe(1)
})

it('shows a teammate as thinking while no transcript can be tied, and searches again only every 10 s', async () => {
  const files: Record<string, string> = {
    [roster]: config([member('lena-b0', { joinedAt: 500 })])
  }
  const io = fixtureIo(files)
  const list = vi.spyOn(io, 'list')
  const source = new TeammateSource(io)
  const processes = async () => [alive('lena-b0', 93143)]
  for (const now of [6000, 8000, 15999]) {
    const [teammate] = await source.collect(root, lead, repo, processes, now)
    expect(teammate).toMatchObject({ transcripts: [], ref: { activity: 'thinking' } })
  }
  expect(searches(list)).toBe(1)
  files[inFolder('mine.jsonl')] = transcript('lena-b0')
  const [teammate] = await source.collect(root, lead, repo, processes, 16000)
  expect(teammate.transcripts).toEqual([inFolder('mine.jsonl')])
  expect(searches(list)).toBe(2)
})

it('forgets teammates that left, so a restarted one is searched for afresh', async () => {
  const io = fixtureIo({
    [roster]: config([member('lena-b0', { joinedAt: 500 })]),
    [inFolder('mine.jsonl')]: transcript('lena-b0')
  })
  const source = new TeammateSource(io)
  const [tied] = await source.collect(root, lead, repo, async () => [alive('lena-b0', 93143)], 6000)
  expect(tied.transcripts).toEqual([inFolder('mine.jsonl')])
  source.prune()
  await source.collect(root, lead, repo, async () => [], 8000)
  source.prune()
  const list = vi.spyOn(io, 'list')
  await source.collect(root, lead, repo, async () => [alive('lena-b0', 93143)], 10000)
  expect(searches(list)).toBe(1)
})

it('lists the owner’s own processes only, not every account’s', () => {
  expect(PROCESS_TABLE_ARGS).toEqual(['-xo', 'pid=,lstart=,command='])
  expect(WINDOWS_PROCESS_TABLE_SCRIPT).toContain('if ($process.SessionId -eq $session)')
})

it('reads agent id and parent session from a Windows command line', () => {
  const line = `"C:\\Users\\me\\.local\\bin\\claude.exe" --agent-id lena-b0@${team} --parent-session-id ${lead}`
  const table = windowsTableLine(93143, '134361197520000000', line)
  expect(teammateProcesses(parseWindowsProcessTable(table))).toEqual([
    {
      pid: 93143,
      startedAtMs: Date.parse('Sat Oct 10 15:29:12 2026 UTC'),
      agentId: `lena-b0@${team}`,
      parentSessionId: lead
    }
  ])
})

it('carries a member’s folder only when it is absolute on the platform the roster came from', async () => {
  const io = fixtureIo({
    [roster]: config([
      member('lena-b0', { cwd: 'C:\\work\\repo' }),
      member('ravi-b4', { cwd: '/work/repo' })
    ])
  })
  const processes = async () => [alive('lena-b0', 93143), alive('ravi-b4', 93144)]
  const folders = async (platform: NodeJS.Platform) =>
    (await new TeammateSource(io, platform).collect(root, lead, repo, processes, 6000)).map(
      (teammate) => teammate.ref.cwd
    )
  expect(await folders('win32')).toEqual(['C:\\work\\repo', undefined])
  expect(await folders('darwin')).toEqual([undefined, '/work/repo'])
})

it('counts a member only when its process carries the id made of its own name and the team', async () => {
  const io = fixtureIo({
    [roster]: config([
      // Another agent's process under this member's name.
      member('ravi-b4', { agentId: `lena-b0@${team}` }),
      // A name the roster pairs with an id from elsewhere.
      member('kai-b6', { agentId: `kai-b6@session-other` })
    ])
  })
  const processes = async () => [
    alive('lena-b0', 93143),
    { ...alive('kai-b6', 93150), agentId: 'kai-b6@session-other' }
  ]
  expect(await new TeammateSource(io).collect(root, lead, repo, processes, 6000)).toEqual([])
})

it('carries a teammate’s own folder, and searches its lead’s folder when the roster names none', async () => {
  const worktree = hostPath('/work/repo-wt')
  const worktreeTranscript = join(root, 'projects', projectSlug(worktree), 'lena.jsonl')
  const io = fixtureIo({
    [roster]: config([member('lena-b0', { cwd: worktree }), member('ravi-b4', { cwd: undefined })]),
    [worktreeTranscript]: transcript('lena-b0'),
    [inFolder('ravi.jsonl')]: transcript('ravi-b4')
  })
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), mtimeMs: 6000 })
  const processes = async () => [alive('lena-b0', 93143), alive('ravi-b4', 93144)]
  const [lena, ravi] = await new TeammateSource(io).collect(root, lead, repo, processes, 7000)
  expect(lena.ref.cwd).toBe(worktree)
  expect(lena.transcripts).toEqual([worktreeTranscript])
  expect('cwd' in ravi.ref).toBe(false)
  expect(ravi.transcripts).toEqual([inFolder('ravi.jsonl')])
})

it('does not tie a re-spawned teammate to the transcript of the one it replaced', async () => {
  // ravi joined at 1000 and has no transcript yet. maya ran once (last write 3000), was shut
  // down, and joined again under the same name at 5000; her new transcript is not there yet.
  const files: Record<string, string> = {
    [roster]: config([member('ravi', { joinedAt: 1000 }), member('maya', { joinedAt: 5000 })]),
    [inFolder('old-maya.jsonl')]: transcript('maya')
  }
  const io = fixtureIo(files)
  const mtimes: Record<string, number> = {
    [inFolder('old-maya.jsonl')]: 3000,
    [inFolder('new-maya.jsonl')]: 9000
  }
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), mtimeMs: mtimes[path] ?? 1000 })
  const source = new TeammateSource(io)
  const processes = async () => [alive('ravi', 100), alive('maya', 200)]
  const maya = async (now: number): Promise<string[]> =>
    (await source.collect(root, lead, repo, processes, now)).find(
      (teammate) => teammate.ref.name === 'maya'
    )!.transcripts

  expect(await maya(6000)).toEqual([])
  files[inFolder('new-maya.jsonl')] = transcript('maya')
  expect(await maya(60000)).toEqual([inFolder('new-maya.jsonl')])
})

it('moves a tie to a newer transcript that names the same teammate', async () => {
  const files: Record<string, string> = {
    [roster]: config([member('lena-b0', { joinedAt: 500 })]),
    [inFolder('first.jsonl')]: transcript('lena-b0')
  }
  const io = fixtureIo(files)
  const mtimes: Record<string, number> = { [inFolder('second.jsonl')]: 9000 }
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), mtimeMs: mtimes[path] ?? 6000 })
  const source = new TeammateSource(io)
  const processes = async () => [alive('lena-b0', 93143)]
  const tied = async (now: number): Promise<string[]> =>
    (await source.collect(root, lead, repo, processes, now))[0].transcripts

  expect(await tied(7000)).toEqual([inFolder('first.jsonl')])
  files[inFolder('second.jsonl')] = transcript('lena-b0')
  expect(await tied(9500)).toEqual([inFolder('first.jsonl')])
  expect(await tied(17000)).toEqual([inFolder('second.jsonl')])
})

it('looks less and less often for a transcript that does not turn up, down to every five minutes', async () => {
  const io = fixtureIo({
    [roster]: config([member('lena-b0', { joinedAt: 500 })]),
    [inFolder('someone-else.jsonl')]: transcript('ravi-b4')
  })
  const list = vi.spyOn(io, 'list')
  const source = new TeammateSource(io)
  const processes = async () => [alive('lena-b0', 93143)]
  const searchesBy = async (now: number): Promise<number> => {
    await source.collect(root, lead, repo, processes, now)
    return searches(list)
  }

  expect(await searchesBy(0)).toBe(1)
  expect(await searchesBy(9999)).toBe(1)
  expect(await searchesBy(10000)).toBe(2)
  expect(await searchesBy(29999)).toBe(2)
  expect(await searchesBy(30000)).toBe(3)
  expect(await searchesBy(70000)).toBe(4)
  expect(await searchesBy(150000)).toBe(5)
  expect(await searchesBy(310000)).toBe(6)
  expect(await searchesBy(609999)).toBe(6)
  expect(await searchesBy(610000)).toBe(7)
})

it('reads only as many transcript heads as it takes to find the teammates it is looking for', async () => {
  const files: Record<string, string> = { [roster]: config([member('lena-b0', { joinedAt: 500 })]) }
  const mtimes: Record<string, number> = {}
  for (let age = 0; age < 20; age++) {
    files[inFolder(`other-${age}.jsonl`)] = transcript('ravi-b4')
    mtimes[inFolder(`other-${age}.jsonl`)] = 5000 - age
  }
  files[inFolder('mine.jsonl')] = transcript('lena-b0')
  mtimes[inFolder('mine.jsonl')] = 6000
  const io = fixtureIo(files)
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), mtimeMs: mtimes[path] ?? 1000 })
  const heads = vi.spyOn(io, 'readFrom')
  const [teammate] = await new TeammateSource(io).collect(
    root,
    lead,
    repo,
    async () => [alive('lena-b0', 93143)],
    7000
  )
  expect(teammate.transcripts).toEqual([inFolder('mine.jsonl')])
  expect(heads).toHaveBeenCalledTimes(1)
})
