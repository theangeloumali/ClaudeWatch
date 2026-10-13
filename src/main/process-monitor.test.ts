import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessMonitor, detectSessionType } from './process-monitor'
import type { PlatformDetector, RawProcessInfo } from './platform/darwin'
import { runPowerShell } from '../shared/powershell-host'

// We mock child_process used by platform detectors
vi.mock('child_process', () => ({
  execFile: vi.fn()
}))
vi.mock('../shared/powershell-host', () => ({ runPowerShell: vi.fn() }))

import { execFile } from 'child_process'

const mockExecFile = vi.mocked(execFile)

type ExecCallback = (error: Error | null, stdout?: string, stderr?: string) => void

// ─── Darwin ps output samples ───
const PS_HEADER = '  PID STAT %CPU %MEM     ELAPSED TT       COMMAND'

const PS_LINE_ACTIVE =
  '12345 R+    45.2  1.3       02:30 ttys001  /usr/local/bin/claude --resume abc123 --dangerously-skip-permissions'

const PS_LINE_IDLE =
  '67890 S     0.1  0.8       10:15 ttys002  /Users/angelo/.claude/local/claude --continue'

const PS_LINE_GUI =
  '11111 S     2.0  3.0       01:00 ??       /Applications/Claude.app/Contents/MacOS/Claude'

const PS_LINE_GREP = '99999 S     0.0  0.0       00:01 ttys003  grep claude'

const LSOF_OUTPUT_12345 = 'p12345\nn/Users/angelo/Desktop/Work/ZKidz/MacClaudeTracker\n'
const LSOF_OUTPUT_67890 = 'p67890\nn/Users/angelo/projects/my-app\n'

