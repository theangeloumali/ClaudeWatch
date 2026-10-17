import { beforeEach, expect, it, vi } from 'vitest'

const { handle, fork } = vi.hoisted(() => ({ handle: vi.fn(), fork: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle },
  app: { isPackaged: false, getPath: () => '/unused-user-data', getAppPath: () => '/unused-app' },
  shell: { openExternal: vi.fn() },
  screen: { getAllDisplays: () => [] },
  utilityProcess: { fork },
  BrowserWindow: vi.fn()
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('./platform/exec', () => ({ execFilePromise: vi.fn() }))
vi.mock('./terminal-opener', () => ({ openTerminal: vi.fn(), openTerminalRunning: vi.fn() }))

import { session } from '../bridge/__fixtures__/helpers'
import type { OfficeSnapshot, SessionRef } from '../shared/office/types'
import { setupOffice } from './office-setup'

const ACCOUNT = {
  key: 'claude:aaaaaaaaaaaa',
  provider: 'claude' as const,
  label: 'Work',
  plan: null,
  isActive: true
}
const decorateSession = (value: SessionRef): SessionRef => ({
  ...value,
  accountKey: ACCOUNT.key,
  accountConfidence: 'inferred'
})
const accounts = {
  ingestBridgeMessage: vi.fn(),
  observeSessions: vi.fn(),
  decorateSession,
  decorate: (snapshot: OfficeSnapshot): OfficeSnapshot => ({
    ...snapshot,
    sessions: snapshot.sessions.map(decorateSession),
    accounts: [ACCOUNT]
  }),
  onOfficeChange: vi.fn(() => () => {}),
  isWatchingAccounts: false,
  onWatchingChange: vi.fn((_listener: () => void) => () => {}),
  onUsageDurable: vi.fn((_listener: () => void) => vi.fn())
}
const bridge = { on: vi.fn(), kill: vi.fn(), postMessage: vi.fn() }
const bridgeSays = (message: unknown): void => {
  for (const [event, listener] of bridge.on.mock.calls) if (event === 'message') listener(message)
}
const snapshot: OfficeSnapshot = {
  rev: 3,
  generatedAtMs: 1,
  sources: [],
  sessions: [session('a')]
}
let office: ReturnType<typeof setupOffice>

beforeEach(() => {
  vi.clearAllMocks()
  accounts.isWatchingAccounts = false
  fork.mockReturnValue(bridge)
  office = setupOffice(
    { resolve: vi.fn() },
    { getOfficeWindowBounds: vi.fn(), setOfficeWindowBounds: vi.fn() },
    { getInstances: vi.fn(() => []) },
    accounts
  )
  office.start()
})

const offsets = ['--usage-offsets', '/unused-user-data/usage-offsets.json']

it('has the bridge derive Codex accounts only while accounts are watched, restarting it when that changes', () => {
  expect(fork).toHaveBeenLastCalledWith(expect.any(String), offsets, expect.anything())
  accounts.isWatchingAccounts = true
  accounts.onWatchingChange.mock.calls[0][0]()
  expect(bridge.kill).toHaveBeenCalledOnce()
  expect(fork).toHaveBeenLastCalledWith(
    expect.any(String),
    ['--accounts', ...offsets],
    expect.anything()
  )
})

it('passes everything the bridge posts to the ledger, which keeps only token counts', () => {
  const usage = { type: 'usage', v: 1, deltas: [] }
  bridgeSays(usage)
  expect(accounts.ingestBridgeMessage).toHaveBeenCalledExactlyOnceWith(usage)
  // A usage message is not part of the Office feed and must not disturb the snapshot.
  expect(office.snapshot()).toBeNull()
})

it('shows the ledger every session the bridge reports, so Codex totals are counted', () => {
  bridgeSays({ type: 'hello', v: 1, snapshot })
  expect(accounts.observeSessions).toHaveBeenCalledExactlyOnceWith(snapshot.sessions)
  bridgeSays({ type: 'patch', v: 1, seq: 4, upserts: [session('b')], removed: [] })
  expect(accounts.observeSessions).toHaveBeenLastCalledWith([session('a'), session('b')])
})

it('serves the snapshot with each session’s account and the account list', () => {
  bridgeSays({ type: 'hello', v: 1, snapshot })
  expect(office.snapshot()).toMatchObject({
    rev: 3,
    accounts: [ACCOUNT],
    sessions: [{ key: 'claude:a', accountKey: ACCOUNT.key, accountConfidence: 'inferred' }]
  })
})

it('tells the bridge the latest hand-over once the ledger has it on disk, and only once', () => {
  const ledgerSaved = accounts.onUsageDurable.mock.calls[0][0]
  ledgerSaved()
  expect(bridge.postMessage).not.toHaveBeenCalled()
  bridgeSays({ type: 'usage', v: 1, handover: 1, deltas: [] })
  bridgeSays({ type: 'usage', v: 1, handover: 2, deltas: [] })
  ledgerSaved()
  ledgerSaved()
  expect(bridge.postMessage.mock.calls).toEqual([[{ type: 'usage-durable', handover: 2 }]])
})

it('stops answering a bridge once it has exited', () => {
  const unsubscribe = accounts.onUsageDurable.mock.results[0]?.value
  office.stop()
  expect(unsubscribe).not.toHaveBeenCalled()
  for (const [event, listener] of bridge.on.mock.calls) if (event === 'exit') listener(0)
  expect(unsubscribe).toHaveBeenCalledOnce()
})
