import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fixtureIo, registryEntry } from '../__fixtures__/helpers'
import { BridgePoller } from '../poller'

// health-4: a restarted bridge resumes its usage catch-up instead of re-reading every transcript.
const transcript = '/claude/projects/-repo/a.jsonl'
const usageLine = (id: string, output: number): string =>
  `${JSON.stringify({
    type: 'assistant',
    message: {
      id,
      usage: {
        input_tokens: 1,
        output_tokens: output,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }
    }
  })}\n`

let folder = ''
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'usage-resume-'))
})
afterEach(() => rm(folder, { recursive: true, force: true }))

function bridgeIo() {
  const entry = registryEntry()
  const io = fixtureIo({
    '/claude/sessions/42.json': JSON.stringify(entry),
    '/repo/.git': null,
    [transcript]: usageLine('m1', 5) + usageLine('m2', 9)
  })
  io.exec = async (_file, args) => (args[0] === '-o' ? entry.procStart : '')
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), ino: 11 })
  return io
}

it('a restarted poller reads no transcript bytes it counted before', async () => {
  const io = bridgeIo()
  const options = {
    platform: 'darwin' as const,
    io,
    claudeRoots: ['/claude'],
    codexRoot: '/codex',
    usageOffsetsPath: join(folder, 'usage-offsets.json')
  }
  const first = new BridgePoller(options)
  await first.tick()
  const counted = (await first.tick()).sessions[0]?.usage

  const read = vi.spyOn(io, 'readFrom')
  const second = new BridgePoller(options)
  await second.tick()
  const resumed = (await second.tick()).sessions[0]?.usage

  expect(counted?.own.output).toBe(14)
  expect(read).not.toHaveBeenCalled()
  expect(resumed).toEqual(counted)
})
