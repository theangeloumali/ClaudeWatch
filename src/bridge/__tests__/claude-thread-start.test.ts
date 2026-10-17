import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fixtureIo, registryEntry } from '../__fixtures__/helpers'
import { BridgePoller } from '../poller'

// A resumed conversation keeps its earlier turns, and their usage, in the same transcript.
const transcript = '/claude/projects/-repo/a.jsonl'
const begunAt = '2026-10-09T08:00:00.000Z'
const record = (value: Record<string, unknown>): string => `${JSON.stringify(value)}\n`
const reply = (id: string, timestamp: string): string =>
  record({
    type: 'assistant',
    timestamp,
    message: { id, usage: { input_tokens: 1, output_tokens: 5 } }
  })

let folder = ''
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'thread-start-'))
})
afterEach(() => rm(folder, { recursive: true, force: true }))

function resumedConversation() {
  const entry = registryEntry()
  const io = fixtureIo({
    '/claude/sessions/42.json': JSON.stringify(entry),
    '/repo/.git': null,
    [transcript]:
      record({ type: 'summary', summary: 'Earlier work' }) +
      record({ type: 'user', timestamp: begunAt, message: { role: 'user', content: 'hi' } }) +
      reply('m1', begunAt) +
      reply('m2', '2026-10-10T15:30:00.000Z')
  })
  io.exec = async (_file, args) => (args[0] === '-o' ? entry.procStart : '')
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), ino: 11 })
  const options = {
    platform: 'darwin' as const,
    io,
    claudeRoots: ['/claude'],
    codexRoot: '/codex',
    usageOffsetsPath: join(folder, 'usage-offsets.json')
  }
  return { io, options }
}

it('a Claude conversation resumed today reports when its thread began', async () => {
  const poller = new BridgePoller(resumedConversation().options)
  await poller.tick()
  const [session] = (await poller.tick()).sessions
  expect(session?.threadStartedAtMs).toBe(Date.parse(begunAt))
  // Its process started a day later; only the thread's own start dates the usage it carries.
  expect(session?.startedAtMs).toBeGreaterThan(Date.parse(begunAt))
})

it('keeps when a thread began across a restart, without reading the transcript again', async () => {
  const { io, options } = resumedConversation()
  const first = new BridgePoller(options)
  await first.tick()
  await first.tick()

  const read = vi.spyOn(io, 'readFrom')
  const second = new BridgePoller(options)
  await second.tick()
  const [session] = (await second.tick()).sessions
  expect(session?.threadStartedAtMs).toBe(Date.parse(begunAt))
  expect(read).not.toHaveBeenCalled()
})
