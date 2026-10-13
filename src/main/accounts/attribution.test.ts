import { describe, expect, it } from 'vitest'
import { accountKey } from '../../bridge/account-key'
import { fixtureIo, registryEntry } from '../../bridge/__fixtures__/helpers'
import { BridgePoller } from '../../bridge/poller'
import { type CodexTotal, type UsageDelta, USAGE_RETENTION_MS } from '../../shared/accounts'
import {
  countCodexSessions,
  countUsage,
  prune,
  recordIdentity,
  toCodexTotals,
  toUsageDeltas
} from './attribution'
import type { IdentityRead } from './identity'
import { toAccountsState } from './accounts-view'
import { fromStored, toStored } from './ledger-shape'
import { addUsage, BEYOND_ANY_LINE, dayKey, emptyLedger, type LedgerState } from './ledger-state'

it('folds days older than the view’s week into one bucket per account, project and confidence, keeping every total', () => {
  const noon = new Date(2026, 9, 11, 12).getTime()
  const state = emptyLedger(0)
  const spend = (daysAgo: number, tokens: number, projectKey = 'p_repo'): void =>
    addUsage(state, {
      accountKey: 'claude:aaaaaaaaaaaa',
      day: dayKey(new Date(2026, 9, 11 - daysAgo, 12).getTime()),
      projectKey,
      confidence: 'inferred',
      counts: { input: 0, output: tokens, cacheWrite: 0, cacheRead: 0 }
    })
  spend(0, 1)
  spend(6, 2)
  spend(7, 4)
  spend(30, 8)
  spend(200, 16)
  spend(30, 32, 'p_other')
  const before = toAccountsState(state, noon)
  prune(state, noon)
  expect(toAccountsState(state, noon)).toEqual(before)
  // Today, six days ago, and one folded bucket for each project.
  expect(state.buckets.size).toBe(4)
  prune(state, noon)
  expect(state.buckets.size).toBe(4)
})

// Local wall-clock times on one day, so day buckets do not depend on the machine's zone.
const at = (hour: number, minute = 0, second = 0): number =>
  new Date(2026, 9, 11, hour, minute, second).getTime()
const DAY = '2026-10-11'
const signedIn = (name: string): IdentityRead => ({
  status: 'signed-in',
  identity: {
    accountUuid: `uuid-${name}`,
    organizationUuid: `org-${name}`,
    emailAddress: `${name}@example.test`,
    organizationName: `${name} Org`,
    organizationRateLimitTier: 'max'
  }
})
const keyOf = (name: string): string => accountKey('claude', `uuid-${name}`)
const output = (value: number) => ({ input: 0, output: value, cacheWrite: 0, cacheRead: 0 })
const line = (atMs: number, tokens: number, file = '/p/a.jsonl'): UsageDelta => ({
  sessionKey: 'claude:a',
  projectKey: 'p_repo',
  projectLabel: 'repo',
  file,
  atMs,
  position: 0,
  counts: output(tokens)
})
// The same line, starting at a byte offset of its transcript.
const lineAt = (position: number, atMs: number, tokens: number): UsageDelta => ({
  ...line(atMs, tokens),
  position
})
// What the ledger holds, as [account, confidence, output tokens].
const held = (state: LedgerState): [string | null, string, number][] =>
  [...state.buckets.values()].map((bucket) => [
    bucket.accountKey,
    bucket.confidence,
    bucket.counts.output
  ])
// A ledger that has watched `name` continuously from 10:00 until `until`.
function watching(name: string, until = at(10)): LedgerState {
  const state = emptyLedger(at(9))
  for (let time = at(10); time <= until; time += 15_000) recordIdentity(state, signedIn(name), time)
  return state
}

