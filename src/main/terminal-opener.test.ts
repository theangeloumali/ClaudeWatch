import { afterAll, beforeAll, describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecFile = vi.fn()

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args)
}))
const openWindowsFolder = vi.hoisted(() => vi.fn())
vi.mock('./windows-terminals', () => ({ openWindowsFolder }))

// The openers below are macOS's, whatever this machine is; Windows has its own block at the end.
const machinePlatform = process.platform
beforeAll(() => Object.defineProperty(process, 'platform', { value: 'darwin' }))
afterAll(() => Object.defineProperty(process, 'platform', { value: machinePlatform }))

import { openTerminal, openTerminalRunning, raiseTerminal } from './terminal-opener'

type ExecCallback = (error: Error | null, stdout?: string, stderr?: string) => void

describe('openTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dispatches to Warp opener for "warp"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'warp')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'osascript',
      ['-e', expect.stringContaining('tell application "Warp"'), '/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('dispatches to iTerm2 opener for "iterm2"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'iterm2')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'osascript',
      ['-e', expect.stringContaining('tell application "iTerm2"'), '/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('dispatches to Terminal.app opener for "terminal-app"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'terminal-app')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'osascript',
      ['-e', expect.stringContaining('tell application "Terminal"'), '/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('dispatches to VS Code opener for "vscode"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'vscode')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'code',
      ['/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('dispatches to Cursor opener for "cursor"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'cursor')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'cursor',
      ['/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('dispatches to kitty opener for "kitty"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'kitty')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'kitty',
      ['@', 'launch', '--cwd', '/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('dispatches to wezterm opener for "wezterm"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'wezterm')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'wezterm',
      ['cli', 'spawn', '--cwd', '/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('dispatches to Ghostty opener for "ghostty"', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'ghostty')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'osascript',
      ['-e', expect.stringContaining('tell application "Ghostty"'), '/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('falls back to default for unknown terminal type', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project', 'unknown')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'open',
      ['-a', 'Terminal', '/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('falls back to default when terminalType is undefined', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )

    const result = await openTerminal('/Users/dev/project')

    expect(result).toEqual({ success: true })
    expect(mockExecFile).toHaveBeenCalledWith(
      'open',
      ['-a', 'Terminal', '/Users/dev/project'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    )
  })

  it('handles AppleScript execution failure gracefully', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(new Error('osascript failed'))
      }
    )

    const result = await openTerminal('/Users/dev/project', 'warp')

    expect(result).toEqual({ success: false })
  })
})

describe('openTerminal with an untrusted project path', () => {
  const hostilePath = '/tmp/proj"; $(touch /tmp/cw-pwned) "'

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )
  })

  it.each(['warp', 'iterm2', 'terminal-app', 'ghostty'] as const)(
    '%s passes the path as an osascript argument, never inside the script',
    async (terminalType) => {
      await openTerminal(hostilePath, terminalType)

      const [command, args] = mockExecFile.mock.calls[0] as [string, string[]]
      expect(command).toBe('osascript')
      expect(args[1]).not.toContain('cw-pwned')
      expect(args[1]).toContain('quoted form of')
      expect(args.slice(2)).toEqual([hostilePath])
    }
  )
})

describe('openTerminalRunning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
        cb(null)
      }
    )
  })

  it('starts the agent command in Terminal.app with path and command as argv', async () => {
    expect(await openTerminalRunning('/tmp/a b"$(x)', 'codex')).toEqual({ success: true })
    const [command, args] = mockExecFile.mock.calls[0] as [string, string[]]
    expect(command).toBe('osascript')
    expect(args.slice(2)).toEqual(['/tmp/a b"$(x)', 'codex'])
    expect(args[1]).toContain('quoted form of projectPath')
    expect(args[1]).not.toContain('$(x)')
  })
})

describe('raiseTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => cb(null)
    )
  })

  it.each([
    ['terminal-app', 'Terminal'],
    ['iterm2', 'iTerm'],
    ['warp', 'Warp'],
    ['ghostty', 'Ghostty'],
    ['kitty', 'kitty'],
    ['wezterm', 'WezTerm'],
    ['alacritty', 'Alacritty'],
    ['hyper', 'Hyper'],
    ['vscode', 'Visual Studio Code'],
    ['cursor', 'Cursor']
  ] as const)('brings %s forward by its app name and does nothing else', async (type, app) => {
    expect(await raiseTerminal(type)).toEqual({ success: true })
    expect(mockExecFile.mock.calls.map(([program, args]) => [program, args])).toEqual([
      ['/usr/bin/open', ['-a', app]]
    ])
  })

  it.each(['tmux', 'screen', 'unknown', undefined] as const)(
    'runs nothing for %s, which names no app to bring forward',
    async (type) => {
      expect(await raiseTerminal(type)).toEqual({ success: false })
      expect(mockExecFile).not.toHaveBeenCalled()
    }
  )

  it('reports an app that could not be brought forward', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => cb(new Error('no app'))
    )
    expect(await raiseTerminal('warp')).toEqual({ success: false })
  })
})

describe('on Windows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openWindowsFolder.mockResolvedValue({ success: true })
  })

  it('opens every host type as a Windows Terminal window in the folder, with no AppleScript', async () => {
    for (const type of ['warp', 'vscode', 'terminal-app', undefined] as const) {
      expect(await openTerminal('C:\\repo\\app', type, 'win32')).toEqual({ success: true })
    }
    expect(openWindowsFolder.mock.calls).toEqual(Array(4).fill(['C:\\repo\\app']))
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  it('passes on why an agent could not be started', async () => {
    openWindowsFolder.mockResolvedValueOnce({ success: false, reason: 'agent-not-found' })
    expect(await openTerminalRunning('C:\\repo\\app', 'codex', 'win32')).toEqual({
      success: false,
      reason: 'agent-not-found'
    })
  })

  it('starts an agent in a new window when Orca is not running', async () => {
    expect(await openTerminalRunning('C:\\repo\\app', 'claude', 'win32')).toEqual({ success: true })
    expect(openWindowsFolder).toHaveBeenCalledExactlyOnceWith('C:\\repo\\app', 'claude')
    expect(mockExecFile).not.toHaveBeenCalled()
  })
})
