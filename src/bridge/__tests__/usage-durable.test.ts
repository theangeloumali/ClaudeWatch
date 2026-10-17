import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { UsageDelta } from '../../shared/accounts'
import { fixtureIo, registryEntry } from '../__fixtures__/helpers'
import { BridgePoller, type PollerOptions } from '../poller'

// A saved offset must never run ahead of the tokens the ledger has on disk.
const transcript = '/claude/projects/-repo/a.jsonl'
const startMs = Date.parse('2026-10-17T10:00:00.000Z')
const usageLine = (id: string, output: number): string =>
  `${JSON.stringify({
    type: 'assistant',
    timestamp: new Date(startMs - 60_000).toISOString(),
    message: { id, usage: { input_tokens: 1, output_tokens: output } }
  })}\n`

let folder = ''
let clockMs = startMs
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'usage-durable-'))
  clockMs = startMs
})
afterEach(() => rm(folder, { recursive: true, force: true }))

function pollerOptions(): PollerOptions {
  const entry = registryEntry()
  const io = fixtureIo({
    '/claude/sessions/42.json': JSON.stringify(entry),
    '/repo/.git': null,
    [transcript]: usageLine('m1', 5) + usageLine('m2', 9)
  })
  io.exec = async (_file, args) => (args[0] === '-o' ? entry.procStart : '')
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), ino: 11 })
  return {
    platform: 'darwin',
    io,
    claudeRoots: ['/claude'],
    codexRoot: '/codex',
    now: () => clockMs,
    usageOffsetsPath: join(folder, 'usage-offsets.json')
  }
}

const outputOf = (deltas: UsageDelta[]): number =>
  deltas.reduce((sum, delta) => sum + delta.counts.output, 0)

it('a crash between the offset save and the ledger save loses no tokens', async () => {
  const options = pollerOptions()
  const handed: UsageDelta[] = []
  const first = new BridgePoller({ ...options, onUsage: (deltas) => void handed.push(...deltas) })
  await first.tick()
  await first.tick()
  clockMs += 31_000
  await first.tick()
  expect(outputOf(handed)).toBe(14)

  // The app dies before the ledger wrote what it was handed: a restart must hand it over again.
  const recounted: UsageDelta[] = []
  const second = new BridgePoller({
    ...options,
    onUsage: (deltas) => void recounted.push(...deltas)
  })
  await second.tick()
  await second.tick()
  expect(outputOf(recounted)).toBe(14)
})

it('once the ledger has the tokens on disk, a restarted poller reads none of them again', async () => {
  const options = pollerOptions()
  const handovers: number[] = []
  const first = new BridgePoller({
    ...options,
    onUsage: (_deltas, handover) => void handovers.push(handover)
  })
  await first.tick()
  await first.tick()
  expect(handovers).toEqual([1])
  first.usageDurable(1)
  clockMs += 31_000
  await first.tick()

  const read = vi.spyOn(options.io!, 'readFrom')
  const onUsage = vi.fn()
  const second = new BridgePoller({ ...options, onUsage })
  await second.tick()
  await second.tick()
  expect(read).not.toHaveBeenCalled()
  expect(onUsage).not.toHaveBeenCalled()
})

it('an answer for a later hand-over than the bridge made saves nothing past it', async () => {
  const options = pollerOptions()
  const first = new BridgePoller({ ...options, onUsage: () => {} })
  await first.tick()
  first.usageDurable(5)
  await first.tick()
  clockMs += 31_000
  await first.tick()

  const onUsage = vi.fn()
  const second = new BridgePoller({ ...options, onUsage })
  await second.tick()
  await second.tick()
  expect(onUsage).toHaveBeenCalledOnce()
})
