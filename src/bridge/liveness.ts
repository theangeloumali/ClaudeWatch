import { powershellArgs, startTimeQuery } from '../shared/platform-process'
import type { BridgeIo } from './io'
import type { ProcessRow } from './process-table'
import type { RegistryEntry } from './registry'

// An agent whose record has been quiet this long is taken to have finished.
export const SUBAGENT_FRESH_MS = 60_000
// A long build or test writes nothing until it returns: an agent with a tool open stays this long.
export const OPEN_TOOL_HOLD_MS = 15 * 60_000
// `now` is read before the files are, so one written during the tick may look a little ahead.
const CLOCK_SKEW_MS = 5_000

// How long a record has been quiet, or null when it is dated further ahead than skew explains.
export function quietFor(now: number, atMs: number): number | null {
  const quietMs = now - atMs
  return quietMs < -CLOCK_SKEW_MS ? null : Math.max(0, quietMs)
}

export const isStillWorking = (quietMs: number, freshMs: number, hasOpenTool: boolean): boolean =>
  quietMs < freshMs || (hasOpenTool && quietMs < OPEN_TOOL_HOLD_MS)

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

// PowerShell that ran exits 1 for a pid with no process; one timed out or never started
// answered nothing, and a session it cannot vouch for is not taken to have ended.
const hasExitStatus = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && typeof error.code === 'number'

// Claude Code without its native call records CIM's CreationDate.Ticks, which Claude itself
// tells from a FILETIME by size: ticks since year 1 pass 3e17, a FILETIME of this century not.
const isCreationTicks = (procStart: string, platform: NodeJS.Platform): boolean =>
  platform === 'win32' && Number(procStart) > 3e17

// Asked of a pid as Claude Code asked when it wrote the record; the pid is a checked integer.
function ownStartQuery(entry: RegistryEntry, platform: NodeJS.Platform) {
  const query = startTimeQuery(entry.pid, platform)
  if (!isCreationTicks(entry.procStart, platform)) return query
  const script = `(Get-CimInstance Win32_Process -Filter "ProcessId=${entry.pid}").CreationDate.Ticks`
  return { file: query.file, args: powershellArgs(script) }
}

// The owner's process table answers for a pid it lists. Only one it lacks is asked about,
// which may still run under another account.
export async function isLive(
  entry: RegistryEntry,
  io: BridgeIo,
  table: ProcessRow[],
  platform: NodeJS.Platform = process.platform
): Promise<boolean> {
  try {
    const row = table.find(({ pid }) => pid === entry.pid)
    const listed = isCreationTicks(entry.procStart, platform) ? row?.creationTicks : row?.lstart
    const { file, args } = ownStartQuery(entry, platform)
    const start = listed ?? (await io.exec(file, args))
    return collapseWhitespace(start) === collapseWhitespace(entry.procStart)
  } catch (error) {
    if (platform === 'win32' && !hasExitStatus(error)) throw error
    return false
  }
}
