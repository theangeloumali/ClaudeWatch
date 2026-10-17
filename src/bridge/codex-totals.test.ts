import { expect, it } from 'vitest'
import type { CodexTotal } from '../shared/accounts'
import { BridgePoller } from './poller'
import { fixtureIo } from './__fixtures__/helpers'

const rollout = '/codex/sessions/rollout-a.jsonl'
const meta = `${JSON.stringify({
  type: 'session_meta',
  payload: { id: 'a', cwd: '/repo', timestamp: '2026-10-11T09:30:00.000Z' }
})}\n`
// A `token_count` event carrying the thread's running total of output tokens.
const total = (output: number): string =>
  `${JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 0, output_tokens: output } }
    }
  })}\n`

it('posts each Codex total on the tick that reads it, while the feed holds the session’s numbers for ten seconds', async () => {
  const files: Record<string, string | null> = { [rollout]: meta + total(100), '/repo/.git': null }
  const io = fixtureIo(files)
  let isRunning = true
  io.exec = async (program) => {
    if (!program.endsWith('ps')) return 'p42\nn/repo\n'
    return isRunning ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : ''
  }
  let now = Date.parse('2026-10-11T10:00:00.000Z')
  const posted: CodexTotal[][] = []
  const poller = new BridgePoller({
    io,
    claudeRoots: [],
    codexRoot: '/codex',
    // The process table and folder above are what `ps` and `lsof` print on macOS.
    platform: 'darwin',
    now: () => now,
    onCodexTotals: (totals) => posted.push(totals)
  })
  // What the feed shows after a tick two seconds on, and what was posted beside it by that tick.
  const tick = async (): Promise<[number | undefined, number[]]> => {
    posted.length = 0
    now += 2000
    const shown = (await poller.tick()).sessions[0]?.usage?.own.output
    return [shown, posted.flat().map(({ counts }) => counts.output)]
  }

  expect(await tick()).toEqual([100, [100]])
  expect(posted).toEqual([
    [
      {
        sessionKey: 'codex:a',
        projectKey: expect.stringMatching(/^p_/),
        projectLabel: 'repo',
        accountKey: null,
        threadStartedAtMs: Date.parse('2026-10-11T09:30:00.000Z'),
        counts: { input: 0, output: 100, cacheWrite: 0, cacheRead: 0 }
      }
    ]
  ])
  files[rollout] += total(150)
  expect(await tick()).toEqual([100, [150]])
  // A tick that read nothing new posts nothing.
  expect(await tick()).toEqual([100, []])

  // Its last turn, then the process gone before the next tick.
  files[rollout] += total(180)
  isRunning = false
  expect(await tick()).toEqual([undefined, [180]])
  expect(await tick()).toEqual([undefined, []])
})

// health-15: a child thread spends its parent's account, so its own total reaches the ledger. The
// ledger counts a total's growth, so each thread posts its own: a child no longer in view after a
// restart never lowers the parent's.
const child = `${JSON.stringify({
  type: 'session_meta',
  payload: {
    id: 'b',
    cwd: '/repo',
    timestamp: '2026-10-11T09:40:00.000Z',
    source: { subagent: { thread_spawn: { parent_thread_id: 'a' } } }
  }
})}\n`
const NOW = Date.parse('2026-10-11T10:00:00.000Z')

function family(childWrittenAtMs: number) {
  const io = fixtureIo({
    [rollout]: meta + total(100),
    '/codex/sessions/rollout-b.jsonl': child + total(40),
    '/repo/.git': null
  })
  io.exec = async (program) =>
    program.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : 'p42\nn/repo\n'
  const stat = io.stat
  io.stat = async (path) => ({
    ...(await stat(path)),
    mtimeMs: path.endsWith('rollout-b.jsonl') ? childWrittenAtMs : NOW - 1000
  })
  const posted: CodexTotal[] = []
  const poller = new BridgePoller({
    io,
    claudeRoots: [],
    codexRoot: '/codex',
    platform: 'darwin',
    now: () => NOW,
    onCodexTotals: (totals) => posted.push(...totals)
  })
  return { poller, posted }
}
const outputs = (posted: CodexTotal[]) =>
  posted.map(({ sessionKey, counts, threadStartedAtMs }) => [
    sessionKey,
    counts.output,
    threadStartedAtMs
  ])

