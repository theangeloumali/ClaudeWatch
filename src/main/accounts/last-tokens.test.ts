import { expect, it } from 'vitest'
import { accountKey } from '../../bridge/account-key'
import { fixtureIo, registryEntry } from '../../bridge/__fixtures__/helpers'
import { BridgePoller } from '../../bridge/poller'
import { codexTotalOf } from '../../shared/accounts'
import { countCodexSessions, countUsage, toCodexTotals, toUsageDeltas } from './attribution'
import { emptyLedger, type LedgerState } from './ledger-state'

// Local wall-clock times on one day, so day buckets do not depend on the machine's zone.
const at = (hour: number, minute = 0, second = 0): number =>
  new Date(2026, 9, 11, hour, minute, second).getTime()
// What the ledger holds, as [account, confidence, output tokens].
const held = (state: LedgerState): [string | null, string, number][] =>
  [...state.buckets.values()].map((bucket) => [
    bucket.accountKey,
    bucket.confidence,
    bucket.counts.output
  ])

const rollout = '/codex/sessions/rollout-a.jsonl'
const codexMeta = `${JSON.stringify({
  type: 'session_meta',
  payload: {
    id: 'a',
    cwd: '/repo',
    timestamp: new Date(at(9, 30)).toISOString(),
    creator_account_id: 'acct_1'
  }
})}\n`
// A `token_count` event carrying the thread's running total of output tokens.
const codexTotal = (output: number): string =>
  `${JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 0, output_tokens: output } }
    }
  })}\n`

