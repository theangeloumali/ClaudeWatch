import { readlink } from 'fs/promises'
import type { RawProcessInfo, PlatformDetector } from './darwin'
import { execFilePromise } from './exec'

function isClaudeCLI(command: string): boolean {
  // Exclude Electron helper processes (e.g. from a packaged app on Linux)
  if (command.includes('Electron')) return false
  if (command.startsWith('grep ')) return false
  // Match: bare "claude" command, or full path ending in /claude
  return /(?:^|\/)claude(\s|$)/.test(command)
}

function parsePsLine(line: string): RawProcessInfo | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('PID')) return null

  // Parse: PID STAT %CPU %MEM ELAPSED TT COMMAND...
  // Fields are whitespace-separated, but COMMAND may contain spaces
  const match = trimmed.match(/^(\d+)\s+(\S+)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\S+)\s+(\S+)\s+(.+)$/)
  if (!match) return null

  const [, pid, stat, cpu, mem, elapsed, tty, command] = match

  if (!isClaudeCLI(command)) return null

  return {
    pid: parseInt(pid, 10),
    stat,
    cpuPercent: parseFloat(cpu),
    memPercent: parseFloat(mem),
    elapsedTime: elapsed,
    tty,
    command
  }
}

export class LinuxDetector implements PlatformDetector {
  async getClaudeProcesses(): Promise<RawProcessInfo[]> {
    try {
      // Linux ps (procps-ng) supports the same POSIX -eo format as macOS
      const { stdout } = await execFilePromise('ps', [
        '-eo',
        'pid,stat,%cpu,%mem,etime,tty,command'
      ])

      const lines = stdout.split('\n')
      const processes: RawProcessInfo[] = []

      for (const line of lines) {
        const info = parsePsLine(line)
        if (info) {
          processes.push(info)
        }
      }

      return processes
    } catch {
      return []
    }
  }

  async getWorkingDirectory(pid: number): Promise<string> {
    try {
      // Linux exposes the CWD of every process via /proc/{pid}/cwd symlink
      return await readlink(`/proc/${pid}/cwd`)
    } catch {
      return ''
    }
  }
}
