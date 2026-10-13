import { execFile } from 'child_process'
import { POWERSHELL, powershellScriptOf } from '../../shared/platform-process'

function assertSafePowerShell(bin: string, args: string[]): void {
  // Throws unless the call is exactly powershellArgs(script).
  if (bin.toLowerCase() === POWERSHELL.toLowerCase()) powershellScriptOf(args)
}

export function execFilePromise(
  bin: string,
  args: string[],
  options?: { timeout?: number; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    assertSafePowerShell(bin, args)
    const cb = (err: Error | null, stdout: string | Buffer, stderr: string | Buffer): void => {
      if (err) {
        reject(err)
        return
      }
      resolve({ stdout: stdout as string, stderr: stderr as string })
    }

    // No console window flashes up on Windows; ignored elsewhere. Not for wt.exe, which
    // honours SW_HIDE and would open hidden.
    execFile(bin, args, { ...options, windowsHide: true }, cb)
  })
}
