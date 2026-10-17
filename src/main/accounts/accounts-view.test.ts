import { describe, expect, it } from 'vitest'
import { session } from '../../bridge/__fixtures__/helpers'
import type { AccountConfidence, SessionRef } from '../../shared/office/types'
import { decorateSnapshot, officeAccounts, toAccountsState } from './accounts-view'
import { addUsage, type AccountRecord, emptyLedger, type LedgerState } from './ledger-state'

const NOW = new Date(2026, 9, 11, 12).getTime()
const ADA = 'claude:aaaaaaaaaaaa'
const GRACE = 'claude:bbbbbbbbbbbb'
const CODEX = 'codex:cccccccccccc'
const record = (key: string, overrides: Partial<AccountRecord> = {}): AccountRecord => ({
  key,
  provider: key.startsWith('codex') ? 'codex' : 'claude',
  email: 'ada@example.test',
  organizationUuid: 'org-ada',
  organizationName: "ada@example.test's Organization",
  plan: 'default_claude_max_20x',
  alias: null,
  orcaAccountId: null,
  sources: ['default-login'],
  firstSeenMs: 1_000,
  ...overrides
})
const tokens = (output: number) => ({ input: 0, output, cacheWrite: 0, cacheRead: 0 })
function ledger(...accounts: AccountRecord[]): LedgerState {
  return { ...emptyLedger(500), accounts }
}
const spend = (
  state: LedgerState,
  accountKey: string | null,
  day: string,
  output: number,
  confidence: AccountConfidence = accountKey ? 'inferred' : 'unattributed',
  projectKey = 'p_1'
): void => addUsage(state, { accountKey, day, projectKey, confidence, counts: tokens(output) })

