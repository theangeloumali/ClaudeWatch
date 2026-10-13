import type { ClaudeInstance, SessionType } from '../renderer/lib/types'
import { parseElapsedTime, getProjectName } from '../renderer/lib/utils'
import type { PlatformDetector, RawProcessInfo } from './platform/darwin'
import { DarwinDetector } from './platform/darwin'
import { Win32Detector } from './platform/win32'
import { runPowerShell } from '../shared/powershell-host'
import type { TerminalResolver } from './terminal-resolver'

const KNOWN_FLAGS = [
  '--resume',
  '--continue',
  '--dangerously-skip-permissions',
  '--allowedTools',
  '--model',
  '--permission-prompt-tool',
  '--verbose',
  '--max-turns',
  '--system-prompt',
  '--append-system-prompt',
  '--mcp-config',
  '--prefill',
  '--output-format',
  '--input-format',
  '--print',
  '--add-dir'
]

function parseFlags(command: string): string[] {
  const flags: string[] = []
  for (const flag of KNOWN_FLAGS) {
    if (command.includes(flag)) {
      flags.push(flag)
    }
  }
  return flags
}

function parseSessionId(command: string): string | undefined {
  const match = command.match(/--resume\s+(\S+)/)
  return match ? match[1] : undefined
}

function determineStatus(
  stat: string,
  cpuPercent: number,
  cpuIdleThreshold: number
): 'active' | 'idle' {
  // R stat (running) with CPU above threshold = active
  if (stat.includes('R') && cpuPercent > cpuIdleThreshold) {
    return 'active'
  }
  // S stat (sleeping) with low CPU = idle
  if (cpuPercent <= cpuIdleThreshold) {
    return 'idle'
  }
  // High CPU even in S state = active (happens during brief state transitions)
  return 'active'
}

function getPlatformDetector(platform: NodeJS.Platform): PlatformDetector {
  if (platform === 'win32') {
    // The kept PowerShell: a cold one per poll costs about a fifth of a core.
    return new Win32Detector({ runScript: runPowerShell })
  }
  return new DarwinDetector()
}

export function detectSessionType(command: string, flags: string[]): SessionType {
  const hasOutputFormat = flags.includes('--output-format')
  const hasPermPrompt = flags.includes('--permission-prompt-tool')
  const hasStreamJson = command.includes('stream-json')

  // VS Code extension: --output-format stream-json --permission-prompt-tool stdio
  if (hasOutputFormat && hasPermPrompt && hasStreamJson) return 'vscode'

  // Subagent: --output-format stream-json but no --permission-prompt-tool
  if (hasOutputFormat && hasStreamJson && !hasPermPrompt) return 'subagent'

  return 'cli'
}

export class ProcessMonitor {
  private detector: PlatformDetector
  private cpuIdleThreshold: number
  private terminalResolver?: Pick<TerminalResolver, 'resolve'>

  constructor(options?: {
    cpuIdleThreshold?: number
    detector?: PlatformDetector
    terminalResolver?: Pick<TerminalResolver, 'resolve'>
    platform?: NodeJS.Platform
  }) {
    this.cpuIdleThreshold = options?.cpuIdleThreshold ?? 3.0
    this.detector = options?.detector ?? getPlatformDetector(options?.platform ?? process.platform)
    this.terminalResolver = options?.terminalResolver
  }

  setCpuIdleThreshold(percent: number): void {
    this.cpuIdleThreshold = percent
  }

  async poll(): Promise<ClaudeInstance[]> {
    let rawProcesses: RawProcessInfo[]
    try {
      rawProcesses = await this.detector.getClaudeProcesses()
    } catch {
      return []
    }

    if (rawProcesses.length === 0) {
      return []
    }

    const instances: ClaudeInstance[] = []
    const projectPaths = await Promise.all(
      rawProcesses.map((proc) => this.detector.getWorkingDirectory(proc.pid))
    )

    for (const [index, proc] of rawProcesses.entries()) {
      const projectPath = projectPaths[index]
      const projectName = projectPath ? getProjectName(projectPath) : ''
      const flags = parseFlags(proc.command)
      const sessionId = parseSessionId(proc.command)
      const status = determineStatus(proc.stat, proc.cpuPercent, this.cpuIdleThreshold)
      const elapsedSeconds = parseElapsedTime(proc.elapsedTime)

      instances.push({
        pid: proc.pid,
        tty: proc.tty,
        status,
        cpuPercent: proc.cpuPercent,
        memPercent: proc.memPercent,
        elapsedTime: proc.elapsedTime,
        elapsedSeconds,
        projectPath,
        projectName,
        flags,
        sessionId,
        startedAt: new Date(Date.now() - elapsedSeconds * 1000),
        sessionType: detectSessionType(proc.command, flags)
      })
    }

    if (this.terminalResolver) {
      await Promise.all(
        instances.map(async (instance) => {
          const info = await this.terminalResolver!.resolve(instance.pid)
          instance.terminalApp = info.terminalApp
          instance.terminalType = info.terminalType
        })
      )
    }

    return instances
  }
}