describe('ProcessMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('poll() on darwin', () => {
    it('should detect active Claude processes from ps output', async () => {
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          // ps call
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_ACTIVE}\n`, '')
        } else {
          // lsof call for PID 12345
          ;(cb as ExecCallback)(null, LSOF_OUTPUT_12345, '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ cpuIdleThreshold: 1.0, platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances).toHaveLength(1)
      expect(instances[0].pid).toBe(12345)
      expect(instances[0].status).toBe('active')
      expect(instances[0].cpuPercent).toBeCloseTo(45.2)
      expect(instances[0].memPercent).toBeCloseTo(1.3)
      expect(instances[0].projectPath).toBe('/Users/angelo/Desktop/Work/ZKidz/MacClaudeTracker')
      expect(instances[0].flags).toContain('--resume')
      expect(instances[0].flags).toContain('--dangerously-skip-permissions')
      expect(instances[0].sessionId).toBe('abc123')
    })

    it('should detect idle Claude processes (low CPU + sleeping)', async () => {
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_IDLE}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, LSOF_OUTPUT_67890, '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ cpuIdleThreshold: 1.0, platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances).toHaveLength(1)
      expect(instances[0].pid).toBe(67890)
      expect(instances[0].status).toBe('idle')
      expect(instances[0].flags).toContain('--continue')
      expect(instances[0].sessionId).toBeUndefined()
    })

    it('judges by a threshold changed while running', async () => {
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_ACTIVE}\n`, '')
      }) as typeof execFile)
      const monitor = new ProcessMonitor({ cpuIdleThreshold: 1.0, platform: 'darwin' })
      expect((await monitor.poll())[0].status).toBe('active')

      monitor.setCpuIdleThreshold(90)
      expect((await monitor.poll())[0].status).toBe('idle')
    })

    it('should exclude Claude.app GUI and grep processes', async () => {
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_GUI}\n${PS_LINE_GREP}\n`, '')
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances).toHaveLength(0)
    })

    it('should handle multiple Claude processes in one poll', async () => {
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_ACTIVE}\n${PS_LINE_IDLE}\n`, '')
        } else if (callCount === 2) {
          ;(cb as ExecCallback)(null, LSOF_OUTPUT_12345, '')
        } else {
          ;(cb as ExecCallback)(null, LSOF_OUTPUT_67890, '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ cpuIdleThreshold: 1.0, platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances).toHaveLength(2)
      expect(instances.map((i) => i.pid).sort()).toEqual([12345, 67890])
    })

    it('should return empty array when no Claude processes found', async () => {
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        ;(cb as ExecCallback)(null, `${PS_HEADER}\n`, '')
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances).toEqual([])
    })

    it('should handle ps command failure gracefully', async () => {
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        ;(cb as ExecCallback)(new Error('ps failed'), '', 'ps failed')
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances).toEqual([])
    })

    it('should handle lsof failure gracefully by using empty project path', async () => {
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_ACTIVE}\n`, '')
        } else {
          ;(cb as ExecCallback)(new Error('lsof failed'), '', 'lsof failed')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances).toHaveLength(1)
      expect(instances[0].projectPath).toBe('')
    })

    it('should parse elapsed time correctly', async () => {
      const psLineLong = '55555 R+    10.0  2.0    1:05:30 ttys004  /usr/local/bin/claude'
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${psLineLong}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, 'p55555\nn/tmp/project\n', '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances).toHaveLength(1)
      expect(instances[0].elapsedTime).toBe('1:05:30')
      expect(instances[0].elapsedSeconds).toBe(3930)
    })

    it('should extract projectName from projectPath', async () => {
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_ACTIVE}\n`, '')
        } else {
          ;(cb as ExecCallback)(
            null,
            'p12345\nn/Users/angelo/Desktop/Work/ZKidz/MacClaudeTracker\n',
            ''
          )
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()

      expect(instances[0].projectName).toBe('ZKidz/MacClaudeTracker')
    })
  })

  describe('status determination', () => {
    it('should classify R stat with high CPU as active', async () => {
      const psLine = '10000 R+    50.0  1.0       01:00 ttys001  /usr/local/bin/claude'
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${psLine}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, 'p10000\nn/tmp\n', '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ cpuIdleThreshold: 1.0, platform: 'darwin' })
      const instances = await monitor.poll()
      expect(instances[0].status).toBe('active')
    })

    it('should classify S stat with low CPU as idle', async () => {
      const psLine = '10001 S     0.5  1.0       01:00 ttys001  /usr/local/bin/claude'
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${psLine}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, 'p10001\nn/tmp\n', '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ cpuIdleThreshold: 1.0, platform: 'darwin' })
      const instances = await monitor.poll()
      expect(instances[0].status).toBe('idle')
    })

    it('should use configurable cpuIdleThreshold', async () => {
      const psLine = '10002 S     3.0  1.0       01:00 ttys001  /usr/local/bin/claude'
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${psLine}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, 'p10002\nn/tmp\n', '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ cpuIdleThreshold: 5.0, platform: 'darwin' })
      const instances = await monitor.poll()
      expect(instances[0].status).toBe('idle')
    })
  })

  describe('default threshold', () => {
    it('should treat 2.0% CPU as idle with default threshold (3.0%)', async () => {
      const psLine = '10010 S     2.0  1.0       01:00 ttys001  /usr/local/bin/claude'
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${psLine}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, 'p10010\nn/tmp\n', '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()
      expect(instances[0].status).toBe('idle')
    })
  })

  describe('flag parsing', () => {
    it('should parse --resume with session ID', async () => {
      const psLine =
        '20000 R+    10.0  1.0       01:00 ttys001  /usr/local/bin/claude --resume session-xyz'
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${psLine}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, 'p20000\nn/tmp\n', '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()
      expect(instances[0].sessionId).toBe('session-xyz')
      expect(instances[0].flags).toContain('--resume')
    })

    it('should parse --continue flag without session ID', async () => {
      const psLine = '20001 S     0.1  1.0       01:00 ttys001  /usr/local/bin/claude --continue'
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${psLine}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, 'p20001\nn/tmp\n', '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()
      expect(instances[0].sessionId).toBeUndefined()
      expect(instances[0].flags).toContain('--continue')
    })

    it('should handle no flags', async () => {
      const psLine = '20002 S     0.1  1.0       01:00 ttys001  /usr/local/bin/claude'
      let callCount = 0
      mockExecFile.mockImplementation(((
        _bin: string,
        _args: unknown,
        _options: unknown,
        cb: unknown
      ) => {
        callCount++
        if (callCount === 1) {
          ;(cb as ExecCallback)(null, `${PS_HEADER}\n${psLine}\n`, '')
        } else {
          ;(cb as ExecCallback)(null, 'p20002\nn/tmp\n', '')
        }
      }) as typeof execFile)

      const monitor = new ProcessMonitor({ platform: 'darwin' })
      const instances = await monitor.poll()
      expect(instances[0].flags).toEqual([])
      expect(instances[0].sessionId).toBeUndefined()
    })
  })
})

