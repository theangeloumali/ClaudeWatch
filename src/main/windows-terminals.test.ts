import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const { spawn, access, execFilePromise, runInteractivePowerShell } = vi.hoisted(() => ({
  spawn: vi.fn(),
  access: vi.fn(),
  execFilePromise: vi.fn(),
  runInteractivePowerShell: vi.fn()
}))
vi.mock('child_process', () => ({ spawn }))
vi.mock('fs/promises', () => ({ access }))
vi.mock('./platform/exec', () => ({ execFilePromise }))
vi.mock('../shared/powershell-host', () => ({ runInteractivePowerShell }))

import { POWERSHELL } from '../shared/platform-process'
import { focusWindowScript } from '../shared/windows-console'
import {
  launchWindowsApp,
  openWindowsFolder,
  raiseProcessWindow,
  WINDOWS_TERMINAL
} from './windows-terminals'

const FOLDER = 'C:\\Users\\dev\\a;b & "c"'

// A child that reports `spawn`, or `error` when the folder or program is missing.
function child(error?: Error): EventEmitter & { unref: () => void } {
  const emitter = Object.assign(new EventEmitter(), { unref: vi.fn() })
  queueMicrotask(() => (error ? emitter.emit('error', error) : emitter.emit('spawn')))
  return emitter
}

describe('openWindowsFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    access.mockResolvedValue(undefined)
    spawn.mockImplementation(() => child())
    execFilePromise.mockResolvedValue({ stdout: '', stderr: '' })
  })

  it('starts Windows Terminal in the folder, which travels as the working folder, never as argv text', async () => {
    expect(await openWindowsFolder(FOLDER)).toEqual({ success: true })
    expect(spawn).toHaveBeenCalledExactlyOnceWith(WINDOWS_TERMINAL, ['-d', '.'], {
      cwd: FOLDER,
      detached: true,
      stdio: 'ignore'
    })
  })

  it('runs a fixed agent command in the new tab', async () => {
    await openWindowsFolder(FOLDER, 'codex')
    expect(spawn.mock.calls[0][1]).toEqual(['-d', '.', 'cmd.exe', '/k', 'codex'])
  })

  it('falls back to a cmd.exe window, the folder passed in the environment', async () => {
    access.mockRejectedValue(new Error('ENOENT'))
    expect(await openWindowsFolder(FOLDER, 'claude')).toEqual({ success: true })
    expect(spawn).not.toHaveBeenCalled()
    const [program, args, options] = execFilePromise.mock.calls[0]
    expect(program).toBe(POWERSHELL)
    expect(args.join(' ')).not.toContain(FOLDER)
    expect(options.env).toMatchObject({
      CLAUDEWATCH_FOLDER: FOLDER,
      CLAUDEWATCH_ARGUMENTS: '/k claude'
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
