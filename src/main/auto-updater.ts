import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdaterStatusPayload } from '../renderer/lib/types'

const MISSING_WINDOWS_FEED =
  'The latest release has no Windows update feed. Check GitHub Releases for a newer Windows build.'

export class AutoUpdaterManager {
  private getWindows: (() => BrowserWindow | null)[]
  private checkInterval: NodeJS.Timeout | null = null
  // Signed local bundles do not carry a published update feed.
  private readonly hasUpdateConfiguration = existsSync(
    join(process.resourcesPath ?? '', 'app-update.yml')
  )

  constructor(
    getWindows: (() => BrowserWindow | null)[],
    private readonly platform: NodeJS.Platform = process.platform
  ) {
    this.getWindows = getWindows

    if (is.dev || !this.hasUpdateConfiguration) return

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
      this.send({
        status: 'error',
        data: this.isMissingWindowsRelease(err) ? MISSING_WINDOWS_FEED : err.message
      })
    })
  }

  // A Mac-only latest release hides newer Windows builds, so "up to date" would be false (health-7).
  private isMissingWindowsRelease(err: Error & { code?: string }): boolean {
    return this.platform === 'win32' && err.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
  }

  // A failure also arrives as the 'error' event, which is what the windows are told; the
  // returned promise is settled here so it is not an unhandled rejection as well.
  checkForUpdates(): void {
    if (is.dev) return
    if (!this.hasUpdateConfiguration) {
      this.send({
        status: 'error',
        data: 'Updates are unavailable in this local build. Reinstall to update.'
      })
      return
    }
    void Promise.resolve(autoUpdater.checkForUpdates()).catch(() => undefined)
  }

  downloadUpdate(): void {
    if (!is.dev && this.hasUpdateConfiguration)
      void Promise.resolve(autoUpdater.downloadUpdate()).catch(() => undefined)
  }

  quitAndInstall(): void {
    if (!is.dev && this.hasUpdateConfiguration) autoUpdater.quitAndInstall()
  }

  startAutoCheck(intervalMs = 4 * 60 * 60 * 1000): void {
    if (is.dev || !this.hasUpdateConfiguration) return
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
