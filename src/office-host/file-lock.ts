import { closeSync, openSync, rmSync, statSync } from 'node:fs'

const RETRY_MS = 5
const WAIT_MS = 250
// A holder keeps the lock for milliseconds; one this old was left by a process that died.
const STALE_MS = 10_000

const isCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code

function isStale(path: string): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs > STALE_MS
  } catch {
    // Released between the two calls: free to take now.
    return true
  }
}

// dry-new: an exclusive lock every process honours, created with O_EXCL beside the file it
// guards. Returns its release, or null when another holder keeps it past `WAIT_MS`.
export function lockFile(path: string): (() => void) | null {
  const sleeper = new Int32Array(new SharedArrayBuffer(4))
  for (let waitedMs = 0; waitedMs < WAIT_MS; waitedMs += RETRY_MS) {
    try {
      closeSync(openSync(path, 'wx', 0o600))
      return () => rmSync(path, { force: true })
    } catch (error) {
      if (!isCode(error, 'EEXIST')) return null
    }
    if (isStale(path)) rmSync(path, { force: true })
    else Atomics.wait(sleeper, 0, 0, RETRY_MS)
  }
  return null
}
