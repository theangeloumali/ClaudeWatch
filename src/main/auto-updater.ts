import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { UpdateStatus } from '../renderer/lib/types'
import type { AppUpdater } from 'electron-updater'

export class AutoUpdaterManager {
  private getWindows: (() => BrowserWindow | null)[]
  private checkInterval: NodeJS.Timeout | null = null
  private updater: AppUpdater | null = null

  constructor(getWindows: (() => BrowserWindow | null)[]) {
    this.getWindows = getWindows

    // Linux AppImage updater requires latest-linux.yml in the GitHub release.
    // Until that is published, the AppImageUpdater constructor itself throws an
    // unhandled rejection that crashes the process before the tray is created.
    if (is.dev || process.platform === 'linux') return

    // Lazy import to avoid creating AppImageUpdater on Linux at module load time.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
      this.updater = autoUpdater
    } catch {
      return
    }

    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true

    this.updater.on('checking-for-update', () => {
      this.send('checking')
    })

    this.updater.on('update-available', (info) => {
      this.send('available', {
        version: info.version,
        releaseNotes: info.releaseNotes
      })
    })

    this.updater.on('update-not-available', () => {
      this.send('not-available')
    })

    this.updater.on('download-progress', (progress) => {
      this.send('downloading', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      })
    })

    this.updater.on('update-downloaded', () => {
      this.send('downloaded')
    })

    this.updater.on('error', (err) => {
      this.send('error', err.message)
    })
  }

  checkForUpdates(): void {
    if (is.dev || process.platform === 'linux') return
    this.updater?.checkForUpdates().catch(() => {})
  }

  downloadUpdate(): void {
    if (is.dev || process.platform === 'linux') return
    this.updater?.downloadUpdate().catch(() => {})
  }

  quitAndInstall(): void {
    this.updater?.quitAndInstall()
  }

  startAutoCheck(intervalMs = 4 * 60 * 60 * 1000): void {
    if (is.dev || process.platform === 'linux') return
    setTimeout(() => this.checkForUpdates(), 10_000)
    this.checkInterval = setInterval(() => this.checkForUpdates(), intervalMs)
  }

  stopAutoCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  private send(status: UpdateStatus, data?: unknown): void {
    for (const getWin of this.getWindows) {
      const win = getWin()
      if (win && !win.isDestroyed()) {
        win.webContents.send('updater:status', { status, data })
      }
    }
  }
}
