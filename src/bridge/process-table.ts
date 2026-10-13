import {
  filetimeToMs,
  POWERSHELL,
  powershellArgs,
  splitCommandLine
} from '../shared/platform-process'
import type { BridgeIo } from './io'

// `ps` with these columns, read with TZ=UTC: one row per process, its start time and argv.
// -x without -A: the owner's own processes, so no other account can pose as one of their agents.
export const PROCESS_TABLE_ARGS = ['-xo', 'pid=,lstart=,command=']

export interface ProcessRow {
  pid: number
  // The start as the registry records it: `ps` lstart on macOS, the FILETIME on Windows.
  lstart: string
  startedAtMs: number
  argv: string[]
  // Windows only: CIM's CreationDate.Ticks, the start Claude Code records without its native call.
  creationTicks?: string
}

export function parseProcessTable(output: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+)$/.exec(line)
    if (!match) continue
    rows.push({
      pid: Number(match[1]),
      lstart: match[2],
      startedAtMs: Date.parse(`${match[2]} UTC`),
      argv: match[3].trim().split(/\s+/)
    })
  }
  return rows
}

// This logon session's processes, the Windows analogue of `ps -x`. Starts come from .NET, exact
// to the 100 ns Claude Code records (CIM cuts them to the microsecond). CIM is costly, so it is
// asked only for command lines and CreationDate ticks, at most every 10 s, about processes that
// outlived a run. One CIM has not described yet is asked again, three times at most, as a
// protected process never is. The kept host carries all this between runs; a fresh shell asks
// for every process at once.
export const WINDOWS_PROCESS_TABLE_SCRIPT = `$session = [Diagnostics.Process]::GetCurrentProcess().SessionId
$first = $null -eq $global:tails
if ($first) { $global:tails = @{}; $global:waiting = @{}; $global:misses = @{}; $global:clock = [Diagnostics.Stopwatch]::StartNew(); $global:askedAt = -10000 }
$lines = $global:tails
$live = @{}
foreach ($process in [Diagnostics.Process]::GetProcesses()) {
  try { if ($process.SessionId -eq $session) { $live["$($process.Id):$($process.StartTime.ToFileTimeUtc())"] = $process.Id } } catch {} finally { $process.Dispose() }
}
$changed = $first
foreach ($key in @($lines.Keys)) {
  if (-not $live.ContainsKey($key)) { if ($lines[$key]) { $changed = $true }; $lines.Remove($key) }
}
$unseen = @(foreach ($key in $live.Keys) { if (-not $lines.ContainsKey($key)) { $key } })
$ask = @(foreach ($key in $unseen) { if ($first -or $global:waiting.ContainsKey($key)) { $key } })
if ($global:clock.ElapsedMilliseconds - $global:askedAt -lt 10000) { $ask = @() }
foreach ($key in $unseen) { if (-not $global:waiting.ContainsKey($key)) { $global:waiting[$key] = $true } }
foreach ($key in @($global:waiting.Keys)) { if (-not $live.ContainsKey($key) -or $lines.ContainsKey($key)) { $global:waiting.Remove($key) } }
foreach ($key in @($global:misses.Keys)) { if (-not $live.ContainsKey($key)) { $global:misses.Remove($key) } }
if ($ask.Count) {
  $global:askedAt = $global:clock.ElapsedMilliseconds
  $filter = if ($ask.Count -gt 64) { "SessionId=$session" } else { ($ask | ForEach-Object { 'ProcessId=' + $live[$_] }) -join ' OR ' }
  try {
    $found = @{}
    foreach ($row in Get-CimInstance Win32_Process -Filter $filter -Property ProcessId,CreationDate,CommandLine) {
      if ($row.CreationDate -and $row.CommandLine) {
        $found["$($row.ProcessId):$($row.CreationDate.ToFileTimeUtc())"] = [string]$row.CreationDate.Ticks + ' ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($row.CommandLine))
      }
    }
    foreach ($key in $ask) {
      $start = [long]($key.Split(':')[1])
      $line = [string]$found["$($live[$key]):$($start - $start % 10)"]
      if ($line) { $lines[$key] = $line; $changed = $true; $global:misses.Remove($key) }
      else {
        $global:misses[$key] = 1 + [int]$global:misses[$key]
        if ($global:misses[$key] -ge 3) { $lines[$key] = '' }
      }
    }
  } catch {}
}
if ($changed -or $null -eq $global:table) {
  $global:table = @(foreach ($key in $lines.Keys) {
    if ($lines[$key]) { $key.Replace(':', ' ') + ' ' + $lines[$key] }
  }) -join [char]10
}
$global:table`

