import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { UsageDelta } from '../../shared/accounts'
import { AccountLedger } from './account-ledger'
import type { IdentityRead } from './identity'
import { emptyLedger, type LedgerState } from './ledger-state'

// The bridge saves transcript offsets only as far as the ledger has the tokens on disk.
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
const usage = (position: number): unknown => ({
  type: 'usage',
  v: 1,
  handover: 1,
  deltas: [
    {
      sessionKey: 'claude:a',
      projectKey: 'p_repo',
      projectLabel: 'repo',
      file: '/p/a.jsonl',
      atMs: Date.now(),
      position,
      counts: { input: 0, output: 7, cacheWrite: 0, cacheRead: 0 }
    } satisfies UsageDelta
  ]
})

function setup() {
  const deps = {
    isWatching: true,
    readDefaultIdentity: vi.fn(async () => signedIn),
    readOrcaIdentities: vi.fn(async () => []),
    listOrcaAccounts: vi.fn(async () => null),
    load: vi.fn((): LedgerState | null => emptyLedger(Date.now() - 60_000)),
    save: vi.fn()
  }
  const ledger = new AccountLedger(deps)
  const durable = vi.fn()
  ledger.onUsageDurable(durable)
  return { deps, ledger, durable }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Drains the first look's own save, so what follows starts with nothing unsaved.
async function settled(ledger: AccountLedger): Promise<void> {
  ledger.start()
  await vi.advanceTimersByTimeAsync(10 * 60_000)
}

it('says counted tokens are durable only once its save has written them', async () => {
  const { deps, ledger, durable } = setup()
  await settled(ledger)
  durable.mockClear()
  ledger.ingestBridgeMessage(usage(100))
  expect(durable).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(2 * 60_000)
  expect(deps.save).toHaveBeenCalled()
  expect(durable).toHaveBeenCalledOnce()
})

it('keeps quiet while its save fails, and speaks after the next one works', async () => {
  const { deps, ledger, durable } = setup()
  await settled(ledger)
  durable.mockClear()
  deps.save.mockImplementationOnce(() => {
    throw new Error('ENOSPC')
  })
  ledger.ingestBridgeMessage(usage(100))
  await vi.advanceTimersByTimeAsync(2 * 60_000)
  expect(durable).not.toHaveBeenCalled()
  ledger.ingestBridgeMessage(usage(200))
  await vi.advanceTimersByTimeAsync(2 * 60_000)
  expect(durable).toHaveBeenCalledOnce()
})

it('with accounts unwatched, handed tokens are durable at once: nothing will count them', () => {
  const { deps, ledger, durable } = setup()
  ledger.setWatching(false)
  ledger.ingestBridgeMessage(usage(100))
  expect(durable).toHaveBeenCalledOnce()
  expect(deps.save).not.toHaveBeenCalled()
})

it('never says tokens are durable while its ledger cannot be read', async () => {
  const { deps, ledger, durable } = setup()
  deps.load.mockImplementation(() => {
    throw new Error('EACCES')
  })
  ledger.start()
  await vi.advanceTimersByTimeAsync(0)
  ledger.ingestBridgeMessage(usage(100))
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(durable).not.toHaveBeenCalled()
})

it('holds tokens handed before its first look until a save holds them', async () => {
  const { deps, ledger, durable } = setup()
  deps.readDefaultIdentity.mockImplementationOnce(() => new Promise(() => {}))
  ledger.start()
  await vi.advanceTimersByTimeAsync(0)
  ledger.ingestBridgeMessage(usage(100))
  ledger.stop()
  expect(durable).not.toHaveBeenCalled()
})
