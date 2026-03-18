import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./platform/exec', () => ({
  execFilePromise: vi.fn()
}))

import { execFilePromise } from './platform/exec'
import { TerminalResolver } from './terminal-resolver'

const mockExec = vi.mocked(execFilePromise)

/**
 * Helper: set up a process chain for the mock.
 * `chain` is an array of { pid, ppid, comm, args? } entries.
 * The mock routes based on the ps flags passed.
 */
function setupProcessChain(chain: { pid: number; ppid: number; comm: string; args?: string }[]) {
  const byPid = new Map(chain.map((e) => [e.pid, e]))

  mockExec.mockImplementation(async (_bin: string, args: string[]) => {
    const pidStr = args[args.length - 1]
    const pid = parseInt(pidStr, 10)
    const entry = byPid.get(pid)

    if (!entry) {
      throw new Error(`ps: pid ${pid} not found`)
    }

    const flag = args[1] // e.g. 'ppid=', 'comm=', 'args='

    if (flag === 'ppid=') {
      return { stdout: `  ${entry.ppid}\n`, stderr: '' }
    }
    if (flag === 'comm=') {
      return { stdout: `${entry.comm}\n`, stderr: '' }
    }
    if (flag === 'args=') {
      return { stdout: `${entry.args ?? entry.comm}\n`, stderr: '' }
    }

    throw new Error(`Unexpected ps flag: ${flag}`)
  })
}

describe('TerminalResolver', () => {
  let resolver: TerminalResolver

  beforeEach(() => {
    vi.clearAllMocks()
    resolver = new TerminalResolver()
  })

  it('resolves iTerm2 (PID → zsh → iTerm2)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'zsh' },
      { pid: 300, ppid: 1, comm: 'iTerm2' }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('iTerm2')
    expect(result.terminalType).toBe('iterm2')
    expect(result.terminalPid).toBe(300)
    expect(result.multiplexer).toBeUndefined()
  })

  it('resolves Warp (PID → zsh → Warp)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'zsh' },
      { pid: 300, ppid: 1, comm: 'Warp' }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('Warp')
    expect(result.terminalType).toBe('warp')
    expect(result.terminalPid).toBe(300)
  })

  it('resolves Terminal.app (PID → zsh → Terminal)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'zsh' },
      { pid: 300, ppid: 1, comm: 'Terminal' }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('Terminal.app')
    expect(result.terminalType).toBe('terminal-app')
    expect(result.terminalPid).toBe(300)
  })

  it('resolves VS Code (PID → node → Electron with VS Code path)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'node' },
      {
        pid: 300,
        ppid: 1,
        comm: 'Electron',
        args: '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'
      }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('VS Code')
    expect(result.terminalType).toBe('vscode')
    expect(result.terminalPid).toBe(300)
  })

  it('resolves Cursor (PID → node → Electron with Cursor path)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'node' },
      {
        pid: 300,
        ppid: 1,
        comm: 'Electron',
        args: '/Applications/Cursor.app/Contents/MacOS/Electron'
      }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('Cursor')
    expect(result.terminalType).toBe('cursor')
    expect(result.terminalPid).toBe(300)
  })

  it('resolves Ghostty (PID → zsh → ghostty)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'zsh' },
      { pid: 300, ppid: 1, comm: 'ghostty' }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('Ghostty')
    expect(result.terminalType).toBe('ghostty')
    expect(result.terminalPid).toBe(300)
  })

  it('resolves tmux + parent terminal (PID → tmux → iTerm2, sets multiplexer)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'zsh' },
      { pid: 300, ppid: 400, comm: 'tmux: server' },
      { pid: 400, ppid: 1, comm: 'iTerm2' }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('iTerm2')
    expect(result.terminalType).toBe('iterm2')
    expect(result.terminalPid).toBe(400)
    expect(result.multiplexer).toBe('tmux')
  })

  it('returns unknown for unrecognized chain (reaches PID 1)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'zsh' },
      { pid: 300, ppid: 1, comm: 'launchd' },
      { pid: 1, ppid: 0, comm: 'launchd' }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('Unknown')
    expect(result.terminalType).toBe('unknown')
    expect(result.terminalPid).toBe(0)
    expect(result.multiplexer).toBeUndefined()
  })

  it('caches results (second call skips shell commands)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'zsh' },
      { pid: 300, ppid: 1, comm: 'iTerm2' }
    ])

    const first = await resolver.resolve(100)
    const callsAfterFirst = mockExec.mock.calls.length

    const second = await resolver.resolve(100)

    expect(second).toEqual(first)
    expect(mockExec.mock.calls.length).toBe(callsAfterFirst)
  })

  it('evicts cache on evict(pid)', async () => {
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'zsh' },
      { pid: 300, ppid: 1, comm: 'iTerm2' }
    ])

    await resolver.resolve(100)
    const callsAfterFirst = mockExec.mock.calls.length

    resolver.evict(100)
    await resolver.resolve(100)

    expect(mockExec.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('handles shell command failure gracefully → returns unknown', async () => {
    mockExec.mockRejectedValue(new Error('ps failed'))

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('Unknown')
    expect(result.terminalType).toBe('unknown')
    expect(result.terminalPid).toBe(0)
  })

  it('safety limit: chain deeper than 15 → returns unknown', async () => {
    // Build a chain of 20 processes, none matching a terminal
    const chain: { pid: number; ppid: number; comm: string }[] = []
    for (let i = 0; i < 20; i++) {
      chain.push({
        pid: 100 + i,
        ppid: 100 + i + 1,
        comm: `process-${i}`
      })
    }
    // Last process points to PID 1
    chain[chain.length - 1].ppid = 1
    chain.push({ pid: 1, ppid: 0, comm: 'launchd' })

    setupProcessChain(chain)

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('Unknown')
    expect(result.terminalType).toBe('unknown')
    expect(result.terminalPid).toBe(0)
  })

  it('handles ?? TTY (background process) — still walks parent chain', async () => {
    // Background processes have ?? TTY but the resolver doesn't care about TTY,
    // it just walks PIDs regardless
    setupProcessChain([
      { pid: 100, ppid: 200, comm: 'claude' },
      { pid: 200, ppid: 300, comm: 'bash' },
      { pid: 300, ppid: 400, comm: 'zsh' },
      { pid: 400, ppid: 1, comm: 'Warp' }
    ])

    const result = await resolver.resolve(100)

    expect(result.terminalApp).toBe('Warp')
    expect(result.terminalType).toBe('warp')
    expect(result.terminalPid).toBe(400)
  })
})
