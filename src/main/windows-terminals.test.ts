import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const { spawn, access, stat, execFilePromise, runInteractivePowerShell } = vi.hoisted(() => ({
  spawn: vi.fn(),
  access: vi.fn(),
  stat: vi.fn(),
  execFilePromise: vi.fn(),
  runInteractivePowerShell: vi.fn()
}))
vi.mock('child_process', () => ({ spawn }))
vi.mock('fs/promises', () => ({ access, stat }))
vi.mock('./platform/exec', () => ({ execFilePromise }))
vi.mock('../shared/powershell-host', () => ({ runInteractivePowerShell }))

import { POWERSHELL } from '../shared/platform-process'
import { focusWindowScript } from '../shared/windows-console'
import {
  launchWindowsApp,
  openWindowsFolder,
  raiseProcessWindow,
  WINDOWS_CMD,
  WINDOWS_TERMINAL
} from './windows-terminals'

const FOLDER = 'C:\\Users\\dev\\a;b & "c"'

// A child that reports `spawn`, or `error` when the folder or program is missing.
function child(error?: Error): EventEmitter & { unref: () => void } {
  const emitter = Object.assign(new EventEmitter(), { unref: vi.fn() })
  queueMicrotask(() => (error ? emitter.emit('error', error) : emitter.emit('spawn')))
  return emitter
}

// The files that exist, as fs.stat sees them; everything else is missing.
function files(...paths: string[]): void {
  stat.mockImplementation(async (path: string) => {
    if (paths.includes(path)) return { isFile: () => true }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  })
}

