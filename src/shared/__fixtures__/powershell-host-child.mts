// A parent that asks its kept PowerShell for its pid, prints it and exits without closing it.
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const vite = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'silent' })
const { runPowerShell } = await vite.ssrLoadModule('/src/shared/powershell-host.ts')
process.stdout.write(`${await runPowerShell('$PID')}\n`)
await vite.close()
