import { execFile } from 'child_process'
import { POWERSHELL, powershellArgs } from '../../shared/platform-process'

// PowerShell joins any argument after -Command into the script and runs it, so a call must be
// exactly powershellArgs(script); values go in the child env instead.
function assertSafePowerShell(bin: string, args: string[]): void {
  if (bin.toLowerCase() !== POWERSHELL.toLowerCase()) return
  const expected = args.length === 4 ? powershellArgs(args[3]) : []
  if (!expected.length || expected.some((arg, index) => arg !== args[index]))
    throw new Error('PowerShell runs only powershellArgs(script), with nothing after the script')
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

    if (options?.timeout || options?.env) {
      execFile(bin, args, options, cb)
    } else {
      execFile(bin, args, cb)
    }
  })
}
