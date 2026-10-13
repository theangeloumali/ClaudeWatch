import { expect, it, vi } from 'vitest'
import { type SessionFiles, UsageTracker } from './usage-tracker'
import { listAgentFiles } from './subagents'
import { fixtureIo, hostPath } from './__fixtures__/helpers'

const message = (id: string, input: number, output: number, cacheRead = 0): string =>
  `${JSON.stringify({
    type: 'assistant',
    message: {
      id,
      content: [{ type: 'text', text: 'CANARY_TEXT' }],
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: cacheRead
      }
    }
  })}\n`
const counts = (input: number, output: number, cacheRead = 0) => ({
  input,
  output,
  cacheWrite: 0,
  cacheRead
})
const main = hostPath('/p/s.jsonl')
const plain = hostPath('/p/s/subagents/agent-abc.jsonl')
const workflow = hostPath('/p/s/subagents/workflows/wf_1/agent-def.jsonl')

async function sessionFiles(
  io: ReturnType<typeof fixtureIo>,
  teammates: [string, string[]][] = []
): Promise<Map<string, SessionFiles>> {
  return new Map([
    ['claude:s', { main, agents: await listAgentFiles(main, io), teammates: new Map(teammates) }]
  ])
}

it('reports own, every agent including workflow agents and teammates, and how many were spawned', async () => {
  const io = fixtureIo({
    [main]: message('m1', 1, 10, 100) + message('m1', 1, 30, 100) + message('m2', 2, 5, 700),
    [plain]: message('a1', 3, 2) + message('a1', 3, 468),
    [workflow]: message('w1', 4, 50),
    [hostPath('/p/mate.jsonl')]: message('t1', 5, 6),
    [hostPath('/p/mate/subagents/agent-xyz.jsonl')]: message('x1', 100, 200)
  })
  const tracker = new UsageTracker(io)
  // A teammate's entry is its own transcript followed by those of the agents it spawned.
  const mate = [hostPath('/p/mate.jsonl'), hostPath('/p/mate/subagents/agent-xyz.jsonl')]
  await tracker.scan(await sessionFiles(io, [['lena@session-s', mate]]))
  expect(tracker.usage('claude:s')).toEqual({
    own: counts(3, 35, 800),
    subagents: counts(112, 724),
    spawned: 4,
    contextTokens: 702,
    contextLimit: null
  })
  expect(tracker.tokens([plain])).toEqual(counts(3, 468))
  expect(tracker.tokens(mate)).toEqual(counts(105, 206))
  expect(tracker.tokens(['/p/unknown.jsonl'])).toBeNull()
  expect(tracker.usage('claude:other')).toBeNull()
  expect(JSON.stringify(tracker.usage('claude:s'))).not.toContain('CANARY')
})

it('reads only appended bytes on the next scan and leaves unchanged files alone', async () => {
  const files: Record<string, string> = {
    [main]: message('m1', 1, 1),
    [plain]: message('a1', 1, 1)
  }
  const io = fixtureIo(files)
  const tracker = new UsageTracker(io)
  await tracker.scan(await sessionFiles(io))
  const firstLength = Buffer.byteLength(files[main])
  files[main] += message('m2', 2, 2) + message('m2', 2, 9)
  const read = vi.spyOn(io, 'readFrom')
  await tracker.scan(await sessionFiles(io))
  expect(read.mock.calls.map(([path, offset]) => [path, offset])).toEqual([[main, firstLength]])
  expect(tracker.usage('claude:s')?.own).toEqual(counts(3, 10))
})

it('waits for a half-written line, and recounts from the start when the file shrinks', async () => {
  const whole = message('m2', 2, 20)
  const files: Record<string, string> = { [main]: message('m1', 1, 10) + whole.slice(0, 40) }
  const io = fixtureIo(files)
  const tracker = new UsageTracker(io)
  await tracker.scan(await sessionFiles(io))
  expect(tracker.usage('claude:s')?.own).toEqual(counts(1, 10))
  files[main] = message('m1', 1, 10) + whole
  await tracker.scan(await sessionFiles(io))
  expect(tracker.usage('claude:s')?.own).toEqual(counts(3, 30))
  files[main] = message('m9', 7, 7)
  await tracker.scan(await sessionFiles(io))
  expect(tracker.usage('claude:s')?.own).toEqual(counts(7, 7))
})