describe('what the Office is given', () => {
  it('shows a label, a plan and whether the account is signed in, and nothing that names a person', () => {
    const state = ledger(
      record(ADA),
      record(GRACE, { alias: 'grace@example.test (work)', email: 'grace@example.test' }),
      record(CODEX, { organizationName: null, plan: null, email: null })
    )
    state.spans.push({ accountKey: ADA, fromMs: 1_000, toMs: null })
    state.codexDefaultKey = CODEX
    const accounts = officeAccounts(state)
    expect(accounts).toEqual([
      {
        key: ADA,
        provider: 'claude',
        label: 'Claude account aaaa',
        plan: 'Max 20x',
        isActive: true
      },
      {
        key: GRACE,
        provider: 'claude',
        label: 'Claude account bbbb',
        plan: 'Max 20x',
        isActive: false
      },
      { key: CODEX, provider: 'codex', label: 'Codex account cccc', plan: null, isActive: true }
    ])
    expect(JSON.stringify(accounts)).not.toMatch(/@|example|org-ada/)
  })

  it('names a plan in plain words, and a plan it does not know by a tidied form of its id', () => {
    const plans = officeAccounts(
      ledger(
        record(ADA, { plan: 'default_claude_max_5x' }),
        record(GRACE, { plan: 'default_raven' }),
        record(CODEX, { plan: null })
      )
    ).map((account) => account.plan)
    expect(plans).toEqual(['Max 5x', 'Raven', null])
  })

  it.each([
    "ada@example.test's Organization",
    "renée@example.test's Organization",
    "ada@exämple.test's Organization",
    "ada@localhost's Organization",
    '"ada lovelace"@example.test',
    'ada＠example.test'
  ])('never builds a label from a name that holds an address: %s', (organizationName) => {
    const [account] = officeAccounts(ledger(record(ADA, { organizationName })))
    expect(account.label).toBe('Claude account aaaa')
  })

  it('cuts a long name to forty characters, and drops one that would reorder the text beside it', () => {
    const [long, reordered] = officeAccounts(
      ledger(
        record(ADA, { organizationName: 'x'.repeat(256) }),
        record(GRACE, { organizationName: 'Labs\u202eevil' })
      )
    )
    expect(long.label).toBe('x'.repeat(40))
    expect(reordered.label).toBe('Claude account bbbb')
  })

  it('prefers the name the owner gave over the organisation', () => {
    const [account] = officeAccounts(ledger(record(ADA, { alias: 'Work' })))
    expect(account.label).toBe('Work')
  })

  it('puts every Claude session under the signed-in account, as an inference', () => {
    const state = ledger(record(ADA))
    state.spans.push({ accountKey: ADA, fromMs: 1_000, toMs: null })
    const codex: SessionRef = {
      ...session('c'),
      key: 'codex:c',
      provider: 'codex',
      accountKey: CODEX,
      accountConfidence: 'exact'
    }
    const snapshot = {
      rev: 4,
      generatedAtMs: NOW,
      sources: [],
      sessions: [session('a'), codex, { ...codex, key: 'codex:d', accountKey: null }]
    }
    const decorated = decorateSnapshot(state, snapshot)
    expect(decorated.sessions.map((s) => [s.key, s.accountKey, s.accountConfidence])).toEqual([
      ['claude:a', ADA, 'inferred'],
      ['codex:c', CODEX, 'exact'],
      ['codex:d', null, 'unattributed']
    ])
    expect(decorated.accounts).toEqual(officeAccounts(state))
    expect(decorated).toMatchObject({ rev: 4, generatedAtMs: NOW })

    state.spans[0].toMs = 2_000
    expect(decorateSnapshot(state, snapshot).sessions[0]).toMatchObject({
      accountKey: null,
      accountConfidence: 'unattributed'
    })
  })

  it('carries no account at all while accounts are not being watched', () => {
    const codex: SessionRef = { ...session('c'), accountKey: CODEX, accountConfidence: 'exact' }
    const snapshot = { rev: 1, generatedAtMs: NOW, sources: [], sessions: [codex] }
    const decorated = decorateSnapshot(null, snapshot)
    expect(decorated.accounts).toEqual([])
    expect(decorated.sessions[0].accountKey).toBeNull()
    expect(decorated.sessions[0].accountConfidence).toBeUndefined()
    expect(decorated).not.toHaveProperty('projectsToday')
  })

  it('carries today’s tokens per project across every account, numbers only', () => {
    const state = ledger(record(ADA), record(GRACE))
    spend(state, ADA, '2026-10-11', 300, 'inferred', 'p_b')
    spend(state, GRACE, '2026-10-11', 200, 'inferred', 'p_b')
    spend(state, null, '2026-10-11', 50, 'unattributed', 'p_a')
    spend(state, ADA, '2026-10-10', 9_000, 'inferred', 'p_a')
    spend(state, ADA, '2026-10-10', 9_000, 'inferred', 'p_c')
    const snapshot = { rev: 1, generatedAtMs: NOW, sources: [], sessions: [] }
    expect(decorateSnapshot(state, snapshot, NOW).projectsToday).toEqual([
      { projectKey: 'p_a', tokens: 50 },
      { projectKey: 'p_b', tokens: 500 }
    ])
  })
})

