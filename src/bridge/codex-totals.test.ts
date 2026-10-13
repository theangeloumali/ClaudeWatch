import { expect, it } from 'vitest'
import type { CodexTotal } from '../shared/accounts'
import { BridgePoller } from './poller'
import { fixtureIo } from './__fixtures__/helpers'

const rollout = '/codex/sessions/rollout-a.jsonl'
const meta = `${JSON.stringify({
  type: 'session_meta',
  payload: { id: 'a', cwd: '/repo', timestamp: '2026-10-11T09:30:00.000Z' }
})}\n`
// A `token_count` event carrying the thread's running total of output tokens.
const total = (output: number): string =>
  `${JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 0, output_tokens: output } }
    }
  })}\n`

it('posts each Codex total on the tick that reads it, while the feed holds the session’s numbers for ten seconds', async () => {
  const files: Record<string, string | null> = { [rollout]: meta + total(100), '/repo/.git': null }
  const io = fixtureIo(files)
  let isRunning = true
  io.exec = async (program) => {
    if (!program.endsWith('ps')) return 'p42\nn/repo\n'
    return isRunning ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : ''
  }
  let now = Date.parse('2026-10-11T10:00:00.000Z')
  const posted: CodexTotal[][] = []
  const poller = new BridgePoller({
    io,
    claudeRoots: [],
    codexRoot: '/codex',
    // The process table and folder above are what `ps` and `lsof` print on macOS.
    platform: 'darwin',
    now: () => now,
    onCodexTotals: (totals) => posted.push(totals)
  })
  // What the feed shows after a tick two seconds on, and what was posted beside it by that tick.
  const tick = async (): Promise<[number | undefined, number[]]> => {
    posted.length = 0
    now += 2000
    const shown = (await poller.tick()).sessions[0]?.usage?.own.output
    return [shown, posted.flat().map(({ counts }) => counts.output)]
  }

  expect(await tick()).toEqual([100, [100]])
  expect(posted).toEqual([
    [
      {
        sessionKey: 'codex:a',
        projectKey: expect.stringMatching(/^p_/),
        projectLabel: 'repo',
        accountKey: null,
        threadStartedAtMs: Date.parse('2026-10-11T09:30:00.000Z'),
        counts: { input: 0, output: 100, cacheWrite: 0, cacheRead: 0 }
      }
    ]
  ])
  files[rollout] += total(150)
  expect(await tick()).toEqual([100, [150]])
  // A tick that read nothing new posts nothing.
  expect(await tick()).toEqual([100, []])

  // Its last turn, then the process gone before the next tick.
  files[rollout] += total(180)
  isRunning = false
  expect(await tick()).toEqual([undefined, [180]])
  expect(await tick()).toEqual([undefined, []])
})
