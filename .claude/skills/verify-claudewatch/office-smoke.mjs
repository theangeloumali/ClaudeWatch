// Opens the built app's Office window on this machine's real sessions and captures evidence.
// Run from the tooling dir so `playwright` resolves: node --input-type=module < this file
import { _electron as electron } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const repo = process.env.CW_REPO
const shot = process.env.CW_SHOT
const settleMs = Number(process.env.CW_SETTLE_MS ?? 15000)
const executable =
  process.platform === 'win32'
    ? `${repo}/node_modules/electron/dist/electron.exe`
    : `${repo}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`
const app = await electron.launch({
  executablePath: executable,
  args: [`${repo}/out/main/index.js`, '--open-office'],
  env: { ...process.env, NODE_ENV: 'production' }
})
// app.close() hangs on the tray app, so the script always exits the app itself.
const quit = (code) =>
  app
    .evaluate(({ app }) => app.exit(0))
    .catch(() => {})
    .then(() => process.exit(code))

let office
for (let i = 0; i < 40 && !office; i++) {
  office = app.windows().find((w) => w.url().includes('office.html'))
  if (!office) await new Promise((r) => setTimeout(r, 500))
}
if (!office) {
  console.log(
    'NO OFFICE WINDOW',
    app.windows().map((w) => w.url())
  )
  await quit(1)
}
const errors = []
office.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
office.on('pageerror', (e) => errors.push(String(e)))
await office.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await office.getByRole('navigation', { name: 'Offices' }).waitFor({ timeout: 30000 })
await new Promise((r) => setTimeout(r, settleMs))
mkdirSync(dirname(shot), { recursive: true })
await office.screenshot({ path: shot })
console.log(
  'OFFICES PANEL:\n' + (await office.getByRole('navigation', { name: 'Offices' }).innerText())
)
console.log('CONSOLE ERRORS:', errors.length, errors.slice(0, 5))
await quit(errors.length ? 1 : 0)