it('posts a child rollout’s tokens under its own thread, filed with its parent', async () => {
  const { poller, posted } = family(NOW - 1000)
  const [parent] = (await poller.tick()).sessions

  expect(parent?.usage?.subagents.output).toBe(40)
  expect(outputs(posted)).toEqual([
    ['codex:a', 100, Date.parse('2026-10-11T09:30:00.000Z')],
    ['codex:b', 40, Date.parse('2026-10-11T09:40:00.000Z')]
  ])
  expect(posted[1]).toMatchObject({ projectKey: posted[0]?.projectKey, accountKey: null })
})

it('posts the parent’s own total alone when its child is no longer in view', async () => {
  const { poller, posted } = family(NOW - 60 * 60_000)
  await poller.tick()

  expect(outputs(posted)).toEqual([['codex:a', 100, Date.parse('2026-10-11T09:30:00.000Z')]])
})

const childRollout = '/codex/sessions/rollout-b.jsonl'
const TERMINAL = '42 Sat Oct 10 15:29:12 2026 /bin/codex'
const APP_SERVER = '43 Sat Oct 10 15:29:12 2026 /Applications/Codex.app/codex app-server'

// A parent and child whose files, write times and process table each tick can change.
function changingFamily(processTable: string) {
  const files: Record<string, string | null> = {
    [rollout]: meta + total(100),
    [childRollout]: child + total(40),
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  const writtenAtMs: Record<string, number> = { [rollout]: NOW - 1000, [childRollout]: NOW - 1000 }
  const state = { now: NOW, processTable, writtenAtMs }
  io.exec = async (program) => (program.endsWith('ps') ? state.processTable : 'p42\nn/repo\n')
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), mtimeMs: state.writtenAtMs[path] ?? 1000 })
  const posted: CodexTotal[] = []
  const poller = new BridgePoller({
    io,
    claudeRoots: [],
    codexRoot: '/codex',
    platform: 'darwin',
    now: () => state.now,
    onCodexTotals: (totals) => posted.push(...totals)
  })
  const tick = async (atMs: number) => {
    posted.length = 0
    state.now = atMs
    return (await poller.tick()).sessions
  }
  // A turn written at `atMs`: the rollout's newest running total.
  const write = (path: string, output: number, atMs: number) => {
    files[path] += total(output)
    state.writtenAtMs[path] = atMs
  }
  return { state, posted, tick, write }
}
const PARENT_STARTED = Date.parse('2026-10-11T09:30:00.000Z')
const CHILD_STARTED = Date.parse('2026-10-11T09:40:00.000Z')

it('a child thread’s last turn written before its parent is pruned still reaches the posted totals', async () => {
  const family = changingFamily(TERMINAL)
  await family.tick(NOW)
  expect(outputs(family.posted)).toEqual([
    ['codex:a', 100, PARENT_STARTED],
    ['codex:b', 40, CHILD_STARTED]
  ])

  // Both threads write a last turn, then the parent's process exits before the next tick.
  family.write(childRollout, 70, NOW + 500)
  family.write(rollout, 120, NOW + 600)
  family.state.processTable = ''
  expect(await family.tick(NOW + 2000)).toEqual([])
  expect(outputs(family.posted)).toEqual([
    ['codex:a', 120, PARENT_STARTED],
    ['codex:b', 70, CHILD_STARTED]
  ])
})

it('a child thread’s last turn still reaches its live parent when the next look finds it long quiet', async () => {
  const family = changingFamily(TERMINAL)
  await family.tick(NOW)

  // Its last turn lands just after a look; the machine sleeps past the open-tool hold.
  family.write(childRollout, 70, NOW + 500)
  const [parent] = await family.tick(NOW + 20 * 60_000)
  expect(parent?.usage?.subagents.output).toBe(70)
  expect(outputs(family.posted)).toEqual([['codex:b', 70, CHILD_STARTED]])
})

it('a hosted child thread’s last turn reaches the posted totals when its quiet parent is no longer shown', async () => {
  const family = changingFamily(APP_SERVER)
  await family.tick(NOW)
  expect(outputs(family.posted)).toEqual([
    ['codex:a', 100, PARENT_STARTED],
    ['codex:b', 40, CHILD_STARTED]
  ])

  // The parent goes quiet past its freshness while its idle child writes a last turn.
  family.write(childRollout, 70, NOW + 4 * 60_000)
  expect(await family.tick(NOW + 5 * 60_000)).toEqual([])
  expect(outputs(family.posted)).toEqual([['codex:b', 70, CHILD_STARTED]])
})
