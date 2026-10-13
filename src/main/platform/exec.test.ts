import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POWERSHELL, powershellArgs } from '../../shared/platform-process'

const mockExecFile = vi.fn()
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args)
}))

import { execFilePromise } from './exec'

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void

describe('execFilePromise', () => {
  beforeEach(() => {
    mockExecFile.mockReset()
    mockExecFile.mockImplementation((...args: unknown[]) =>
      (args.at(-1) as ExecCallback)(null, 'out', '')
    )
  })

  it('runs a program and resolves with its output', async () => {
    await expect(execFilePromise('/bin/ps', ['-o', 'pid='])).resolves.toEqual({
      stdout: 'out',
      stderr: ''
    })
  })

  it('runs PowerShell with exactly one script and the fixed flags', async () => {
    await execFilePromise(POWERSHELL, powershellArgs('Get-Date'), { env: { SystemRoot: 'C:\\W' } })
    expect(mockExecFile).toHaveBeenCalledWith(
      POWERSHELL,
      powershellArgs('Get-Date'),
      { env: { SystemRoot: 'C:\\W' } },
      expect.any(Function)
    )
  })

  // PowerShell joins anything after -Command into the script and runs it as code.
  it.each([
    ['a value after the script', [...powershellArgs('Write-Output $args[0]'), 'x; rm -r C:\\']],
    ['other flags', ['-ExecutionPolicy', 'Bypass', '-Command', 'Get-Date']],
    ['no script', ['-NoProfile', '-NonInteractive', '-Command']]
  ])('refuses PowerShell given %s', async (_case, args) => {
    await expect(execFilePromise(POWERSHELL, args)).rejects.toThrow(/PowerShell/)
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  it('knows PowerShell by its path whatever its letter case', async () => {
    await expect(
      execFilePromise(POWERSHELL.toUpperCase(), [...powershellArgs('Get-Date'), 'extra'])
    ).rejects.toThrow(/PowerShell/)
  })
})
