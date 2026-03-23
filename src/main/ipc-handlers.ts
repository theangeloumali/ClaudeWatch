import { ipcMain, BrowserWindow, app, shell } from 'electron'
import { join } from 'path'
import { openTerminal } from './terminal-opener'
import type { SessionTracker } from './session-tracker'
import type { SettingsStore } from './store'
import type { AutoUpdaterManager } from './auto-updater'
import type { UsageStatsReader } from './usage-stats'
import type { PromoChecker } from './promo-checker'
import type { RateLimitReader } from './rate-limit-reader'
import type { NotificationManager } from './notifications'
import type { AppSettings } from '../renderer/lib/types'
import type { TrayManager } from './tray'

export function validateSettings(data: Partial<AppSettings>): Partial<AppSettings> {
  const validated = { ...data }

  if (validated.pollingIntervalMs !== undefined) {
    validated.pollingIntervalMs = Math.max(500, Math.min(60000, validated.pollingIntervalMs))
  }
  if (validated.cpuIdleThreshold !== undefined) {
    validated.cpuIdleThreshold = Math.max(0.1, Math.min(100, validated.cpuIdleThreshold))
  }
  if (validated.maxHistoryEntries !== undefined) {
    validated.maxHistoryEntries = Math.max(1, Math.min(10000, validated.maxHistoryEntries))
  }
  if (validated.weeklyTokenTarget !== undefined) {
    validated.weeklyTokenTarget = Math.max(
      100_000,
      Math.min(100_000_000, validated.weeklyTokenTarget)
    )
  }
  if (validated.staleThresholdMinutes !== undefined) {
    validated.staleThresholdMinutes = Math.max(5, Math.min(120, validated.staleThresholdMinutes))
  }
  if (validated.notifications?.cooldownSeconds !== undefined) {
    validated.notifications = {
      ...validated.notifications,
      cooldownSeconds: Math.max(10, Math.min(120, validated.notifications.cooldownSeconds))
    }
  }

  return validated
}

interface IpcHandlerOptions {
  tracker: SessionTracker
  store: SettingsStore
  updater?: AutoUpdaterManager
  usageReader?: UsageStatsReader
  promoChecker?: PromoChecker
  rateLimitReader?: RateLimitReader
  notifications?: NotificationManager
  onOpenDashboard: () => void
  getTrayManager?: () => TrayManager | null
}