describe('usage on the shared login', () => {
  it('goes to the account that was signed in when each line was written', () => {
    const state = watching('ada', at(10, 30))
    recordIdentity(state, signedIn('grace'), at(10, 30, 15))
    countUsage(state, [line(at(10, 10), 5), line(at(10, 40), 7)], at(10, 41))
    expect(held(state)).toEqual([
      [keyOf('ada'), 'inferred', 5],
      [keyOf('grace'), 'inferred', 7]
    ])
    expect([...state.buckets.values()][0]).toMatchObject({ day: DAY, projectKey: 'p_repo' })
    expect(state.projects.get('p_repo')).toBe('repo')
  })

  it('bridges a gap in watching when the same account is signed in afterwards', () => {
    const state = watching('ada')
    recordIdentity(state, signedIn('ada'), at(12))
    countUsage(state, [line(at(11), 5)], at(12, 1))
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 5]])
  })

  it('leaves usage unattributed when another account is signed in after a gap', () => {
    const state = watching('ada', at(10, 1))
    recordIdentity(state, signedIn('grace'), at(12))
    countUsage(state, [line(at(10, 0, 30), 1), line(at(11), 5), line(at(12, 1), 7)], at(12, 2))
    expect(held(state)).toEqual([
      [keyOf('ada'), 'inferred', 1],
      [null, 'unattributed', 5],
      [keyOf('grace'), 'inferred', 7]
    ])
  })

  it('attributes nothing while signed out, and keeps its place through an unreadable read', () => {
    const state = watching('ada', at(10, 1))
    recordIdentity(state, { status: 'unreadable' }, at(10, 1, 15))
    countUsage(state, [line(at(10, 1, 20), 3)], at(10, 2))
    recordIdentity(state, { status: 'signed-out' }, at(10, 2, 15))
    countUsage(state, [line(at(10, 5), 4)], at(10, 6))
    expect(held(state)).toEqual([
      [keyOf('ada'), 'inferred', 3],
      [null, 'unattributed', 4]
    ])
  })

  it('counts nothing from before tracking began', () => {
    const state = watching('ada')
    expect(countUsage(state, [line(at(8, 59), 100)], at(10, 1))).toBe(false)
    expect(held(state)).toEqual([])
  })
})

describe('counting each line once', () => {
  it('ignores a transcript that is reported again from its first line', () => {
    const state = watching('ada', at(10, 30))
    const first = [line(at(10, 10), 5), line(at(10, 11), 2)]
    expect(countUsage(state, first, at(10, 12))).toBe(true)
    expect(countUsage(state, first, at(10, 13))).toBe(false)
    countUsage(state, [...first, line(at(10, 20), 1)], at(10, 21))
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 8]])
  })

  it('keeps one place per transcript, so an older line in another file still counts', () => {
    const state = watching('ada', at(10, 30))
    countUsage(state, [line(at(10, 20), 5, '/p/a.jsonl')], at(10, 21))
    countUsage(state, [line(at(10, 10), 2, '/p/agent.jsonl')], at(10, 22))
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 7]])
  })

  it('counts lines that share a timestamp when they arrive together', () => {
    const state = watching('ada', at(10, 30))
    countUsage(state, [line(at(10, 10), 5), line(at(10, 10), 2)], at(10, 11))
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 7]])
  })

  it('counts a line that shares its millisecond with the last one counted and arrives in a later batch', () => {
    const state = watching('ada', at(10, 30))
    countUsage(state, [lineAt(0, at(10, 10), 5)], at(10, 11))
    expect(countUsage(state, [lineAt(300, at(10, 10), 2)], at(10, 12))).toBe(true)
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 7]])
  })

  it('counts nothing new when lines that share a millisecond are reported again from the first line', () => {
    const state = watching('ada', at(10, 30))
    const read = [lineAt(0, at(10, 10), 5), lineAt(300, at(10, 10), 2), lineAt(600, at(10, 11), 1)]
    countUsage(state, read.slice(0, 1), at(10, 11))
    countUsage(state, read.slice(1), at(10, 12))
    expect(countUsage(state, read, at(10, 13))).toBe(false)
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 8]])
  })

  it('counts an appended line stamped earlier than the latest one counted', () => {
    const state = watching('ada', at(10, 30))
    countUsage(state, [lineAt(0, at(10, 10), 5)], at(10, 11))
    countUsage(state, [lineAt(300, at(10, 9), 2)], at(10, 12))
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 7]])
  })

  it('counts the newer lines of a rewritten transcript, which start at smaller offsets', () => {
    const state = watching('ada', at(10, 30))
    countUsage(state, [lineAt(0, at(10, 10), 5), lineAt(900, at(10, 11), 2)], at(10, 12))
    const rewritten = [
      lineAt(0, at(10, 10), 5),
      lineAt(200, at(10, 20), 4),
      lineAt(400, at(10, 20), 1)
    ]
    countUsage(state, rewritten, at(10, 21))
    expect(countUsage(state, rewritten, at(10, 22))).toBe(false)
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 12]])
  })

  it('never counts a line stamped before tracking began, wherever it starts', () => {
    const state = watching('ada', at(10, 30))
    countUsage(state, [lineAt(0, at(10, 10), 5)], at(10, 11))
    expect(countUsage(state, [lineAt(300, at(8, 59), 100)], at(10, 12))).toBe(false)
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 5]])
  })

  it('leaves a transcript counted before positions were kept to the time alone, so nothing counts twice', () => {
    const before = watching('ada', at(10, 30))
    countUsage(before, [lineAt(0, at(10, 10), 5), lineAt(300, at(10, 11), 2)], at(10, 12))
    const { filePositions, ...olderForm } = JSON.parse(JSON.stringify(toStored(before)))
    expect(filePositions).toHaveLength(1)
    const state = fromStored(olderForm)
    if (!state) throw new Error('expected the older form to load')
    expect([...state.files.values()]).toEqual([{ atMs: at(10, 11), position: BEYOND_ANY_LINE }])

    // The bridge starts again and reports the file from its first line, with what was appended.
    const reread = [
      lineAt(0, at(10, 10), 5),
      lineAt(300, at(10, 11), 2),
      lineAt(600, at(10, 11), 64),
      lineAt(900, at(10, 20), 1)
    ]
    countUsage(state, reread, at(10, 21))
    expect(countUsage(state, reread, at(10, 22))).toBe(false)
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 8]])
    expect([...state.files.values()]).toEqual([{ atMs: at(10, 20), position: BEYOND_ANY_LINE }])
  })

  it('still refuses old lines after a quiet transcript has been forgotten', () => {
    const state = watching('ada', at(10, 30))
    const old = line(at(10, 10), 5)
    countUsage(state, [old], at(10, 11))
    const later = at(10, 11) + USAGE_RETENTION_MS + 60_000
    recordIdentity(state, signedIn('ada'), later)
    prune(state, later)
    expect(state.files.size).toBe(0)
    countUsage(state, [old, line(later, 2)], later + 1_000)
    expect(held(state).map(([, , tokens]) => tokens)).toEqual([5, 2])
  })
})