describe('what the dashboard is given', () => {
  it('totals each account for today, the last seven days and since tracking began', () => {
    const state = ledger(record(ADA))
    spend(state, ADA, '2026-10-11', 1)
    spend(state, ADA, '2026-10-05', 10)
    spend(state, ADA, '2026-10-04', 100)
    const view = toAccountsState(state, NOW)
    expect(view).toMatchObject({ status: 'on', generatedAtMs: NOW, trackingSinceMs: 500 })
    if (view.status !== 'on') throw new Error('expected a watching state')
    expect(view.accounts[0].usage.inferred).toEqual({
      today: tokens(1),
      last7Days: tokens(11),
      sinceTracking: tokens(111)
    })
    expect(view.accounts[0].usage.exact.sinceTracking).toEqual(tokens(0))
  })

  it('keeps exact, inferred and unattributed apart, and their sum is everything counted', () => {
    const state = ledger(record(ADA), record(CODEX))
    spend(state, ADA, '2026-10-11', 5)
    spend(state, CODEX, '2026-10-11', 7, 'exact')
    spend(state, null, '2026-10-11', 11)
    // A bucket whose account is no longer on record is still counted, as unattributed.
    spend(state, 'claude:gone', '2026-10-11', 13)
    const view = toAccountsState(state, NOW)
    if (view.status !== 'on') throw new Error('expected a watching state')
    const [ada, codex] = view.accounts
    expect(ada.usage.inferred.today.output).toBe(5)
    expect(codex.usage.exact.today.output).toBe(7)
    expect(view.unattributed.usage.today.output).toBe(24)
    const shown =
      ada.usage.inferred.sinceTracking.output +
      codex.usage.exact.sinceTracking.output +
      view.unattributed.usage.sinceTracking.output
    const counted = [...state.buckets.values()].reduce((sum, b) => sum + b.counts.output, 0)
    expect(shown).toBe(counted)
  })

  it('breaks each account down by project, largest first, under the project’s name', () => {
    const state = ledger(record(ADA))
    state.projects.set('p_1', 'ClaudeWatch')
    spend(state, ADA, '2026-10-11', 5, 'inferred', 'p_1')
    spend(state, ADA, '2026-10-04', 40, 'inferred', 'p_2')
    spend(state, null, '2026-10-11', 2, 'unattributed', 'p_1')
    const view = toAccountsState(state, NOW)
    if (view.status !== 'on') throw new Error('expected a watching state')
    expect(view.accounts[0].projects).toEqual([
      {
        projectKey: 'p_2',
        projectLabel: 'p_2',
        usage: { today: tokens(0), last7Days: tokens(0), sinceTracking: tokens(40) }
      },
      {
        projectKey: 'p_1',
        projectLabel: 'ClaudeWatch',
        usage: { today: tokens(5), last7Days: tokens(5), sinceTracking: tokens(5) }
      }
    ])
    expect(view.unattributed.projects.map((p) => p.projectLabel)).toEqual(['ClaudeWatch'])
  })

  it('gives the dashboard the email, the limits with their age, and an empty list for none', () => {
    const state = ledger(record(ADA), record(GRACE, { email: 'grace@example.test' }))
    state.spans.push({ accountKey: GRACE, fromMs: 1_000, toMs: null })
    const weekly = {
      windowMinutes: 10080,
      scope: null,
      usedPercent: 12,
      resetsAtMs: 9_000,
      source: 'orca-cache' as const,
      fetchedAtMs: 5_000
    }
    state.limits.set(GRACE, [weekly])
    const view = toAccountsState(state, NOW)
    if (view.status !== 'on') throw new Error('expected a watching state')
    expect(view.accounts).toMatchObject([
      { key: ADA, isActive: false, email: 'ada@example.test', limits: [], firstSeenMs: 1_000 },
      { key: GRACE, isActive: true, email: 'grace@example.test', limits: [weekly] }
    ])
    expect(view.accounts[0]).toMatchObject({
      alias: null,
      organizationName: "ada@example.test's Organization",
      sources: ['default-login'],
      label: 'Claude account aaaa'
    })
  })
})

describe('what the dashboard is told about a limit', () => {
  it('names the model family a window covers in plain words, and keeps the plan’s name', () => {
    const state = ledger(record(ADA))
    const window = {
      windowMinutes: 10080,
      usedPercent: 12,
      resetsAtMs: null,
      source: 'orca-cache' as const,
      fetchedAtMs: NOW
    }
    state.limits.set(ADA, [
      { ...window, scope: null },
      { ...window, scope: 'fableWeekly' }
    ])
    const view = toAccountsState(state, NOW)
    if (view.status !== 'on') throw new Error('expected a watching state')
    expect(view.accounts[0].plan).toBe('Max 20x')
    expect(view.accounts[0].limits.map((limit) => limit.scope)).toEqual([null, 'Fable'])
    // The ledger itself keeps what Orca said.
    expect(state.limits.get(ADA)?.[1].scope).toBe('fableWeekly')
  })
})
