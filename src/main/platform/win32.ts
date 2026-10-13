import { readFile } from 'fs/promises'
import { homedir, totalmem } from 'os'
import { join } from 'path'
import type { RawProcessInfo, PlatformDetector } from './darwin'
import { isJsonObject } from '../../shared/json-object'
import {
  filetimeToMs,
  isAbsoluteFolder,
  programName,
  splitCommandLine
} from '../../shared/platform-process'
import { runPowerShell } from '../../shared/powershell-host'

// .NET gives pid, exact start (the 100 ns Claude Code records), CPU and memory every poll. CIM,
// whose cost lands in WmiPrvSE, is asked only for the command line and CreationDate ticks
// (Claude Code's fallback start) of a pid:start not seen yet, at most every 10 s; the kept host
// remembers the answers, so steady state makes no CIM query. A row a line, command in base64.
export function processTableScript(imageName: string): string {
  if (!/^[\w.-]+$/.test(imageName)) throw new Error(`not an image name: ${imageName}`)
  return `$first = $null -eq $global:claudeWatchCimLines
if ($first) { $global:claudeWatchCimLines = @{}; $global:claudeWatchCimClock = [Diagnostics.Stopwatch]::StartNew(); $global:claudeWatchCimAskedAt = -10000 }
$lines = $global:claudeWatchCimLines
$live = @{}
foreach ($process in [Diagnostics.Process]::GetProcessesByName('${imageName}')) {
  try { $start = $process.StartTime.ToFileTimeUtc(); $live["$($process.Id):$start"] = "$($process.Id) $start $($process.TotalProcessorTime.Ticks) $($process.WorkingSet64)" } catch {} finally { $process.Dispose() }
}
foreach ($key in @($lines.Keys)) { if (-not $live.ContainsKey($key)) { $lines.Remove($key) } }
$unseen = @(foreach ($key in $live.Keys) { if (-not $lines.ContainsKey($key)) { $key } })
if ($unseen.Count -and $global:claudeWatchCimClock.ElapsedMilliseconds - $global:claudeWatchCimAskedAt -ge 10000) {
  $global:claudeWatchCimAskedAt = $global:claudeWatchCimClock.ElapsedMilliseconds
  $filter = ($unseen | ForEach-Object { 'ProcessId=' + $_.Split(':')[0] }) -join ' OR '
  try {
    $found = @{}
    foreach ($row in Get-CimInstance Win32_Process -Filter $filter -Property ProcessId,CreationDate,CommandLine) {
      if ($row.CreationDate -and $row.CommandLine) { $found["$($row.ProcessId):$($row.CreationDate.ToFileTimeUtc())"] = [string]$row.CreationDate.Ticks + ' ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($row.CommandLine)) }
    }
    foreach ($key in $unseen) {
      $id, $start = $key.Split(':'); $start = [long]$start
      $line = $found["\${id}:$($start - $start % 10)"]
      if ($line) { $lines[$key] = $line }
    }
  } catch {}
}
@(foreach ($key in $live.Keys) { if ($lines[$key]) { $live[$key] + ' ' + $lines[$key] } }) -join [char]10`
}
const CLAUDE_PROCESS_SCRIPT = processTableScript('claude')
// pid, exact start FILETIME, CPU ticks, working set, CreationDate ticks, command line in base64.
const TABLE_LINE = /^(\d+) (\d+) (\d+) (\d+) (\d+) ([A-Za-z0-9+/]+={0,2})$/
const TICKS_PER_MS = 10_000

interface Win32DetectorOptions {
  runScript?: (script: string) => Promise<string>
  readText?: (path: string) => Promise<string>
  home?: string
  now?: () => number
  totalMemoryBytes?: number
}

interface ProcessRow {
  pid: number
  command: string
  startedAt: string
  startedTicks: string
  cpuTicks: number
  workingSet: number
}

interface CpuSample {
  cpuTicks: number
  atMs: number
}

// `ps -o etime` layout: [[d-]hh:]mm:ss.
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const pad = (value: number): string => String(value).padStart(2, '0')
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const clock = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
  if (days > 0) return `${days}-${pad(hours)}:${clock}`
  return hours > 0 ? `${pad(hours)}:${clock}` : clock
}

// Claude Code's own binary, not the desktop app (also claude.exe) or its Electron helpers.
function isClaudeCode(command: string): boolean {
  const argv = splitCommandLine(command)
  if (!argv.length || programName(argv[0]) !== 'claude') return false
  if (/[\\/](AnthropicClaude|WindowsApps)[\\/]/i.test(argv[0])) return false
  return !argv.some((arg) => arg.startsWith('--type='))
}

