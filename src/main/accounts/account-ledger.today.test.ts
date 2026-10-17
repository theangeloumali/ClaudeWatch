import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { session } from '../../bridge/__fixtures__/helpers'
import type { UsageDelta } from '../../shared/accounts'
import type { OfficeSnapshot } from '../../shared/office/types'
import { AccountLedger } from './account-ledger'
import * as accountsView from './accounts-view'
import type { IdentityRead } from './identity'

const START = new Date(2026, 9, 11, 10).getTime()
const signedIn: IdentityRead = {
  status: 'signed-in',
  identity: {
    accountUuid: 'uuid-ada',
    organizationUuid: 'org-ada',
    emailAddress: 'ada@example.test',
    organizationName: 'Ada Labs',
    organizationRateLimitTier: 'max'
  }
}
const line = (output: number, position: number): UsageDelta => ({
  sessionKey: 'claude:a',
  projectKey: 'p_repo',
  projectLabel: 'repo',
  file: '/p/a.jsonl',
  atMs: Date.now(),
  position,
  counts: { input: 0, output, cacheWrite: 0, cacheRead: 0 }
})
const usage = (...deltas: UsageDelta[]): unknown => ({ type: 'usage', v: 1, deltas })
const snapshot: OfficeSnapshot = { rev: 1, generatedAtMs: 1, sources: [], sessions: [session('a')] }

async function running(isWatching = true): Promise<AccountLedger> {
  const ledger = new AccountLedger({
    isWatching,
    readDefaultIdentity: async () => signedIn,
    readOrcaIdentities: async () => [],
    listOrcaAccounts: async () => null,
    load: () => null,
    save: () => {}
  })
  ledger.start()
  await vi.advanceTimersByTimeAsync(1_000)
  return ledger
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('reports today’s tokens per project, as the Office snapshot carries them', async () => {
  const ledger = await running()
  ledger.ingestBridgeMessage(usage(line(5, 0)))
  expect(ledger.projectsToday()).toEqual([{ projectKey: 'p_repo', tokens: 5 }])
  expect(ledger.projectsToday()).toEqual(ledger.decorate(snapshot).projectsToday)
})

it('walks the buckets again only once counting has changed them', async () => {
  const ledger = await running()
  ledger.ingestBridgeMessage(usage(line(5, 0)))
  const walk = vi.spyOn(accountsView, 'projectsToday')
  const first = ledger.projectsToday()
  expect(ledger.projectsToday()).toBe(first)
  expect(walk).toHaveBeenCalledTimes(1)
  ledger.ingestBridgeMessage(usage(line(7, 512)))
  expect(ledger.projectsToday()).toEqual([{ projectKey: 'p_repo', tokens: 12 }])
  expect(walk).toHaveBeenCalledTimes(2)
})

it('starts a new day with no tokens spent', async () => {
  const ledger = await running()
  ledger.ingestBridgeMessage(usage(line(5, 0)))
  expect(ledger.projectsToday()).toEqual([{ projectKey: 'p_repo', tokens: 5 }])
  vi.setSystemTime(new Date(2026, 9, 12, 0, 0, 1).getTime())
  expect(ledger.projectsToday()).toEqual([])
})

it('has no totals while accounts are not watched', async () => {
  expect((await running(false)).projectsToday()).toBeUndefined()
})
