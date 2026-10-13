// @vitest-environment node
import { execFile } from 'child_process'
import { describe, it, expect } from 'vitest'
import { POWERSHELL, childEnv, powershellArgs } from '../../shared/platform-process'
import { processTableScript } from './win32'

// Runs the real script in one shell, as the kept host does, over powershell.exe: the one image
// sure to be running while this test does. A shim counts the CIM queries it makes.
const PROBE = `function Get-CimInstance { $global:cimCalls++; CimCmdlets\\Get-CimInstance @args }
$run = [scriptblock]::Create($env:CLAUDEWATCH_SCRIPT)
$first = & $run; $afterFirst = [int]$global:cimCalls
$second = & $run; $afterSecond = [int]$global:cimCalls
$child = Start-Process powershell -ArgumentList '-NoProfile','-Command','Start-Sleep 30' -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 700
$global:claudeWatchCimAskedAt -= 10000
$third = & $run; $afterThird = [int]$global:cimCalls
Stop-Process -Id $child.Id -ErrorAction SilentlyContinue
"calls $afterFirst $afterSecond $afterThird"
"child $($child.Id)"
"first $(@($first -split [char]10 | Where-Object { $_ }).Count)"
$third`

function runProbe(): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(
      POWERSHELL,
      powershellArgs(PROBE),
      {
        env: { ...childEnv('win32'), CLAUDEWATCH_SCRIPT: processTableScript('powershell') },
        windowsHide: true,
        timeout: 60_000
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    )
  )
}

describe.runIf(process.platform === 'win32')('the Windows process script, run for real', () => {
  it('asks CIM once, then not again for the same processes, and once more for a new one', async () => {
    const output = (await runProbe()).split(/\r?\n/)
    const [, afterFirst, afterSecond, afterThird] = output[0].split(' ').map(Number)
    const childPid = output[1].split(' ')[1]

    expect([afterFirst, afterSecond, afterThird]).toEqual([1, 1, 2])
    expect(Number(output[2].split(' ')[1])).toBeGreaterThan(0)
    const childLine = output.slice(3).find((line) => line.startsWith(`${childPid} `))
    expect(childLine).toMatch(/^\d+ \d+ \d+ \d+ \d+ [A-Za-z0-9+/]+={0,2}$/)
    const command = Buffer.from(childLine!.split(' ')[5], 'base64').toString('utf8')
    expect(command).toContain('Start-Sleep 30')
  }, 60_000)
})

describe('processTableScript', () => {
  it('refuses an image name that would not be a plain word in the script', () => {
    expect(() => processTableScript("claude'); Remove-Item x; ('")).toThrow()
  })
})