// A row a line: pid, FILETIME, CreationDate ticks and the command line in base64, which costs
// PowerShell a third of what JSON does.
const WINDOWS_ROW = /^(\d+) (\d+) (\d+) ([A-Za-z0-9+/]+={0,2})$/

function windowsRow(line: string): ProcessRow[] {
  const match = WINDOWS_ROW.exec(line.trim())
  if (!match) return []
  const pid = Number(match[1])
  const startedAtMs = filetimeToMs(match[2])
  const argv = splitCommandLine(Buffer.from(match[4], 'base64').toString('utf8'))
  if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isFinite(startedAtMs) || !argv.length)
    return []
  return [{ pid, lstart: match[2], startedAtMs, argv, creationTicks: match[3] }]
}

// The kept shell answers an unchanged table with the same text, every poll; it is parsed once.
let lastTable: { output: string; rows: ProcessRow[] } | null = null

export function parseWindowsProcessTable(output: string): ProcessRow[] {
  if (lastTable?.output !== output)
    lastTable = { output, rows: output.split('\n').flatMap(windowsRow) }
  return [...lastTable.rows]
}

export function readProcessTable(
  io: BridgeIo,
  platform: NodeJS.Platform = process.platform
): Promise<ProcessRow[]> {
  if (platform !== 'win32') return io.exec('/bin/ps', PROCESS_TABLE_ARGS).then(parseProcessTable)
  return io
    .exec(POWERSHELL, powershellArgs(WINDOWS_PROCESS_TABLE_SCRIPT))
    .then(parseWindowsProcessTable)
}

// The folder a process runs in; undefined when `lsof` names none. Windows has no way to ask
// short of reading the process's memory, so there it is never asked.
export async function readWorkingFolder(
  io: BridgeIo,
  pid: number,
  platform: NodeJS.Platform = process.platform
): Promise<string | undefined> {
  if (platform === 'win32') return undefined
  const output = await io.exec('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
  return output
    .split('\n')
    .find((line) => line.startsWith('n/'))
    ?.slice(1)
}

interface RunningProcess {
  pid: number
  startedAtMs: number
}
// A thread hosted inside an app-server has no process of its own: its pid is null.
export interface SessionOwner {
  pid: number | null
  startedAtMs: number
}
export const identityOf = ({ pid, startedAtMs }: SessionOwner): string => `${pid}:${startedAtMs}`

// The id a process is shown under until its first conversation lands.
export const placeholderId = ({ pid, startedAtMs }: SessionOwner): string =>
  `pid-${pid}-${startedAtMs}`

// Remembered by pid and start time, since asking costs an `lsof` run.
export async function rememberedFolder(
  io: BridgeIo,
  folders: Map<string, string>,
  running: RunningProcess,
  platform: NodeJS.Platform = process.platform
): Promise<string | undefined> {
  const identity = identityOf(running)
  const known = folders.get(identity)
  if (known) return known
  const cwd = await readWorkingFolder(io, running.pid, platform)
  if (cwd) folders.set(identity, cwd)
  return cwd
}

// Processes sharing a folder claim conversations newest first: an older one would otherwise
// take the newest conversation, written by the one that started after it.
export const newestFirst = <Process extends RunningProcess>(processes: Process[]): Process[] =>
  [...processes].sort((a, b) => b.startedAtMs - a.startedAtMs)

// A process shown before its first conversation keeps that placeholder key once the conversation
// lands, so its robot stays at its desk; `placeholders` is pruned with `forgetExited`.
export function keyOf(
  placeholders: Map<string, string>,
  owner: SessionOwner,
  provider: string,
  sessionId: string | undefined
): string {
  if (owner.pid === null) return `${provider}:${sessionId}`
  const identity = identityOf(owner)
  const kept = placeholders.get(identity)
  if (kept) return kept
  if (sessionId) return `${provider}:${sessionId}`
  const placeholder = `${provider}:${placeholderId(owner)}`
  placeholders.set(identity, placeholder)
  return placeholder
}

export function forgetExited(running: RunningProcess[], ...memories: Map<string, unknown>[]): void {
  const live = new Set(running.map(identityOf))
  for (const memory of memories) {
    for (const identity of memory.keys()) if (!live.has(identity)) memory.delete(identity)
  }
}

// An agent bundled in an app (ChatGPT, Orca helpers) runs from inside the bundle; not a session.
export const isInsideAppBundle = (folder: string): boolean => /\.app\/Contents(\/|$)/.test(folder)