it('spends a bounded number of bytes per scan and reports nothing until a session is counted', async () => {
  const line = message('m1', 1, 1)
  const files: Record<string, string> = {
    [main]: line + message('m2', 1, 1) + message('m3', 1, 1),
    [plain]: message('a1', 1, 1)
  }
  const io = fixtureIo(files)
  const tracker = new UsageTracker(io, { budgetBytes: Buffer.byteLength(line) + 1 })
  const read = vi.spyOn(io, 'readFrom')
  await tracker.scan(await sessionFiles(io))
  expect(read.mock.calls.every(([, , maxBytes]) => maxBytes <= Buffer.byteLength(line) + 1)).toBe(
    true
  )
  expect(tracker.usage('claude:s')).toBeNull()
  expect(tracker.isBehind).toBe(true)
  for (let scans = 0; scans < 3; scans++) await tracker.scan(await sessionFiles(io))
  expect(tracker.isBehind).toBe(false)
  expect(tracker.usage('claude:s')).toMatchObject({ own: counts(3, 3), subagents: counts(1, 1) })
  // Once counted, a session keeps reporting while a later scan is still catching up.
  files[main] += message('m4', 1, 1) + message('m5', 1, 1)
  await tracker.scan(await sessionFiles(io))
  expect(tracker.usage('claude:s')?.own).toEqual(counts(4, 4))
})

it('skips a line longer than one read instead of stalling on it', async () => {
  const files = {
    [main]: message('m1', 1, 1) + `${'x'.repeat(5000)}\n` + message('m2', 2, 2)
  }
  const io = fixtureIo(files)
  const tracker = new UsageTracker(io, { chunkBytes: 1024 })
  await tracker.scan(await sessionFiles(io))
  expect(tracker.isBehind).toBe(false)
  expect(tracker.usage('claude:s')?.own).toEqual(counts(3, 3))
})

it('forgets a session that left, so state stays bounded while the bridge runs for days', async () => {
  const io = fixtureIo({ [main]: message('m1', 1, 1), [plain]: message('a1', 1, 1) })
  const tracker = new UsageTracker(io)
  await tracker.scan(await sessionFiles(io))
  await tracker.scan(new Map())
  expect(tracker.usage('claude:s')).toBeNull()
  expect(tracker.tokens([main])).toBeNull()
  expect(tracker.tokens([plain])).toBeNull()
  // Nothing was kept: a session that comes back is read again from its first byte.
  const read = vi.spyOn(io, 'readFrom')
  await tracker.scan(await sessionFiles(io))
  expect(read.mock.calls.map(([path, offset]) => [path, offset])).toEqual([
    [main, 0],
    [plain, 0]
  ])
})

it('reports an unreadable transcript as unknown and unhealthy, never as zero', async () => {
  const io = fixtureIo({ [main]: message('m1', 1, 1), [plain]: message('a1', 1, 1) })
  const tracker = new UsageTracker(io)
  await tracker.scan(await sessionFiles(io))
  expect(tracker.health()).toEqual({ id: 'usage', ok: true, detail: 'counted' })
  io.stat = async () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' })
  }
  await tracker.scan(
    new Map([['claude:s', { main, agents: [], teammates: new Map<string, string[]>() }]])
  )
  expect(tracker.usage('claude:s')).toBeNull()
  expect(tracker.health()).toEqual({ id: 'usage', ok: false, detail: 'transcript read failed' })
})

it('keeps counting a teammate that finished, for as long as its lead session lives', async () => {
  const mate = [hostPath('/p/mate.jsonl'), hostPath('/p/mate/subagents/agent-xyz.jsonl')]
  const files: Record<string, string> = {
    [main]: message('m1', 10, 10),
    [mate[0]]: message('t1', 500, 500),
    [mate[1]]: message('x1', 20, 30)
  }
  const io = fixtureIo(files)
  const tracker = new UsageTracker(io)
  await tracker.scan(await sessionFiles(io, [['lena@session-s', mate]]))
  const whileAlive = tracker.usage('claude:s')
  expect(whileAlive).toMatchObject({ subagents: counts(520, 530), spawned: 2 })

  // The teammate's process exits, so the roster no longer lists it.
  await tracker.scan(await sessionFiles(io))
  expect(tracker.usage('claude:s')).toEqual(whileAlive)
  // What it wrote last, just before leaving, still counts.
  files[mate[0]] += message('t2', 1, 2)
  await tracker.scan(await sessionFiles(io))
  expect(tracker.usage('claude:s')).toMatchObject({ subagents: counts(521, 532), spawned: 2 })

  // Only the lead's own exit lets go of them.
  await tracker.scan(new Map())
  expect(tracker.tokens(mate)).toBeNull()
  await tracker.scan(await sessionFiles(io))
  expect(tracker.usage('claude:s')).toMatchObject({ subagents: counts(0, 0), spawned: 0 })
})