function toProcessRow(line: string): ProcessRow[] {
  const match = TABLE_LINE.exec(line.trim())
  if (!match) return []
  const [, pidText, startedAt, cpuTicks, workingSet, startedTicks, encodedCommand] = match
  const pid = Number(pidText)
  const command = Buffer.from(encodedCommand, 'base64').toString('utf8')
  if (!Number.isSafeInteger(pid) || pid <= 0 || !isClaudeCode(command)) return []
  return [
    {
      pid,
      command,
      startedAt,
      startedTicks,
      cpuTicks: Number(cpuTicks),
      workingSet: Number(workingSet)
    }
  ]
}

const parseRows = (stdout: string): ProcessRow[] => stdout.split('\n').flatMap(toProcessRow)

// What Windows cannot give: a run state (always 'S', so CPU alone decides) and a tty. The
// working folder is not in CIM, so it comes from the record Claude Code keeps per session.
export class Win32Detector implements PlatformDetector {
  private readonly runScript: (script: string) => Promise<string>
  private readonly readText: (path: string) => Promise<string>
  private readonly home: string
  private readonly now: () => number
  private readonly totalMemoryBytes: number
  private cpuSamples = new Map<number, CpuSample>()
  // Each pid's start in both forms a session record may carry.
  private startsByPid = new Map<number, string[]>()

  constructor(options: Win32DetectorOptions = {}) {
    this.runScript = options.runScript ?? runPowerShell
    this.readText = options.readText ?? ((path) => readFile(path, 'utf8'))
    this.home = options.home ?? homedir()
    this.now = options.now ?? Date.now
    this.totalMemoryBytes = options.totalMemoryBytes ?? totalmem()
  }

  async getClaudeProcesses(): Promise<RawProcessInfo[]> {
    let stdout: string
    try {
      stdout = await this.runScript(CLAUDE_PROCESS_SCRIPT)
    } catch {
      return []
    }
    const nowMs = this.now()
    const rows = parseRows(stdout)
    const samples = new Map<number, CpuSample>()
    this.startsByPid = new Map(
      rows.map((row) => [row.pid, [row.startedAt, row.startedTicks].filter(Boolean)])
    )
    const processes = rows.map((row) => {
      samples.set(row.pid, { cpuTicks: row.cpuTicks, atMs: nowMs })
      return this.toRawProcess(row, nowMs)
    })
    this.cpuSamples = samples
    return processes
  }

  async getWorkingDirectory(pid: number): Promise<string> {
    if (!Number.isSafeInteger(pid) || pid <= 0) return ''
    try {
      const record: unknown = JSON.parse(
        await this.readText(join(this.home, '.claude', 'sessions', `${pid}.json`))
      )
      if (!isJsonObject(record)) return ''
      // A pid Windows has reused still finds the old session's record; its start time differs.
      const starts = this.startsByPid.get(pid) ?? []
      const isOtherProcess =
        starts.length > 0 &&
        record.procStart !== undefined &&
        !starts.some((start) => start === record.procStart)
      if (isOtherProcess) return ''
      return typeof record.cwd === 'string' && isAbsoluteFolder(record.cwd, 'win32')
        ? record.cwd
        : ''
    } catch {
      return ''
    }
  }

  private toRawProcess(row: ProcessRow, nowMs: number): RawProcessInfo {
    const startedAtMs = filetimeToMs(row.startedAt)
    const aliveMs = Number.isFinite(startedAtMs) ? Math.max(0, nowMs - startedAtMs) : 0
    return {
      pid: row.pid,
      stat: 'S',
      cpuPercent: this.cpuPercent(row, nowMs, aliveMs),
      memPercent: this.totalMemoryBytes ? (row.workingSet / this.totalMemoryBytes) * 100 : 0,
      elapsedTime: formatElapsed(aliveMs / 1000),
      tty: 'console',
      command: row.command
    }
  }

  // Per core, as ps reports it: since the last poll, or over the whole life on first sight.
  private cpuPercent(row: ProcessRow, nowMs: number, aliveMs: number): number {
    const previous = this.cpuSamples.get(row.pid)
    const spanMs = previous ? nowMs - previous.atMs : aliveMs
    const usedTicks = previous ? row.cpuTicks - previous.cpuTicks : row.cpuTicks
    if (spanMs <= 0 || usedTicks < 0) return 0
    return (usedTicks / TICKS_PER_MS / spanMs) * 100
  }
}
