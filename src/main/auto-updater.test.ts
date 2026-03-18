import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAutoUpdater = vi.hoisted(() => {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler
    }),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    _emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.(...args)
    }
  }
})

const mockIsDev = vi.hoisted(() => ({ value: false }))

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    get dev() {
      return mockIsDev.value
    }
  }
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

import { AutoUpdaterManager } from './auto-updater'

function makeMockWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() }
  }
}

describe('AutoUpdaterManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockIsDev.value = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('configures autoUpdater on construction in production', () => {
    new AutoUpdaterManager([])

    expect(mockAutoUpdater.autoDownload).toBe(false)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function))
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function))
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function))
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function))
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function))
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('skips configuration in dev mode', () => {
    mockIsDev.value = true
    vi.clearAllMocks()

    new AutoUpdaterManager([])

    expect(mockAutoUpdater.on).not.toHaveBeenCalled()
  })

  it('forwards update-available event to BrowserWindow', () => {
    const win = makeMockWindow()
    new AutoUpdaterManager([() => win as unknown as Electron.BrowserWindow])

    mockAutoUpdater._emit('update-available', {
      version: '2.0.0',
      releaseNotes: 'New features'
    })

    expect(win.webContents.send).toHaveBeenCalledWith('updater:status', {
      status: 'available',
      data: { version: '2.0.0', releaseNotes: 'New features' }
    })
  })

  it('forwards checking-for-update event', () => {
    const win = makeMockWindow()
    new AutoUpdaterManager([() => win as unknown as Electron.BrowserWindow])

    mockAutoUpdater._emit('checking-for-update')

    expect(win.webContents.send).toHaveBeenCalledWith('updater:status', {
      status: 'checking',
      data: undefined
    })
  })

  it('forwards update-not-available event', () => {
    const win = makeMockWindow()
    new AutoUpdaterManager([() => win as unknown as Electron.BrowserWindow])

    mockAutoUpdater._emit('update-not-available')

    expect(win.webContents.send).toHaveBeenCalledWith('updater:status', {
      status: 'not-available',
      data: undefined
    })
  })

  it('forwards download-progress event', () => {
    const win = makeMockWindow()
    new AutoUpdaterManager([() => win as unknown as Electron.BrowserWindow])

    mockAutoUpdater._emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1024,
      transferred: 500,
      total: 1200
    })

    expect(win.webContents.send).toHaveBeenCalledWith('updater:status', {
      status: 'downloading',
      data: { percent: 42, bytesPerSecond: 1024, transferred: 500, total: 1200 }
    })
  })

  it('forwards update-downloaded event', () => {
    const win = makeMockWindow()
    new AutoUpdaterManager([() => win as unknown as Electron.BrowserWindow])

    mockAutoUpdater._emit('update-downloaded')

    expect(win.webContents.send).toHaveBeenCalledWith('updater:status', {
      status: 'downloaded',
      data: undefined
    })
  })

  it('forwards error event with message', () => {
    const win = makeMockWindow()
    new AutoUpdaterManager([() => win as unknown as Electron.BrowserWindow])

    mockAutoUpdater._emit('error', { message: 'Network error' })

    expect(win.webContents.send).toHaveBeenCalledWith('updater:status', {
      status: 'error',
      data: 'Network error'
    })
  })

  it('skips destroyed windows when sending', () => {
    const destroyedWin = makeMockWindow(true)
    const liveWin = makeMockWindow(false)

    new AutoUpdaterManager([
      () => destroyedWin as unknown as Electron.BrowserWindow,
      () => liveWin as unknown as Electron.BrowserWindow
    ])

    mockAutoUpdater._emit('checking-for-update')

    expect(destroyedWin.webContents.send).not.toHaveBeenCalled()
    expect(liveWin.webContents.send).toHaveBeenCalled()
  })

  it('skips null windows when sending', () => {
    const liveWin = makeMockWindow(false)

    new AutoUpdaterManager([() => null, () => liveWin as unknown as Electron.BrowserWindow])

    mockAutoUpdater._emit('checking-for-update')

    expect(liveWin.webContents.send).toHaveBeenCalled()
  })

  it('checkForUpdates calls autoUpdater in production', () => {
    const manager = new AutoUpdaterManager([])
    manager.checkForUpdates()
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled()
  })

  it('checkForUpdates is no-op in dev', () => {
    mockIsDev.value = true
    vi.clearAllMocks()
    const manager = new AutoUpdaterManager([])
    manager.checkForUpdates()
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('downloadUpdate calls autoUpdater in production', () => {
    const manager = new AutoUpdaterManager([])
    manager.downloadUpdate()
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled()
  })

  it('downloadUpdate is no-op in dev', () => {
    mockIsDev.value = true
    vi.clearAllMocks()
    const manager = new AutoUpdaterManager([])
    manager.downloadUpdate()
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('quitAndInstall calls autoUpdater', () => {
    const manager = new AutoUpdaterManager([])
    manager.quitAndInstall()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
  })

  it('startAutoCheck sets up interval and initial delayed check', () => {
    const manager = new AutoUpdaterManager([])
    manager.startAutoCheck(60_000)

    // Initial check after 10s delay
    vi.advanceTimersByTime(10_000)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

    // Interval check at 70s (10s + 60s)
    vi.advanceTimersByTime(60_000)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('startAutoCheck is no-op in dev', () => {
    mockIsDev.value = true
    vi.clearAllMocks()
    const manager = new AutoUpdaterManager([])
    manager.startAutoCheck(1000)

    vi.advanceTimersByTime(100_000)
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('stopAutoCheck clears the interval', () => {
    const manager = new AutoUpdaterManager([])
    manager.startAutoCheck(60_000)

    vi.advanceTimersByTime(10_000)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

    manager.stopAutoCheck()

    vi.advanceTimersByTime(120_000)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })
})
