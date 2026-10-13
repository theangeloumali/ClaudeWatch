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

// Starts come from .NET at the 100 ns Claude Code records; CIM's CreationDate keeps only
// microseconds, but its Ticks are the form Claude Code falls back to. Times leave as strings:
// a FILETIME is past 2^53.
const PROCESS_QUERY = [
  "$starts = @{}; foreach ($p in [Diagnostics.Process]::GetProcessesByName('claude')) {",
  'try { $starts[$p.Id] = [string]$p.StartTime.ToFileTimeUtc() } catch {} };',
  '$rows = @(Get-CimInstance Win32_Process -Filter "Name=\'claude.exe\'"',
  '-Property ProcessId,CommandLine,CreationDate,KernelModeTime,UserModeTime,WorkingSetSize |',
  'ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; command = $_.CommandLine;',
  'startedAt = [string]$starts[[int]$_.ProcessId];',
  "startedTicks = if ($_.CreationDate) { [string]$_.CreationDate.Ticks } else { '' };",
  'cpuTicks = [string]($_.KernelModeTime + $_.UserModeTime);',
  'workingSet = [string]$_.WorkingSetSize } });',
  'ConvertTo-Json -InputObject $rows -Compress'
].join(' ')
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

function toProcessRow(value: unknown): ProcessRow | null {
  if (!isJsonObject(value)) return null
  const { pid, command, cpuTicks, workingSet, startedAt, startedTicks } = value
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) return null
  if (typeof command !== 'string' || !isClaudeCode(command)) return null
  const text = (field: unknown): string => (typeof field === 'string' ? field : '')
  return {
    pid,
    command,
    startedAt: text(startedAt),
    startedTicks: text(startedTicks),
    cpuTicks: Number(cpuTicks) || 0,
    workingSet: Number(workingSet) || 0
  }
}

function parseRows(stdout: string): ProcessRow[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((value) => toProcessRow(value) ?? [])
}

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
      stdout = await this.runScript(PROCESS_QUERY)
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