describe('openWindowsFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    access.mockResolvedValue(undefined)
    spawn.mockImplementation(() => child())
    execFilePromise.mockResolvedValue({ stdout: '', stderr: '' })
    vi.stubEnv('PATH', 'C:\\tools;.;relative\\bin')
    files('C:\\tools\\claude.cmd')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('starts Windows Terminal in the folder, which travels as the working folder, never as argv text', async () => {
    expect(await openWindowsFolder(FOLDER)).toEqual({ success: true })
    expect(spawn).toHaveBeenCalledExactlyOnceWith(WINDOWS_TERMINAL, ['-d', '.'], {
      cwd: FOLDER,
      env: expect.objectContaining({ NoDefaultCurrentDirectoryInExePath: '1' }),
      detached: true,
      stdio: 'ignore'
    })
  })

  it('runs the agent by its absolute path from PATH, through the absolute cmd.exe', async () => {
    expect(await openWindowsFolder(FOLDER, 'claude')).toEqual({ success: true })
    expect(spawn.mock.calls[0][1]).toEqual(['-d', '.', WINDOWS_CMD, '/k', 'C:\\tools\\claude.cmd'])
    expect(WINDOWS_CMD).toMatch(/^[A-Za-z]:\\.*\\System32\\cmd\.exe$/i)
  })

  it('gives the terminal the user’s own environment, with no search of the working folder', async () => {
    vi.stubEnv('CLAUDEWATCH_PROBE', 'kept')
    await openWindowsFolder(FOLDER, 'claude')
    expect(spawn.mock.calls[0][2].env).toMatchObject({
      PATH: 'C:\\tools;.;relative\\bin',
      CLAUDEWATCH_PROBE: 'kept',
      NoDefaultCurrentDirectoryInExePath: '1'
    })
  })

  it('never runs an agent that sits only in the project folder or a relative PATH entry', async () => {
    files(`${FOLDER}\\claude.cmd`, '.\\claude.cmd', 'relative\\bin\\claude.exe')
    expect(await openWindowsFolder(FOLDER, 'claude')).toEqual({
      success: false,
      reason: 'agent-not-found'
    })
    expect(spawn).not.toHaveBeenCalled()
    expect(execFilePromise).not.toHaveBeenCalled()
  })

  it('refuses an agent whose path cmd.exe would read as more than a path', async () => {
    vi.stubEnv('PATH', 'C:\\a&b;C:\\p%x%;C:\\Program Files (x86)\\n')
    files('C:\\a&b\\codex.exe', 'C:\\p%x%\\codex.exe', 'C:\\Program Files (x86)\\n\\codex.exe')
    expect(await openWindowsFolder(FOLDER, 'codex')).toEqual({
      success: false,
      reason: 'agent-not-found'
    })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('takes the first PATH entry that has the agent, in PATHEXT order', async () => {
    vi.stubEnv('PATH', 'C:\\first;C:\\second')
    files('C:\\first\\codex.cmd', 'C:\\first\\codex.exe', 'C:\\second\\codex.com')
    await openWindowsFolder(FOLDER, 'codex')
    expect(spawn.mock.calls[0][1].at(-1)).toBe('C:\\first\\codex.exe')
  })

  it('falls back to a cmd.exe window, the folder, shell and agent passed in the environment', async () => {
    access.mockRejectedValue(new Error('ENOENT'))
    expect(await openWindowsFolder(FOLDER, 'claude')).toEqual({ success: true })
    expect(spawn).not.toHaveBeenCalled()
    const [program, args, options] = execFilePromise.mock.calls[0]
    expect(program).toBe(POWERSHELL)
    expect(args.join(' ')).not.toContain(FOLDER)
    expect(args.join(' ')).not.toContain('claude.cmd')
    expect(options.env).toMatchObject({
      PATH: 'C:\\tools;.;relative\\bin',
      NoDefaultCurrentDirectoryInExePath: '1',
      CLAUDEWATCH_SHELL: WINDOWS_CMD,
      CLAUDEWATCH_FOLDER: FOLDER,
      CLAUDEWATCH_ARGUMENTS: '/k "C:\\tools\\claude.cmd"'
    })
  })

  it('fails when the folder or the program is missing', async () => {
    spawn.mockImplementation(() => child(new Error('spawn ENOENT')))
    expect(await openWindowsFolder(FOLDER)).toEqual({ success: false })
    access.mockRejectedValue(new Error('ENOENT'))
    execFilePromise.mockRejectedValue(new Error('exit 1'))
    expect(await openWindowsFolder(FOLDER)).toEqual({ success: false })
  })
})

describe('raiseProcessWindow', () => {
  const runScript = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('finds and raises the window in one script run, through the runner it is given', async () => {
    runScript.mockResolvedValue('True\r\n')
    expect(await raiseProcessWindow(42, runScript)).toBe(true)
    expect(runScript).toHaveBeenCalledExactlyOnceWith(focusWindowScript(42))
    expect(execFilePromise).not.toHaveBeenCalled()
  })

  it('is false when no window was found or Windows kept another in front, or the run failed', async () => {
    runScript.mockResolvedValueOnce('False\r\n')
    expect(await raiseProcessWindow(42, runScript)).toBe(false)
    runScript.mockRejectedValueOnce(new Error('timeout'))
    expect(await raiseProcessWindow(42, runScript)).toBe(false)
  })

  it('uses the kept PowerShell host when given no runner', async () => {
    runInteractivePowerShell.mockResolvedValue('True\r\n')
    expect(await raiseProcessWindow(42)).toBe(true)
    expect(runInteractivePowerShell).toHaveBeenCalledExactlyOnceWith(focusWindowScript(42))
    expect(execFilePromise).not.toHaveBeenCalled()
  })
})

describe('launchWindowsApp', () => {
  const APP = 'C:\\Users\\dev\\AppData\\Local\\Programs\\orca\\Orca.exe'

  beforeEach(() => {
    vi.clearAllMocks()
    spawn.mockImplementation(() => child())
    execFilePromise.mockResolvedValue({ stdout: 'True\r\n', stderr: '' })
  })

  it('starts the program with no arguments and no shell, then raises its window by its path', async () => {
    await launchWindowsApp(APP)
    expect(spawn).toHaveBeenCalledExactlyOnceWith(APP, [], {
      cwd: 'C:\\Users\\dev\\AppData\\Local\\Programs\\orca',
      detached: true,
      stdio: 'ignore'
    })
    const [program, args, options] = execFilePromise.mock.calls[0]
    expect(program).toBe(POWERSHELL)
    expect(args.join(' ')).not.toContain(APP)
    expect(options.env).toMatchObject({ CLAUDEWATCH_APP: APP })
  })

  it('counts a started app as launched even when its window is not up to raise yet', async () => {
    execFilePromise.mockRejectedValue(new Error('timeout'))
    await expect(launchWindowsApp(APP)).resolves.toBeUndefined()
  })

  it('fails when the program cannot start', async () => {
    spawn.mockImplementation(() => child(new Error('spawn ENOENT')))
    await expect(launchWindowsApp(APP)).rejects.toThrow('ENOENT')
    expect(execFilePromise).not.toHaveBeenCalled()
  })
})
