import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BridgePoller } from '../bridge/poller'
import { withoutAccounts } from '../main/accounts'
import { BridgeHost } from '../main/bridge-host'
import { execFilePromise } from '../main/platform/exec'
import { TerminalResolver } from '../main/terminal-resolver'
import { createOfficeService } from '../office-host/office-service'
import { runInteractivePowerShell } from '../shared/powershell-host'
import { PollerProcess } from '../office-host/poller-process'
import { parseArgs } from './args'
import { createLaunchToken, writeLaunchFile } from './launch-token'
import { createOfficeServer } from './server'
import { loadStaticFiles } from './static-files'

const USAGE = 'Usage: node server.mjs [--port <0-65535>] [--interactive]\n'
const IDLE_MS = 10 * 60_000
const LAUNCH_FOLDER = join(homedir(), '.claude', 'state', 'office')

// The standalone Office: the bridge poller, the office service and the page, in one process.
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    process.stderr.write(USAGE)
    process.exitCode = 2
    return
  }
  // The page files sit beside this file, listed in MANIFEST.json.
  const files = await loadStaticFiles(dirname(fileURLToPath(import.meta.url)))
  const host = new BridgeHost({ spawn: () => new PollerProcess(new BridgePoller()) })
  const service = createOfficeService({
    // This page has no ledger: no session carries an account, whatever the bridge reports.
    host: withoutAccounts(host),
    run: execFilePromise,
    // A fresh resolver each time: its cache is keyed by pid, and nothing here evicts a dead one.
    terminalOf: async (pid) =>
      (await new TerminalResolver(process.platform, runInteractivePowerShell).resolve(pid))
        .terminalType,
    isInteractive: args.interactive,
    runScript: runInteractivePowerShell
  })

  const launchCode = createLaunchToken()
  let launchFile: string | null = null
  const removeLaunchFile = async (): Promise<void> => {
    if (launchFile) await rm(launchFile, { force: true })
    launchFile = null
  }
  const shutdown = async (): Promise<void> => {
    await removeLaunchFile()
    host.stop()
    await server.close()
  }
  const server = createOfficeServer({
    files,
    launchCode,
    service,
    bridge: host,
    interactive: args.interactive,
    idleMs: IDLE_MS,
    onIdle: () => void shutdown(),
    onFirstUse: () => void removeLaunchFile()
  })
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())

  const { port } = await server.listen(args.port)
  launchFile = await writeLaunchFile(LAUNCH_FOLDER, port, launchCode, args.interactive)
  // The launch code is in the launch file only: it is never printed and never an argument.
  process.stdout.write(
    `ClaudeWatch Office (${args.interactive ? 'interactive' : 'view-only'}) on http://127.0.0.1:${port}\n` +
      `Open ${pathToFileURL(launchFile).href}\n`
  )
}

main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : 'unknown error'
  process.stderr.write(`ClaudeWatch Office could not start: ${reason}\n`)
  process.exit(1)
})
