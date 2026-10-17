import { afterEach, expect, it, vi } from 'vitest'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { emptySnapshot } from './reducer'

const mocks = vi.hoisted(() => ({
  tick: vi.fn(),
  start: vi.fn(),
  setIntervalMs: vi.fn(),
  usageDurable: vi.fn(),
  options: vi.fn(),
  ticksUntilCounted: 0
}))
vi.mock('./poller', () => ({
  BridgePoller: class {
    constructor(options: unknown) {
      mocks.options(options)
    }
    tick = mocks.tick
    start = mocks.start
    setIntervalMs = mocks.setIntervalMs
    usageDurable = mocks.usageDurable
    get isCountingUsage(): boolean {
      return mocks.tick.mock.calls.length < mocks.ticksUntilCounted
    }
  }
}))
import { main } from './index'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  mocks.ticksUntilCounted = 0
})
it('prints exactly one JSON snapshot and does not start polling in once mode', async () => {
  const snapshot = emptySnapshot()
  mocks.tick.mockResolvedValue(snapshot)
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await main(['--once', '--root', './extra'])
  expect(write).toHaveBeenCalledWith(`${JSON.stringify(snapshot)}\n`)
  expect(mocks.start).not.toHaveBeenCalled()
  expect(mocks.options).toHaveBeenCalledWith({
    claudeRoots: [join(homedir(), '.claude'), resolve('./extra')]
  })
})
// health-4: the parent names where usage offsets are kept, so a restarted bridge resumes.
it('keeps usage offsets where --usage-offsets says', async () => {
  mocks.tick.mockResolvedValue(emptySnapshot())
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await main(['--once', '--usage-offsets', './state/offsets.json'])
  expect(mocks.options).toHaveBeenCalledWith(
    expect.objectContaining({ usageOffsetsPath: resolve('./state/offsets.json') })
  )
})
it('derives Codex account keys only when started with --accounts', async () => {
  mocks.tick.mockResolvedValue(emptySnapshot())
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await main(['--once', '--accounts'])
  expect(mocks.options).toHaveBeenCalledWith(expect.objectContaining({ derivesAccounts: true }))
})
it('keeps ticking in once mode until tokens are counted, and prints only the last snapshot', async () => {
  const snapshots = [1, 2, 3].map((rev) => ({ ...emptySnapshot(), rev }))
  for (const snapshot of snapshots) mocks.tick.mockResolvedValueOnce(snapshot)
  mocks.ticksUntilCounted = 3
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await main(['--once'])
  expect(mocks.tick).toHaveBeenCalledTimes(3)
  expect(write.mock.calls).toEqual([[`${JSON.stringify(snapshots[2])}\n`]])
})
it('gives up waiting in once mode when counting never finishes', async () => {
  mocks.tick.mockResolvedValue(emptySnapshot())
  mocks.ticksUntilCounted = Infinity
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await main(['--once'])
  expect(mocks.tick).toHaveBeenCalledTimes(30)
  expect(write).toHaveBeenCalledTimes(1)
})
it('forwards utility-process feed messages through the parent port', async () => {
  const message = { type: 'hello', v: 1, snapshot: emptySnapshot() }
  mocks.start.mockImplementation(async (post: (value: unknown) => void) => {
    post(message)
    return () => {}
  })
  const postMessage = vi.fn()
  await main([], { postMessage, on: vi.fn() })
  expect(postMessage).toHaveBeenCalledWith(message)
})
it('polls at the pace its parent asks for, and ignores anything else it is sent', async () => {
  mocks.start.mockResolvedValue(() => {})
  const on = vi.fn()
  await main([], { postMessage: vi.fn(), on })
  const [event, hear] = on.mock.calls[0]
  expect(event).toBe('message')

  hear({ data: { type: 'pace', intervalMs: 30_000 } })
  hear({ data: { type: 'pace', intervalMs: 'fast' } })
  hear({ data: 'pace' })
  expect(mocks.setIntervalMs.mock.calls).toEqual([[30_000]])
})
it('posts added tokens to the parent as their own message, apart from the feed', async () => {
  mocks.start.mockResolvedValue(() => {})
  const postMessage = vi.fn()
  await main([], { postMessage, on: vi.fn() })
  const deltas = [
    {
      sessionKey: 'claude:a',
      projectKey: 'p_1',
      projectLabel: 'repo',
      file: '/p/a.jsonl',
      atMs: 5,
      counts: { input: 1, output: 2, cacheWrite: 0, cacheRead: 0 }
    }
  ]
  mocks.options.mock.calls[0][0].onUsage(deltas, 3)
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'usage', v: 1, handover: 3, deltas })
})
it('tells the poller which hand-over its parent has on disk, and ignores a malformed answer', async () => {
  mocks.start.mockResolvedValue(() => {})
  const on = vi.fn()
  await main([], { postMessage: vi.fn(), on })
  const [, hear] = on.mock.calls[0]
  hear({ data: { type: 'usage-durable', handover: 4 } })
  hear({ data: { type: 'usage-durable', handover: -1 } })
  hear({ data: { type: 'usage-durable', handover: '5' } })
  expect(mocks.usageDurable.mock.calls).toEqual([[4]])
})
it('posts Codex totals to the parent as their own message too, and listens for neither in once mode', async () => {
  mocks.start.mockResolvedValue(() => {})
  const postMessage = vi.fn()
  await main([], { postMessage, on: vi.fn() })
  const totals = [
    {
      sessionKey: 'codex:a',
      projectKey: 'p_1',
      projectLabel: 'repo',
      accountKey: null,
      threadStartedAtMs: 5,
      counts: { input: 1, output: 2, cacheWrite: 0, cacheRead: 0 }
    }
  ]
  mocks.options.mock.calls[0][0].onCodexTotals(totals)
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'codex-usage', v: 1, totals })

  mocks.options.mockClear()
  mocks.tick.mockResolvedValue(emptySnapshot())
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  await main(['--once'])
  expect(mocks.options.mock.calls[0][0]).not.toHaveProperty('onCodexTotals')
})