describe('poll() on win32', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // A cold powershell.exe costs about a fifth of a core per 3 s poll; the kept one does not.
  it('lists Claude Code through the kept PowerShell, starting no process', async () => {
    // pid, start FILETIME, CPU ticks, working set, CreationDate ticks, command line in base64.
    const command = Buffer.from('C:\\bin\\claude.exe --continue').toString('base64')
    vi.mocked(runPowerShell).mockResolvedValue(`4242 134363332085558537 0 0 1 ${command}`)

    const instances = await new ProcessMonitor({ platform: 'win32' }).poll()

    expect(runPowerShell).toHaveBeenCalledOnce()
    expect(mockExecFile).not.toHaveBeenCalled()
    expect(instances.map((instance) => [instance.pid, instance.flags])).toEqual([
      [4242, ['--continue']]
    ])
  })
})

describe('terminal enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should enrich poll results with terminalApp and terminalType from resolver', async () => {
    let callCount = 0
    mockExecFile.mockImplementation(((
      _bin: string,
      _args: unknown,
      _options: unknown,
      cb: unknown
    ) => {
      callCount++
      if (callCount === 1) {
        ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_ACTIVE}\n`, '')
      } else {
        ;(cb as ExecCallback)(null, LSOF_OUTPUT_12345, '')
      }
    }) as typeof execFile)

    const mockResolver = {
      resolve: vi.fn().mockResolvedValue({
        terminalApp: 'iTerm2',
        terminalType: 'iterm2'
      })
    }

    const monitor = new ProcessMonitor({ terminalResolver: mockResolver, platform: 'darwin' })
    const instances = await monitor.poll()

    expect(instances).toHaveLength(1)
    expect(mockResolver.resolve).toHaveBeenCalledWith(12345)
    expect(instances[0].terminalApp).toBe('iTerm2')
    expect(instances[0].terminalType).toBe('iterm2')
  })

  it('should leave terminalApp and terminalType undefined when no resolver is provided', async () => {
    let callCount = 0
    mockExecFile.mockImplementation(((
      _bin: string,
      _args: unknown,
      _options: unknown,
      cb: unknown
    ) => {
      callCount++
      if (callCount === 1) {
        ;(cb as ExecCallback)(null, `${PS_HEADER}\n${PS_LINE_ACTIVE}\n`, '')
      } else {
        ;(cb as ExecCallback)(null, LSOF_OUTPUT_12345, '')
      }
    }) as typeof execFile)

    const monitor = new ProcessMonitor({ platform: 'darwin' })
    const instances = await monitor.poll()

    expect(instances).toHaveLength(1)
    expect(instances[0].terminalApp).toBeUndefined()
    expect(instances[0].terminalType).toBeUndefined()
  })
})

describe('working folders', () => {
  const rawProcess = (pid: number): RawProcessInfo => ({
    pid,
    stat: 'S',
    cpuPercent: 0,
    memPercent: 0,
    elapsedTime: '00:01',
    tty: 'console',
    command: 'claude'
  })

  it('asks for every folder at once and gives each process its own', async () => {
    const pending = new Map<number, (folder: string) => void>()
    const detector: PlatformDetector = {
      getClaudeProcesses: async () => [rawProcess(1), rawProcess(2)],
      getWorkingDirectory: (pid) => new Promise((resolve) => pending.set(pid, resolve))
    }
    const polled = new ProcessMonitor({ detector }).poll()
    await vi.waitFor(() => expect([...pending.keys()]).toEqual([1, 2]))
    pending.get(2)!('/two')
    pending.get(1)!('/one')

    expect((await polled).map((instance) => [instance.pid, instance.projectPath])).toEqual([
      [1, '/one'],
      [2, '/two']
    ])
  })
})

describe('detectSessionType', () => {
  it('should detect a normal CLI session', () => {
    const command = '/usr/local/bin/claude --resume abc123'
    const flags = ['--resume']
    expect(detectSessionType(command, flags)).toBe('cli')
  })

  it('should detect a VS Code extension session', () => {
    const command =
      '/usr/local/bin/claude --output-format stream-json --permission-prompt-tool stdio'
    const flags = ['--output-format', '--permission-prompt-tool']
    expect(detectSessionType(command, flags)).toBe('vscode')
  })

  it('should detect a subagent session', () => {
    const command = '/usr/local/bin/claude --output-format stream-json'
    const flags = ['--output-format']
    expect(detectSessionType(command, flags)).toBe('subagent')
  })

  it('should default to cli when no distinguishing flags are present', () => {
    const command = '/usr/local/bin/claude'
    const flags: string[] = []
    expect(detectSessionType(command, flags)).toBe('cli')
  })
})
