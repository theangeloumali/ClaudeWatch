import { execFile } from 'child_process'
import { POWERSHELL_CWD, powershellScriptOf, programName } from '../../shared/platform-process'

// Every spelling that starts a PowerShell is held to one script and nothing after it.
const isPowerShell = (bin: string): boolean => ['powershell', 'pwsh'].includes(programName(bin))

export function execFilePromise(
  bin: string,
  args: string[],
  options?: { timeout?: number; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const runsPowerShell = isPowerShell(bin)
    // Throws unless the call is exactly powershellArgs(script).
    if (runsPowerShell) powershellScriptOf(args)
    const cb = (err: Error | null, stdout: string | Buffer, stderr: string | Buffer): void => {
      if (err) {
        reject(err)
        return
      }
      resolve({ stdout: stdout as string, stderr: stderr as string })
    }

    // No console window flashes up on Windows; ignored elsewhere. Not for wt.exe, which
    // honours SW_HIDE and would open hidden.
    // PowerShell resolves part of its module path against its working folder: never the launch one.
    const cwd = runsPowerShell ? { cwd: POWERSHELL_CWD } : {}
    execFile(bin, args, { ...options, ...cwd, windowsHide: true }, cb)
  })
}
