import { afterAll, describe, expect, it } from 'vitest'
import { PowerShellHost } from '../shared/powershell-host'
import { WINDOWS_PROCESS_TABLE_SCRIPT } from './process-table'

// The table script runs in a real kept shell, which exists only on Windows. A function named
// Get-CimInstance shadows the cmdlet there, so a test decides what CIM answers.
const onWindows = process.platform === 'win32'
// It counts the queries that ask about this test's own process, whatever else they ask.
const STAND_IN = `$global:cimCalls = 0
$global:cimAnswers = 'none'
function global:Get-CimInstance {
  $filter = [string]($args | Where-Object { $_ -match 'Id=' })
  if ($filter -match 'SessionId=' -or $filter -match 'ProcessId=${process.pid}( |$)') { $global:cimCalls++ }
  if ($global:cimAnswers -eq 'none') { return @() }
  CimCmdlets\\Get-CimInstance @args
}`
// Each run as if 10 s had passed since the last CIM query.
const RUN = `$global:askedAt = -100000\n${WINDOWS_PROCESS_TABLE_SCRIPT}`

const host = new PowerShellHost({ onParentExit: () => {} })
afterAll(() => host.close())
const listsSelf = (table: string): boolean =>
  table.split('\n').some((line) => line.startsWith(`${process.pid} `))

describe.runIf(onWindows)('the Windows process table in a kept shell', () => {
  it('asks CIM again for a process it answered nothing for, and lists it once it answers', async () => {
    await host.run(STAND_IN, 20_000)
    expect(listsSelf(await host.run(RUN, 20_000))).toBe(false)
    await host.run("$global:cimAnswers = 'real'")
    expect(listsSelf(await host.run(RUN, 20_000))).toBe(true)
  }, 60_000)
  it('stops asking about a process CIM never describes, after a few tries', async () => {
    await host.run('Remove-Variable -Scope Global tails -ErrorAction SilentlyContinue')
    await host.run(STAND_IN, 20_000)
    for (let run = 0; run < 6; run++) await host.run(RUN, 20_000)
    expect(Number(await host.run('$global:cimCalls'))).toBe(3)
  }, 60_000)
})
