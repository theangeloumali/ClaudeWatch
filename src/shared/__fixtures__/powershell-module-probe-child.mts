// Runs from whatever folder it is started in, as ClaudeWatch runs from its launch folder, and
// prints what the kept shell and a cold one see of a module planted there.
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROBE = `@{
  found = @(Get-Module -ListAvailable ClaudeWatchProbe).Count
  paths = @($env:PSModulePath -split ';' | Where-Object { $_ })
} | ConvertTo-Json -Compress`

const root = fileURLToPath(new URL('../../..', import.meta.url))
const vite = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'silent' })
const { runPowerShell, closePowerShellHost, PowerShellHost } = await vite.ssrLoadModule(
  '/src/shared/powershell-host.ts'
)
// A shell that cannot start, so the script takes the cold route.
const unstartable = () => {
  const shell = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => true
  })
  setImmediate(() => shell.emit('error', new Error('spawn EACCES')))
  return shell
}
const cold = new PowerShellHost({ start: unstartable, onParentExit: () => {} })
const kept = await runPowerShell(PROBE, 20_000)
const coldly = await cold.run(PROBE, 20_000)
process.stdout.write(`${JSON.stringify({ kept: JSON.parse(kept), cold: JSON.parse(coldly) })}\n`)
closePowerShellHost()
await vite.close()