export function setupIpcHandlers(options: IpcHandlerOptions): void {
  const {
    tracker,
    store,
    updater,
    usageReader,
    promoChecker,
    rateLimitReader,
    notifications,
    onOpenDashboard,
    getTrayManager
  } = options

  const beginQuit = (): void => {
    ;(app as Electron.App & { isQuitting?: boolean }).isQuitting = true
  }

  ipcMain.handle('instances:get', () => {
    return {
      instances: tracker.getInstances(),
      stats: tracker.getStats()
    }
  })

  ipcMain.handle('settings:get', () => {
    return store.getSettings()
  })

  ipcMain.handle(
    'settings:set',
    (_event: Electron.IpcMainInvokeEvent, data: Partial<AppSettings>) => {
      const validated = validateSettings(data)
      store.setSettings(validated)
      const updated = store.getSettings()
      // Propagate weekly token target to usage reader
      if (validated.weeklyTokenTarget !== undefined && usageReader) {
        usageReader.setWeeklyTokenTarget(updated.weeklyTokenTarget)
      }
      // Propagate launch-at-login to OS
      if (validated.launchAtLogin !== undefined) {
        app.setLoginItemSettings({ openAtLogin: validated.launchAtLogin })
      }
      // Propagate stale threshold to session tracker
      if (validated.staleThresholdMinutes !== undefined) {
        tracker.setStaleThreshold(updated.staleThresholdMinutes)
      }
      // Propagate cooldown to session tracker
      if (validated.notifications?.cooldownSeconds !== undefined) {
        tracker.setCooldownSeconds(updated.notifications.cooldownSeconds)
      }
      return updated
    }
  )

  ipcMain.handle('history:get', () => {
    return store.getHistory()
  })

  ipcMain.handle('history:clear', () => {
    store.clearHistory()
    return { success: true }
  })

  ipcMain.handle('app:open-dashboard', () => {
    onOpenDashboard()
    return { success: true }
  })

  ipcMain.handle('app:quit', () => {
    beginQuit()
    app.quit()
  })

  ipcMain.handle('updater:check', () => {
    updater?.checkForUpdates()
  })

  ipcMain.handle('updater:download', () => {
    updater?.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    if (!updater) return

    beginQuit()
    updater.quitAndInstall()
  })

  ipcMain.handle('usage:get', () => {
    return usageReader?.getLastData() ?? null
  })

  ipcMain.handle('usage:refresh', async () => {
    return usageReader?.read() ?? null
  })

  ipcMain.handle('promo:get', () => {
    return promoChecker?.getLastData() ?? null
  })

  ipcMain.handle('ratelimits:get', () => {
    return rateLimitReader?.getLastData() ?? null
  })

  ipcMain.handle('ratelimits:statusline-status', async () => {
    return rateLimitReader?.isStatuslineConfigured() ?? false
  })

  ipcMain.handle('ratelimits:setup-statusline', async () => {
    if (!rateLimitReader) return false
    const scriptSource = join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'resources',
      'claudewatch-statusline.sh'
    )
    return rateLimitReader.setupStatusline(scriptSource)
  })

  ipcMain.handle('notifications:check-permission', () => {
    return { supported: notifications?.isSupported() ?? false }
  })

  ipcMain.handle('notifications:open-settings', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications')
  })

  ipcMain.handle('notifications:send-test', () => {
    if (!notifications) return { sent: false, reason: 'Notification manager not available' }
    return notifications.sendTest()
  })

  ipcMain.handle(
    'notifications:mute-project',
    (_event: Electron.IpcMainInvokeEvent, projectPath: string) => {
      const settings = store.getSettings()
      const mutedProjects = settings.notifications.mutedProjects ?? []
      if (!mutedProjects.includes(projectPath)) {
        mutedProjects.push(projectPath)
      }
      store.setSettings({
        notifications: { ...settings.notifications, mutedProjects }
      })
      return { success: true }
    }
  )

  ipcMain.handle(
    'notifications:unmute-project',
    (_event: Electron.IpcMainInvokeEvent, projectPath: string) => {
      const settings = store.getSettings()
      const mutedProjects = (settings.notifications.mutedProjects ?? []).filter(
        (p) => p !== projectPath
      )
      store.setSettings({
        notifications: { ...settings.notifications, mutedProjects }
      })
      return { success: true }
    }
  )

  ipcMain.handle(
    'terminal:open',
    (_event: Electron.IpcMainInvokeEvent, projectPath: string, terminalType?: string) => {
      if (!projectPath || typeof projectPath !== 'string' || !projectPath.startsWith('/')) {
        return { success: false }
      }
      return openTerminal(
        projectPath,
        terminalType as import('../renderer/lib/types').TerminalType | undefined
      )
    }
  )

  // Popover pin controls
  ipcMain.handle('popover:set-pinned', (_event: Electron.IpcMainInvokeEvent, pinned: boolean) => {
    const tray = getTrayManager?.()
    if (!tray) return { success: false }
    tray.setPinned(pinned)
    return { success: true }
  })

  ipcMain.handle('popover:get-pinned', () => {
    const tray = getTrayManager?.()
    return tray?.isPinned() ?? false
  })

  ipcMain.handle('popover:close', () => {
    const tray = getTrayManager?.()
    if (!tray) return { success: false }
    tray.closePopover()
    return { success: true }
  })
}

export function forwardUpdatesToRenderer(
  tracker: SessionTracker,
  ...getWindows: (() => BrowserWindow | null)[]
): void {
  tracker.on('update', (data) => {
    for (const getWindow of getWindows) {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('instances:update', data)
      }
    }
  })
}
