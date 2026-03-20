import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { UpdateStatus } from '../renderer/lib/types'

export class AutoUpdaterManager {
  private getWindows: (() => BrowserWindow | null)[]
  private checkInterval: NodeJS.Timeout | null = null

  constructor(getWindows: (() => BrowserWindow | null)[]) {
    this.getWindows = getWindows

    if (is.dev) return

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      this.send('checking')
    })

    autoUpdater.on('update-available', (info) => {
      // releaseNotes can be a string or an array of { version, note } objects
      let notes: string | undefined
      if (typeof info.releaseNotes === 'string') {
        notes = info.releaseNotes
      } else if (Array.isArray(info.releaseNotes)) {
        notes = info.releaseNotes.map((n) => n.note).join('\n\n')
      }
      this.send('available', {
        version: info.version,
        releaseNotes: notes
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.send('not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
      this.send('downloading', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      })
    })

    autoUpdater.on('update-downloaded', () => {
      this.send('downloaded')
    })

    autoUpdater.on('error', (err) => {
      this.send('error', err.message)
    })
  }

  checkForUpdates(): void {
    if (!is.dev) autoUpdater.checkForUpdates()
  }

  downloadUpdate(): void {
    if (!is.dev) autoUpdater.downloadUpdate()
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }

  startAutoCheck(intervalMs = 4 * 60 * 60 * 1000): void {
    if (is.dev) return
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
