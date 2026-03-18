import { execFilePromise } from './platform/exec'
import type { TerminalInfo, TerminalType } from '../renderer/lib/types'

interface TerminalSignature {
  terminalType: TerminalType
  displayName: string
}

const TERMINAL_SIGNATURES: Record<string, TerminalSignature> = {
  Terminal: { terminalType: 'terminal-app', displayName: 'Terminal.app' },
  iTerm2: { terminalType: 'iterm2', displayName: 'iTerm2' },
  Warp: { terminalType: 'warp', displayName: 'Warp' },
  Alacritty: { terminalType: 'alacritty', displayName: 'Alacritty' },
  kitty: { terminalType: 'kitty', displayName: 'Kitty' },
  'wezterm-gui': { terminalType: 'wezterm', displayName: 'WezTerm' },
  Hyper: { terminalType: 'hyper', displayName: 'Hyper' },
  ghostty: { terminalType: 'ghostty', displayName: 'Ghostty' }
}

const MULTIPLEXER_SIGNATURES: Record<string, 'tmux' | 'screen'> = {
  tmux: 'tmux',
  'tmux: server': 'tmux',
  screen: 'screen'
}

const MAX_DEPTH = 15
const PS_TIMEOUT = 3_000

const UNKNOWN_TERMINAL: TerminalInfo = {
  terminalApp: 'Unknown',
  terminalType: 'unknown',
  terminalPid: 0
}

export class TerminalResolver {
  private cache = new Map<number, TerminalInfo>()

  async resolve(pid: number): Promise<TerminalInfo> {
    const cached = this.cache.get(pid)
    if (cached) {
      return cached
    }

    try {
      const result = await this.walkChain(pid)
      this.cache.set(pid, result)
      return result
    } catch {
      return { ...UNKNOWN_TERMINAL }
    }
  }

  evict(pid: number): void {
    this.cache.delete(pid)
  }

  private async walkChain(pid: number): Promise<TerminalInfo> {
    let current = pid
    let depth = 0
    let multiplexer: 'tmux' | 'screen' | undefined

    while (current > 1 && depth < MAX_DEPTH) {
      const parentPid = await this.getParentPid(current)
      if (parentPid <= 1) {
        break
      }

      const comm = await this.getProcessComm(parentPid)

      // Check multiplexers first
      const mux = this.matchMultiplexer(comm)
      if (mux) {
        multiplexer = mux
        current = parentPid
        depth++
        continue
      }

      // Check known terminals
      const sig = this.matchTerminal(comm)
      if (sig) {
        return {
          terminalApp: sig.displayName,
          terminalType: sig.terminalType,
          terminalPid: parentPid,
          multiplexer
        }
      }

      // Check Electron (VS Code / Cursor disambiguation)
      if (comm === 'Electron') {
        const resolved = await this.resolveElectron(parentPid, multiplexer)
        if (resolved) {
          return resolved
        }
      }

      current = parentPid
      depth++
    }

    return { ...UNKNOWN_TERMINAL }
  }

  private matchTerminal(comm: string): TerminalSignature | undefined {
    return TERMINAL_SIGNATURES[comm]
  }

  private matchMultiplexer(comm: string): 'tmux' | 'screen' | undefined {
    return MULTIPLEXER_SIGNATURES[comm]
  }

  private async resolveElectron(
    pid: number,
    multiplexer?: 'tmux' | 'screen'
  ): Promise<TerminalInfo | undefined> {
    try {
      const args = await this.getProcessArgs(pid)

      if (args.includes('Visual Studio Code') || args.includes('Code.app')) {
        return {
          terminalApp: 'VS Code',
          terminalType: 'vscode',
          terminalPid: pid,
          multiplexer
        }
      }

      if (args.includes('Cursor')) {
        return {
          terminalApp: 'Cursor',
          terminalType: 'cursor',
          terminalPid: pid,
          multiplexer
        }
      }
    } catch {
      // Could not read args — skip this process
    }

    return undefined
  }

  private async getParentPid(pid: number): Promise<number> {
    const { stdout } = await execFilePromise('ps', ['-o', 'ppid=', '-p', String(pid)], {
      timeout: PS_TIMEOUT
    })
    return parseInt(stdout.trim(), 10)
  }

  private async getProcessComm(pid: number): Promise<string> {
    const { stdout } = await execFilePromise('ps', ['-o', 'comm=', '-p', String(pid)], {
      timeout: PS_TIMEOUT
    })
    return stdout.trim()
  }

  private async getProcessArgs(pid: number): Promise<string> {
    const { stdout } = await execFilePromise('ps', ['-o', 'args=', '-p', String(pid)], {
      timeout: PS_TIMEOUT
    })
    return stdout.trim()
  }
}
