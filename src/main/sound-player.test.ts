import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { POWERSHELL } from '../shared/platform-process'

const mockExecFile = vi.fn()
const mockExistsSync = vi.fn()
const app = vi.hoisted(() => ({ isPackaged: false }))

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args)
}))

vi.mock('fs', () => ({
  existsSync: (p: string) => mockExistsSync(p)
}))

vi.mock('electron', () => ({ app }))

import { SoundPlayer } from './sound-player'

type ExecCallback = (error: Error | null, stdout?: string, stderr?: string) => void

function finishWith(error: Error | null): void {
  mockExecFile.mockImplementation((...args: unknown[]) => (args.at(-1) as ExecCallback)(error))
}

describe('SoundPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    app.isPackaged = false
    mockExistsSync.mockReturnValue(true)
    finishWith(null)
  })

  it('should no-op gracefully when sound file is missing', async () => {
    mockExistsSync.mockReturnValue(false)
    await new SoundPlayer('darwin').playTaskComplete()
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  it('plays the m4a with afplay on macOS', async () => {
    await new SoundPlayer('darwin').playTaskComplete()
    expect(mockExecFile).toHaveBeenCalledWith(
      'afplay',
      [expect.stringMatching(/task-complete\.m4a$/)],
      { windowsHide: true },
      expect.any(Function)
    )
  })

  it('should resolve even if afplay fails', async () => {
    finishWith(new Error('afplay failed'))
    await expect(new SoundPlayer('darwin').playTaskComplete()).resolves.toBeUndefined()
  })

  it('plays the wav through the inbox PowerShell on Windows, the path passed as data', async () => {
    await new SoundPlayer('win32').playTaskComplete()

    const [file, args, options] = mockExecFile.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string> }
    ]
    expect(file).toBe(POWERSHELL)
    expect(options.env.CLAUDEWATCH_SOUND).toMatch(/task-complete\.wav$/)
    expect(options.env.SystemRoot).toBeTruthy()
    expect(args.join(' ')).not.toContain('task-complete')
  })

  it('should resolve even if PowerShell fails', async () => {
    finishWith(new Error('powershell failed'))
    await expect(new SoundPlayer('win32').playTaskComplete()).resolves.toBeUndefined()
  })

  it('reads the sound electron-builder ships under resources/sounds when packaged', () => {
    app.isPackaged = true
    Object.defineProperty(process, 'resourcesPath', { value: '/res', configurable: true })
    new SoundPlayer('win32').playTaskComplete()
    expect(mockExistsSync).toHaveBeenCalledWith(join('/res', 'sounds', 'task-complete.wav'))
  })

  it('should no-op on unsupported platforms', async () => {
    await new SoundPlayer('linux').playTaskComplete()
    expect(mockExecFile).not.toHaveBeenCalled()
  })
})
