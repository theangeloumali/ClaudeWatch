import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { BridgePoller } from './poller'
import { type TranscriptDelta, UsageTracker } from './usage-tracker'
import { projectSlug } from './transcript-tail'
import { fixtureIo, hostPath, isTableQuery, registryEntry } from './__fixtures__/helpers'

const minuteMs = (minute: number): number => Date.parse(`2026-10-11T10:${minute}:00.000Z`)
const stamped = (id: string, output: number, minute: number): string =>
  `${JSON.stringify({
    type: 'assistant',
    timestamp: new Date(minuteMs(minute)).toISOString(),
    message: {
      id,
      content: [{ type: 'text', text: 'CANARY_TEXT' }],
      usage: { input_tokens: 0, output_tokens: output }
    }
  })}\n`
const output = (value: number) => ({ input: 0, output: value, cacheWrite: 0, cacheRead: 0 })
const bytes = (text: string): number => Buffer.byteLength(text)

it('reports the tokens each transcript added, once, under the session that owns the file', async () => {
  const main = '/p/s.jsonl'
  const agent = '/p/s/subagents/agent-abc.jsonl'
  const mate = '/p/mate.jsonl'
  const files: Record<string, string> = {
    [main]: stamped('m1', 5, 10),
    [agent]: stamped('a1', 7, 11),
    [mate]: stamped('t1', 3, 12)
  }
  const tracker = new UsageTracker(fixtureIo(files))
  const added: unknown[] = []
  const scan = (): Promise<void> =>
    tracker.scan(
      new Map([
        [
          'claude:s',
          {
            main,
            agents: [{ id: 'abc', path: agent, size: Buffer.byteLength(files[agent]), mtimeMs: 1 }],
            teammates: new Map([['lena@session-s', [mate]]])
          }
        ]
      ]),
      (delta) => added.push(delta)
    )
  await scan()
  const place = { sessionKey: 'claude:s', position: 0 }
  expect(added).toEqual([
    { ...place, file: main, atMs: minuteMs(10), counts: output(5) },
    { ...place, file: agent, atMs: minuteMs(11), counts: output(7) },
    { ...place, file: mate, atMs: minuteMs(12), counts: output(3) }
  ])
  added.length = 0
  await scan()
  expect(added).toEqual([])
  const appendedAt = bytes(files[main])
  files[main] += stamped('m1', 9, 13)
  await scan()
  expect(added).toEqual([
    { ...place, file: main, atMs: minuteMs(13), position: appendedAt, counts: output(4) }
  ])
  expect(JSON.stringify(added)).not.toContain('CANARY')
})

it('reports added tokens with the project of their session, on the tick they arrive', async () => {
  const entry = registryEntry(process.platform)
  const root = hostPath('/claude')
  const transcript = join(root, 'projects', projectSlug(entry.cwd), 'a.jsonl')
  const io = fixtureIo({
    [join(root, 'sessions', '42.json')]: JSON.stringify(entry),
    [hostPath('/repo/.git')]: null,
    [transcript]: stamped('m1', 9, 10)
  })
  io.exec = async (file, args) => (isTableQuery(file, args) ? '' : entry.procStart)
  const onUsage = vi.fn()
  const poller = new BridgePoller({ io, claudeRoots: [root], codexRoot: '/codex', onUsage })
  // The first tick publishes before counting, so it has nothing to report.
  await poller.tick()
  expect(onUsage).not.toHaveBeenCalled()
  await poller.tick()
  expect(onUsage).toHaveBeenCalledExactlyOnceWith([
    {
      sessionKey: 'claude:a',
      projectKey: expect.stringMatching(/^p_/),
      projectLabel: 'repo',
      file: transcript,
      atMs: minuteMs(10),
      position: 0,
      counts: output(9)
    }
  ])
  await poller.tick()
  expect(onUsage).toHaveBeenCalledOnce()
  expect(JSON.stringify(onUsage.mock.calls)).not.toContain('CANARY')
})

it('reports a finished teammate’s last lines once, and never its earlier ones again', async () => {
  const main = '/p/s.jsonl'
  const mate = '/p/mate.jsonl'
  const files: Record<string, string> = {
    [main]: stamped('m1', 5, 10),
    [mate]: stamped('t1', 3, 12)
  }
  const tracker = new UsageTracker(fixtureIo(files))
  const added: unknown[] = []
  const scan = (teammates: [string, string[]][]): Promise<void> =>
    tracker.scan(
      new Map([['claude:s', { main, agents: [], teammates: new Map(teammates) }]]),
      (delta) => added.push(delta)
    )
  await scan([['lena@session-s', [mate]]])
  added.length = 0

  const appendedAt = bytes(files[mate])
  files[mate] += stamped('t2', 8, 13)
  await scan([])
  expect(added).toEqual([
    {
      sessionKey: 'claude:s',
      file: mate,
      atMs: minuteMs(13),
      position: appendedAt,
      counts: output(8)
    }
  ])
  added.length = 0
  await scan([])
  expect(added).toEqual([])
})

// Every delta of one transcript, read by a fresh tracker until it has caught up.
async function readAll(
  files: Record<string, string>,
  limits: { budgetBytes?: number; chunkBytes?: number } = {}
): Promise<TranscriptDelta[]> {
  const tracker = new UsageTracker(fixtureIo(files), limits)
  const added: TranscriptDelta[] = []
  const sessions = new Map([
    ['claude:s', { main: '/p/s.jsonl', agents: [], teammates: new Map<string, string[]>() }]
  ])
  do await tracker.scan(sessions, (delta) => added.push(delta))
  while (tracker.isBehind)
  return added
}

it('gives a line the same place whether it is read as it is appended or again from the first line', async () => {
  const main = '/p/s.jsonl'
  const prompt = `${JSON.stringify({ type: 'user', message: { content: 'naïve — 🙂' } })}\n`
  // Two lines of one message written in the same millisecond, with a read falling between them.
  const lines = [stamped('m1', 5, 10), prompt, stamped('m1', 9, 10), stamped('m2', 3, 11)]
  const files = { [main]: lines[0] + lines[1] }
  const tracker = new UsageTracker(fixtureIo(files))
  const appended: TranscriptDelta[] = []
  const scan = (): Promise<void> =>
    tracker.scan(
      new Map([['claude:s', { main, agents: [], teammates: new Map<string, string[]>() }]]),
      (delta) => appended.push(delta)
    )
  await scan()
  files[main] += lines[2]
  await scan()
  files[main] += lines[3]
  await scan()

  expect(appended.map(({ atMs, position }) => [atMs, position])).toEqual([
    [minuteMs(10), 0],
    [minuteMs(10), bytes(lines[0] + lines[1])],
    [minuteMs(11), bytes(lines[0] + lines[1] + lines[2])]
  ])
  expect(await readAll(files)).toEqual(appended)
  const oneLineAtATime = Math.max(...lines.map(bytes))
  expect(await readAll(files, { budgetBytes: oneLineAtATime })).toEqual(appended)
})

it('places the lines after one too long to read exactly, though the read resumes inside a character', async () => {
  const main = '/p/s.jsonl'
  // 2348 bytes: two reads of 1024 are skipped, and the third begins on the second byte of an é.
  const tooLong = `x${'é'.repeat(1173)}\n`
  const files = { [main]: stamped('m1', 5, 10) + tooLong + stamped('m2', 3, 11) }
  const added = await readAll(files, { chunkBytes: 1024 })
  expect(added.map(({ position }) => position)).toEqual([0, bytes(stamped('m1', 5, 10) + tooLong)])
})