// A bridge over one Codex session, as main runs it: `tick` polls two seconds on and counts the
// totals posted beside the feed, then the sessions the feed's snapshot shows.
function codexBridge() {
  const files: Record<string, string | null> = {
    [rollout]: codexMeta + codexTotal(100),
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  const process = { isRunning: true }
  io.exec = async (program) => {
    if (!program.endsWith('ps')) return 'p42\nn/repo\n'
    return process.isRunning ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : ''
  }
  const state = emptyLedger(at(9))
  let now = at(10)
  const poller = new BridgePoller({
    io,
    // The fixtures print macOS ps output.
    platform: 'darwin',
    claudeRoots: [],
    codexRoot: '/codex',
    now: () => now,
    derivesAccounts: true,
    onCodexTotals: (totals) =>
      countCodexSessions(state, toCodexTotals({ type: 'codex-usage', v: 1, totals }), now)
  })
  const tick = async (): Promise<(number | undefined)[]> => {
    now += 2000
    const { sessions } = await poller.tick()
    countCodexSessions(
      state,
      sessions.flatMap((session) => codexTotalOf(session) ?? []),
      now
    )
    return sessions.map((session) => session.usage?.own.output)
  }
  return { files, process, state, tick }
}
const codexAccount = accountKey('codex', 'acct_1')

it('counts what a Codex session spent while the display held its numbers back, though it exits before they are shown', async () => {
  const { files, process, state, tick } = codexBridge()
  expect(await tick()).toEqual([100])
  expect(held(state)).toEqual([[codexAccount, 'exact', 100]])

  // The total has grown, and the display keeps showing 100 for ten seconds.
  files[rollout] += codexTotal(150)
  expect(await tick()).toEqual([100])
  process.isRunning = false
  expect(await tick()).toEqual([])
  expect(held(state)).toEqual([[codexAccount, 'exact', 150]])
})

it('counts the turn a Codex session finished after the last poll that saw it alive', async () => {
  const { files, process, state, tick } = codexBridge()
  await tick()
  files[rollout] += codexTotal(150)
  process.isRunning = false
  expect(await tick()).toEqual([])
  expect(held(state)).toEqual([[codexAccount, 'exact', 150]])
  await tick()
  expect(held(state)).toEqual([[codexAccount, 'exact', 150]])
})

const transcript = '/claude/projects/-repo/a.jsonl'
const written = (id: string, output: number, atMs: number): string =>
  `${JSON.stringify({
    type: 'assistant',
    timestamp: new Date(atMs).toISOString(),
    message: { id, content: [], usage: { input_tokens: 0, output_tokens: output } }
  })}\n`

// A bridge over one Claude session, as main runs it: every line a tick adds is counted in `state`.
function claudeBridge(extraFiles: Record<string, string> = {}, sessionId = 'a') {
  const entry = { ...registryEntry(), sessionId }
  const files: Record<string, string | null> = {
    '/claude/sessions/42.json': JSON.stringify(entry),
    '/repo/.git': null,
    ...extraFiles
  }
  const io = fixtureIo(files)
  const state = emptyLedger(at(9))
  const clock = { now: at(10, 5) }
  const poller = new BridgePoller({
    io,
    // The fixtures print macOS ps output.
    platform: 'darwin',
    claudeRoots: ['/claude'],
    codexRoot: '/codex',
    now: () => clock.now,
    onUsage: (deltas) =>
      countUsage(state, toUsageDeltas({ type: 'usage', v: 1, deltas }), clock.now)
  })
  return { entry, files, io, state, clock, poller }
}

it('counts the lines a Claude session wrote after the last poll that saw it alive', async () => {
  const { entry, files, io, state, poller } = claudeBridge({
    [transcript]: written('m1', 5, at(10, 1))
  })
  let isRunning = true
  io.exec = async (_file, args) => (args[0] === '-o' && isRunning ? entry.procStart : '')
  await poller.tick()
  await poller.tick()
  expect(held(state)).toEqual([[null, 'unattributed', 5]])

  // Its last turn, written and the process gone before the next poll.
  files[transcript] += written('m2', 7, at(10, 2))
  isRunning = false
  expect((await poller.tick()).sessions).toEqual([])
  expect(held(state)).toEqual([[null, 'unattributed', 12]])
  expect([...state.projects.values()]).toEqual(['repo'])
})

it('counts a Claude session that was alive at the bridge’s first poll only', async () => {
  const { entry, io, state, poller } = claudeBridge({ [transcript]: written('m1', 5, at(10, 1)) })
  let isRunning = true
  io.exec = async (_file, args) => (args[0] === '-o' && isRunning ? entry.procStart : '')
  // The first poll answers before any transcript is read.
  await poller.tick()
  expect(held(state)).toEqual([])
  isRunning = false
  await poller.tick()
  expect(held(state)).toEqual([[null, 'unattributed', 5]])
})

it('counts a teammate’s last lines under its lead when the teammate exits between two polls', async () => {
  const lead = '6a654bca-1111-2222-3333-444444444444'
  const team = 'session-6a654bca'
  const mate = '/claude/projects/-repo/mate.jsonl'
  const { entry, files, io, state, clock, poller } = claudeBridge(
    {
      [`/claude/projects/-repo/${lead}.jsonl`]: written('m1', 2, at(10, 1)),
      [mate]:
        `${JSON.stringify({ type: 'attachment', teamName: team, agentName: 'lena-b0' })}\n` +
        written('t1', 30, at(10, 1)),
      [`/claude/teams/${team}/config.json`]: JSON.stringify({
        leadSessionId: lead,
        members: [{ agentId: `lena-b0@${team}`, name: 'lena-b0', agentType: 'lena', cwd: '/repo' }]
      })
    },
    lead
  )
  let isMateAlive = true
  io.exec = async (_file, args) => {
    if (args.includes('lstart=')) return entry.procStart
    if (args.includes('command=')) return 'claude'
    return isMateAlive
      ? `93143 ${entry.procStart} /versions/2.1.296 --agent-id lena-b0@${team} --parent-session-id ${lead}`
      : ''
  }
  await poller.tick()
  const counted = (await poller.tick()).sessions[0]
  expect(counted.subagents[0].tokens?.output).toBe(30)
  expect(held(state)).toEqual([[null, 'unattributed', 32]])

  files[mate] += written('t2', 10, at(10, 2))
  isMateAlive = false
  clock.now += 2000
  const afterExit = (await poller.tick()).sessions[0]
  expect(afterExit.subagents).toEqual([])
  expect(held(state)).toEqual([[null, 'unattributed', 42]])
  // The lead's card holds its numbers for ten seconds, then shows what the teammate ended on.
  expect(afterExit.usage?.subagents.output).toBe(30)
  clock.now += 10_000
  expect((await poller.tick()).sessions[0].usage?.subagents.output).toBe(40)
})
