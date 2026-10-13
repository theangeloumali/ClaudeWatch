import {
  checkedPid,
  filetimeToMs,
  POWERSHELL,
  powershellArgs,
  type PowerShellScript,
  powerShellScript,
  startTimeQuery
} from '../shared/platform-process'
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

// The ticks of a process as Claude Code asked for them when it wrote the record, then its
// FILETIME: a ticks record holds no date of its own.
export const creationTicksScript = (pid: number): PowerShellScript =>
  powerShellScript(
    `$process = Get-CimInstance Win32_Process -Filter "ProcessId=${checkedPid(pid)}"
if ($process) { "$($process.CreationDate.Ticks) $($process.CreationDate.ToFileTimeUtc())" }`
  )

// The record's start as a process would print it, and when that process started; asked of a
// pid the table lacks as Claude Code asked when it wrote the record.
async function askStart(
  entry: RegistryEntry,
  io: BridgeIo,
  platform: NodeJS.Platform
): Promise<{ start: string; startedAtMs: number }> {
  if (!isCreationTicks(entry.procStart, platform)) {
    const { file, args } = startTimeQuery(entry.pid, platform)
    const start = await io.exec(file, args)
    const startedAtMs =
      platform === 'win32' ? filetimeToMs(entry.procStart) : Date.parse(`${entry.procStart} UTC`)
    return { start, startedAtMs }
  }
  const [ticks = '', filetime = ''] = (
    await io.exec(POWERSHELL, powershellArgs(creationTicksScript(entry.pid)))
  )
    .trim()
    .split(/\s+/)
  return { start: ticks, startedAtMs: filetimeToMs(filetime) }
}

// When a live record's process started, or null when the record's process has gone. The owner's
// table answers for a pid it lists; only one it lacks is asked about, as it may run under
// another account. A Windows record holds a FILETIME or ticks, not a date.
export async function liveStartedAt(
  entry: RegistryEntry,
  io: BridgeIo,
  table: ProcessRow[],
  platform: NodeJS.Platform = process.platform
): Promise<number | null> {
  try {
    const row = table.find(({ pid }) => pid === entry.pid)
    const listed = isCreationTicks(entry.procStart, platform) ? row?.creationTicks : row?.lstart
    const { start, startedAtMs } =
      row && listed !== undefined
        ? { start: listed, startedAtMs: row.startedAtMs }
        : await askStart(entry, io, platform)
    if (collapseWhitespace(start) !== collapseWhitespace(entry.procStart)) return null
    return Number.isFinite(startedAtMs) ? startedAtMs : 0
  } catch (error) {
    if (platform === 'win32' && !hasExitStatus(error)) throw error
    return null
  }
}

export const isLive = async (
  entry: RegistryEntry,
  io: BridgeIo,
  table: ProcessRow[],
  platform: NodeJS.Platform = process.platform
): Promise<boolean> => (await liveStartedAt(entry, io, table, platform)) !== null
