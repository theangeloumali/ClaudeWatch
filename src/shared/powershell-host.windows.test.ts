import { execFile, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { childEnv, POWERSHELL, POWERSHELL_SPAWN, powershellArgs } from './platform-process'
import {
  closePowerShellHost,
  POWERSHELL_HOST_SCRIPT,
  runInteractivePowerShell,
  runPowerShell
} from './powershell-host'

// These drive the real powershell.exe, which exists only on Windows.
const onWindows = process.platform === 'win32'
const FREE_CONSOLE = `Add-Type -Namespace ClaudeWatchTest -Name Kernel -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool FreeConsole();'
[void][ClaudeWatchTest.Kernel]::FreeConsole()
'freed'`

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

afterAll(() => closePowerShellHost())

describe.runIf(onWindows)('the kept PowerShell on Windows', () => {
  it('answers from one shell, a reply past ASCII included', async () => {
    const pid = await runPowerShell('$PID')
    expect(await runPowerShell('$PID')).toBe(pid)
    expect(await runPowerShell("'C:\\Users\\José'")).toBe('C:\\Users\\José')
  }, 20_000)
  it('runs a click script in the same kept shell as the polls', async () => {
    expect(await runInteractivePowerShell('$PID')).toBe(await runPowerShell('$PID'))
  }, 20_000)
  it('answers a script that prints nothing at once, from the same shell', async () => {
    const pid = await runPowerShell('$PID')
    expect(await runPowerShell('$null', 4000)).toBe('')
    expect(await runPowerShell('$PID')).toBe(pid)
  }, 20_000)
  it('answers a script unchanged since its own last run as same, whatever ran between', async () => {
    const shell = spawn(POWERSHELL, powershellArgs(POWERSHELL_HOST_SCRIPT), {
      env: childEnv('win32'),
      ...POWERSHELL_SPAWN
    })
    const lines: string[] = []
    shell.stdout.on('data', (chunk: Buffer) => lines.push(...chunk.toString().split(/\r?\n/)))
    const request = (id: number, script: string) =>
      shell.stdin.write(`${id} ${Buffer.from(script).toString('base64')}\n`)
    try {
      request(1, "'table'")
      request(2, "'TABLE'")
      request(3, "'table'")
      request(4, "'TABLE'")
      const deadline = Date.now() + 15_000
      while (lines.filter(Boolean).length < 4 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50))
      expect(lines.filter(Boolean)).toEqual([
        `1 ok ${Buffer.from('table').toString('base64')}`,
        `2 ok ${Buffer.from('TABLE').toString('base64')}`,
        '3 same',
        '4 same'
      ])
    } finally {
      shell.kill()
    }
  }, 30_000)
  it('passes over what a script writes to the host itself', async () => {
    expect(await runPowerShell("Write-Host 'noise'; 'kept'")).toBe('kept')
  }, 20_000)
  it('serves the next script normally after one frees its console', async () => {
    expect(await runPowerShell(FREE_CONSOLE, 20_000)).toBe('freed')
    expect(Number(await runPowerShell('$PID'))).toBeGreaterThan(0)
  }, 30_000)
  it('loads no module planted under a relative module path in the folder ClaudeWatch started in', async () => {
    const launch = mkdtempSync(join(tmpdir(), 'claudewatch-launch-'))
    const probe = join(launch, '%ProgramFiles%', 'WindowsPowerShell', 'Modules', 'ClaudeWatchProbe')
    mkdirSync(probe, { recursive: true })
    writeFileSync(join(probe, 'ClaudeWatchProbe.psm1'), 'function Get-Probe { 1 }')
    try {
      const child = fileURLToPath(
        new URL('./__fixtures__/powershell-module-probe-child.mts', import.meta.url)
      )
      const output = await new Promise<string>((resolve, reject) =>
        execFile(process.execPath, [child], { cwd: launch, timeout: 60_000 }, (error, stdout) =>
          error ? reject(error) : resolve(stdout)
        )
      )
      const { kept, cold } = JSON.parse(output.trim().split('\n').at(-1) ?? '{}')
      for (const shell of [kept, cold]) {
        expect(shell.found).toBe(0)
        for (const path of shell.paths) expect(path).toMatch(/^[A-Za-z]:\\/)
      }
    } finally {
      rmSync(launch, { recursive: true, force: true })
    }
  }, 70_000)
  it('leaves no shell running once the process it served has exited', async () => {
    const child = fileURLToPath(
      new URL('./__fixtures__/powershell-host-child.mts', import.meta.url)
    )
    const output = await new Promise<string>((resolve, reject) =>
      execFile(process.execPath, [child], { timeout: 30_000 }, (error, stdout) =>
        error ? reject(error) : resolve(stdout)
      )
    )
    const pid = Number(output.trim().split(/\s+/).at(-1))
    expect(pid).toBeGreaterThan(0)
    const deadline = Date.now() + 5000
    while (isRunning(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
    expect(isRunning(pid)).toBe(false)
  }, 40_000)
})
