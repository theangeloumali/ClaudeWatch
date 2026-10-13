import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POWERSHELL, POWERSHELL_CWD, powershellArgs } from '../../shared/platform-process'

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

  // Without it every child of the Electron main process flashes a console window on Windows.
  it.each([
    ['no options', undefined],
    ['a timeout and an env', { timeout: 5, env: { A: 'b' } }]
  ])('hides the child console window given %s', async (_case, options) => {
    await execFilePromise('/bin/ps', ['-o', 'pid='], options)
    expect(mockExecFile).toHaveBeenCalledWith(
      '/bin/ps',
      ['-o', 'pid='],
      { ...options, windowsHide: true },
      expect.any(Function)
    )
  })

  it('runs PowerShell with exactly one script and the fixed flags', async () => {
    await execFilePromise(POWERSHELL, powershellArgs('Get-Date'), { env: { SystemRoot: 'C:\\W' } })
    expect(mockExecFile).toHaveBeenCalledWith(
      POWERSHELL,
      powershellArgs('Get-Date'),
      { env: { SystemRoot: 'C:\\W' }, cwd: POWERSHELL_CWD, windowsHide: true },
      expect.any(Function)
    )
  })

  it('runs other programs from the folder it was given', async () => {
    await execFilePromise('/bin/ps', ['-o', 'pid='])
    expect(mockExecFile.mock.calls[0][2]).toEqual({ windowsHide: true })
  })

  // Any spelling that starts a PowerShell gets the same guard: a bare name, an .exe, pwsh.
  it.each(['powershell', 'powershell.exe', 'PowerShell.EXE', 'pwsh', 'C:\\pwsh\\pwsh.exe'])(
    'refuses %s an argument after its script',
    async (bin) => {
      await expect(execFilePromise(bin, ['-Command', 's', 'x'])).rejects.toThrow(/PowerShell/)
      expect(mockExecFile).not.toHaveBeenCalled()
    }
  )

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
