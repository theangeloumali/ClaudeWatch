import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { CodexUsageMessage, UsageMessage } from '../shared/accounts'
import { paceOf } from '../shared/office/pace'
import type { FeedMessage } from '../shared/office/types'
import { BridgePoller } from './poller'

interface BridgePort {
  postMessage(message: FeedMessage | UsageMessage | CodexUsageMessage): void
  on(event: 'message', listener: (event: { data: unknown }) => void): unknown
}

const ONCE_MAX_TICKS = 30

export async function main(args = process.argv.slice(2), port?: BridgePort): Promise<void> {
  const roots = [join(homedir(), '.claude')]
  let usageOffsetsPath: string | undefined
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--root' && args[index + 1]) roots.push(resolve(args[++index]))
    else if (args[index] === '--usage-offsets' && args[index + 1])
      usageOffsetsPath = resolve(args[++index])
  }
  const poller = new BridgePoller({
    claudeRoots: roots,
    ...(usageOffsetsPath && { usageOffsetsPath }),
    ...(args.includes('--accounts') && { derivesAccounts: true }),
    // Only a parent listens for added tokens; a one-shot run prints the snapshot alone.
    ...(port && {
      onUsage: (deltas) => port.postMessage({ type: 'usage', v: 1, deltas }),
      onCodexTotals: (totals) => port.postMessage({ type: 'codex-usage', v: 1, totals })
    })
  })
  if (args.includes('--once')) {
    // The first tick publishes before any transcript is counted; a one-shot run wants the numbers.
    let snapshot = await poller.tick()
    for (let ticks = 1; poller.isCountingUsage && ticks < ONCE_MAX_TICKS; ticks++)
      snapshot = await poller.tick()
    process.stdout.write(`${JSON.stringify(snapshot)}\n`)
    return
  }
  if (!port) return
  port.on('message', ({ data }) => {
    const intervalMs = paceOf(data)
    if (intervalMs !== null) poller.setIntervalMs(intervalMs)
  })
  await poller.start((message) => port.postMessage(message))
}

// Electron gives a utility process its parent's port; under plain node there is none.
const port: BridgePort | undefined = process.parentPort
if (port || process.argv.includes('--once')) {
  void main(process.argv.slice(2), port).catch(() => {
    process.stderr.write('Office bridge failed\n')
    process.exitCode = 1
  })
}
