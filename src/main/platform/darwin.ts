import { HOST_ARGUMENT } from '../../bridge/claude-process-claims'
import { forgetExited, rememberFolder } from '../../bridge/process-table'
import { execFilePromise } from './exec'

export interface RawProcessInfo {
  pid: number
  stat: string
  cpuPercent: number
  memPercent: number
  elapsedTime: string
  tty: string
  command: string
}

export interface PlatformDetector {
  getClaudeProcesses(): Promise<RawProcessInfo[]>
  getWorkingDirectory(pid: number): Promise<string>
}

function isClaudeCLI(command: string): boolean {
  // Exclude Claude.app GUI and Electron helper processes
  if (command.includes('Claude.app')) return false
  if (command.includes('Electron.app')) return false
  if (command.includes('Electron Helper')) return false
  if (command.startsWith('grep ')) return false
  // A native-messaging host or a teammate belongs to another session (health-12).
  if (command.split(/\s+/).some((argument) => HOST_ARGUMENT.test(argument))) return false
  // Match: bare "claude" command, or full path ending in /claude
  return /(?:^|\/)claude(\s|$)/.test(command)
}

interface PsRow {
  info: RawProcessInfo
  startedAtMs: number
}

function parsePsLine(line: string): PsRow | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('PID')) return null

  // PID STAT %CPU %MEM ELAPSED TT STARTED COMMAND; STARTED is lstart, COMMAND may contain spaces.
  const match = trimmed.match(
    /^(\d+)\s+(\S+)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\S+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+)$/
  )
  if (!match) return null

  const [, pid, stat, cpu, mem, elapsed, tty, started, command] = match

  if (!isClaudeCLI(command)) return null

  return {
    info: {
      pid: parseInt(pid, 10),
      stat,
      cpuPercent: parseFloat(cpu),
      memPercent: parseFloat(mem),
      elapsedTime: elapsed,
      tty,
      command
    },
    startedAtMs: Date.parse(started)
  }
}

function parseLsofOutput(stdout: string): string {
  // lsof -Fn output: lines starting with 'n' contain the filename (cwd)
  const lines = stdout.split('\n')
  for (const line of lines) {
    if (line.startsWith('n') && !line.startsWith('n/dev')) {
      return line.slice(1)
    }
  }
  return ''
}

async function readWorkingFolder(pid: number): Promise<string> {
  try {
    const { stdout } = await execFilePromise('lsof', ['-p', String(pid), '-a', '-d', 'cwd', '-Fn'])
    return parseLsofOutput(stdout)
  } catch {
    return ''
  }
}

export class DarwinDetector implements PlatformDetector {
  // Each listed process's start, so its folder is asked once per process, not once per poll.
  private readonly starts = new Map<number, number>()
  private readonly folders = new Map<string, string>()

  async getClaudeProcesses(): Promise<RawProcessInfo[]> {
    try {
      const { stdout } = await execFilePromise('ps', [
        '-xo',
        'pid,stat,%cpu,%mem,etime,tty,lstart,command'
      ])
      const rows = stdout.split('\n').flatMap((line) => parsePsLine(line) ?? [])
      const running = rows
        .filter(({ startedAtMs }) => Number.isFinite(startedAtMs))
        .map(({ info, startedAtMs }) => ({ pid: info.pid, startedAtMs }))
      this.starts.clear()
      for (const { pid, startedAtMs } of running) this.starts.set(pid, startedAtMs)
      forgetExited(running, this.folders)
      return rows.map(({ info }) => info)
    } catch {
      return []
    }
  }

  async getWorkingDirectory(pid: number): Promise<string> {
    const startedAtMs = this.starts.get(pid)
    if (startedAtMs === undefined) return readWorkingFolder(pid)
    return (await rememberFolder(this.folders, { pid, startedAtMs }, readWorkingFolder)) ?? ''
  }
}