describe('a bridge that starts again', () => {
  const transcript = '/claude/projects/-repo/a.jsonl'
  // One line of a message as Claude Code writes it, with the output it has reached so far.
  const written = (id: string, outputSoFar: number, atMs: number): string =>
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date(atMs).toISOString(),
      message: { id, content: [], usage: { input_tokens: 0, output_tokens: outputSoFar } }
    })}\n`

  it('counts each line once across restarts of the bridge and of the app, lines of one millisecond included', async () => {
    const entry = registryEntry()
    const files: Record<string, string | null> = {
      '/claude/sessions/42.json': JSON.stringify(entry),
      '/repo/.git': null,
      [transcript]: written('m1', 5, at(10, 10))
    }
    const io = fixtureIo(files)
    io.exec = async (_file, args) => (args[0] === '-o' ? entry.procStart : '')
    const now = at(10, 31)
    let state = watching('ada', at(10, 30))
    // A bridge as main starts it: what each tick added crosses to main and is counted there.
    const startBridge = async (): Promise<BridgePoller> => {
      const poller = new BridgePoller({
        io,
        // The fixtures print macOS ps output.
        platform: 'darwin',
        claudeRoots: ['/claude'],
        codexRoot: '/codex',
        now: () => now,
        onUsage: (deltas) => countUsage(state, toUsageDeltas({ type: 'usage', v: 1, deltas }), now)
      })
      // Its first tick publishes before any transcript is read.
      await poller.tick()
      await poller.tick()
      return poller
    }

    const bridge = await startBridge()
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 5]])
    files[transcript] += written('m1', 9, at(10, 10))
    await bridge.tick()
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 9]])

    await startBridge()
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 9]])

    // The app restarts too, and the message grew in that same millisecond while it was down.
    const reloaded = fromStored(JSON.parse(JSON.stringify(toStored(state))))
    if (!reloaded) throw new Error('expected the saved ledger to load')
    state = reloaded
    files[transcript] += written('m1', 12, at(10, 10))
    const restarted = await startBridge()
    await restarted.tick()
    expect(held(state)).toEqual([[keyOf('ada'), 'inferred', 12]])
  })
})

describe('Codex sessions', () => {
  const codexKey = accountKey('codex', 'acct_1')
  const codex = (tokens: number, overrides: Partial<CodexTotal> = {}): CodexTotal => ({
    sessionKey: 'codex:c',
    projectKey: 'p_repo',
    projectLabel: 'repo',
    accountKey: codexKey,
    threadStartedAtMs: at(9, 30),
    counts: output(tokens),
    ...overrides
  })

  it('counts the growth of a running total once, exactly, under the account the session names', () => {
    const state = emptyLedger(at(9))
    expect(countCodexSessions(state, [], at(10))).toBe(false)
    expect(countCodexSessions(state, [codex(40)], at(10, 1))).toBe(true)
    expect(countCodexSessions(state, [codex(40)], at(10, 2))).toBe(false)
    countCodexSessions(state, [codex(65)], at(10, 3))
    expect(held(state)).toEqual([[codexKey, 'exact', 65]])
    expect(state.accounts).toMatchObject([
      { key: codexKey, provider: 'codex', sources: ['codex-rollout'] }
    ])
  })

  it('never counts a total twice when it dips and recovers', () => {
    const state = emptyLedger(at(9))
    for (const tokens of [40, 10, 40, 50]) countCodexSessions(state, [codex(tokens)], at(10))
    expect(held(state)).toEqual([[codexKey, 'exact', 50]])
  })

  it.each([
    ['began before tracking and was resumed in a new process', { threadStartedAtMs: at(8) }],
    ['does not say when it began', { threadStartedAtMs: null }],
    [
      'began longer ago than a counted total is remembered',
      { threadStartedAtMs: at(9, 30) - 31 * 24 * 60 * 60 * 1000 }
    ]
  ])('starts a thread that %s from what it had already spent', (_case, thread) => {
    // Tracking began long enough ago that only the thread's own age decides.
    const state = emptyLedger(at(9) - 60 * 24 * 60 * 60 * 1000)
    if (thread.threadStartedAtMs === at(8)) state.trackingSinceMs = at(9)
    // The process is new either way: it started after tracking did.
    countCodexSessions(state, [codex(900, thread)], at(10))
    countCodexSessions(state, [codex(905, thread)], at(10, 1))
    expect(held(state)).toEqual([[codexKey, 'exact', 5]])
  })

  it('leaves a session that names no account unattributed', () => {
    const state = emptyLedger(at(9))
    countCodexSessions(state, [codex(12, { accountKey: null })], at(10))
    expect(held(state)).toEqual([[null, 'unattributed', 12]])
    expect(state.accounts).toEqual([])
  })

  it('takes from the bridge only well-formed totals of Codex sessions', () => {
    const posted = (...totals: unknown[]): unknown => ({ type: 'codex-usage', v: 1, totals })
    expect(toCodexTotals(posted(codex(40), codex(7, { accountKey: null })))).toEqual([
      codex(40),
      codex(7, { accountKey: null })
    ])
    expect(toCodexTotals(posted(codex(40, { threadStartedAtMs: null })))).toHaveLength(1)
    for (const message of [
      null,
      { type: 'usage', v: 1, totals: [codex(1)] },
      { type: 'codex-usage', v: 2, totals: [codex(1)] },
      { type: 'codex-usage', v: 1, totals: 'many' },
      posted('total'),
      posted({ ...codex(1), sessionKey: 'claude:a' }),
      posted({ ...codex(1), sessionKey: 7 }),
      posted({ ...codex(1), projectKey: '' }),
      posted({ ...codex(1), projectLabel: null }),
      posted({ ...codex(1), accountKey: 'someone@example.test' }),
      posted({ ...codex(1), accountKey: undefined }),
      posted({ ...codex(1), threadStartedAtMs: 'today' }),
      posted({ ...codex(1), threadStartedAtMs: undefined }),
      posted({ ...codex(1), counts: { ...output(1), input: -1 } }),
      posted({ ...codex(1), counts: null })
    ]) {
      expect(toCodexTotals(message)).toEqual([])
    }
  })
})
