import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { UpdaterStatusPayload } from '../renderer/lib/types'

export class AutoUpdaterManager {
  private getWindows: (() => BrowserWindow | null)[]
  private checkInterval: NodeJS.Timeout | null = null

  constructor(
    getWindows: (() => BrowserWindow | null)[],
    private readonly platform: NodeJS.Platform = process.platform
  ) {
    this.getWindows = getWindows

    if (is.dev) return

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      this.send({ status: 'checking' })
    })

    autoUpdater.on('update-available', (info) => {
      // releaseNotes can be a string or an array of { version, note } objects
      let notes: string | undefined
      if (typeof info.releaseNotes === 'string') {
        notes = info.releaseNotes
      } else if (Array.isArray(info.releaseNotes)) {
        notes = info.releaseNotes.map((n) => n.note).join('\n\n')
      }
      this.send({ status: 'available', data: { version: info.version, releaseNotes: notes } })
    })

    autoUpdater.on('update-not-available', () => {
      this.send({ status: 'not-available' })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.send({
        status: 'downloading',
        data: {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total
        }
      })
    })

    autoUpdater.on('update-downloaded', () => {
      this.send({ status: 'downloaded' })
    })

    autoUpdater.on('error', (err) => {
      if (this.isMissingWindowsRelease(err)) {
        console.warn(`[updater] no Windows build in the latest release: ${err.message}`)
        this.send({ status: 'not-available' })
        return
      }
      this.send({ status: 'error', data: err.message })
    })
  }

  // Releases published before Windows support carry no latest.yml; that is "no update", not a fault.
  private isMissingWindowsRelease(err: Error & { code?: string }): boolean {
    return this.platform === 'win32' && err.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
  }

  // A failure also arrives as the 'error' event, which is what the windows are told; the
  // returned promise is settled here so it is not an unhandled rejection as well.
  checkForUpdates(): void {
    if (!is.dev) void Promise.resolve(autoUpdater.checkForUpdates()).catch(() => undefined)
  }

  downloadUpdate(): void {
    if (!is.dev) void Promise.resolve(autoUpdater.downloadUpdate()).catch(() => undefined)
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

  private send(payload: UpdaterStatusPayload): void {
    for (const getWin of this.getWindows) {
      const win = getWin()
      if (win && !win.isDestroyed()) {
        win.webContents.send('updater:status', payload)
      }
    }
  }
}
