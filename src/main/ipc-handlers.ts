import { ipcMain, BrowserWindow, app } from 'electron'
import { execFile } from 'child_process'
import type { SessionTracker } from './session-tracker'
import type { SettingsStore } from './store'
import type { AutoUpdaterManager } from './auto-updater'
import type { UsageStatsReader } from './usage-stats'
import type { PromoChecker } from './promo-checker'
import type { AppSettings } from '../renderer/lib/types'

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

  return validated
}

interface IpcHandlerOptions {
  tracker: SessionTracker
  store: SettingsStore
  updater?: AutoUpdaterManager
  usageReader?: UsageStatsReader
  promoChecker?: PromoChecker
  onOpenDashboard: () => void
}

export function setupIpcHandlers(options: IpcHandlerOptions): void {
  const { tracker, store, updater, usageReader, promoChecker, onOpenDashboard } = options

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
      // Propagate stale threshold to session tracker
      if (validated.staleThresholdMinutes !== undefined) {
        tracker.setStaleThreshold(updated.staleThresholdMinutes)
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
    app.quit()
  })

  ipcMain.handle('updater:check', () => {
    updater?.checkForUpdates()
  })

  ipcMain.handle('updater:download', () => {
    updater?.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    updater?.quitAndInstall()
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

  ipcMain.handle('terminal:open', (_event: Electron.IpcMainInvokeEvent, projectPath: string) => {
    // Try to find an existing Warp window/tab whose title contains the project path.
    // If found, focus it. Otherwise, open a new tab and cd to the project directory.
    // Escape backslashes and double quotes for safe AppleScript string embedding.
    const escaped = projectPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

    const script = `
      tell application "Warp"
        activate
      end tell

      delay 0.3

      tell application "System Events"
        tell process "Warp"
          set found to false
          repeat with w in windows
            set winName to name of w
            if winName contains "${escaped}" then
              perform action "AXRaise" of w
              set found to true
              exit repeat
            end if
          end repeat
          if not found then
            -- Open a new tab and cd to the project path
            keystroke "t" using command down
            delay 0.3
            keystroke "cd \\"${escaped}\\"" & return
          end if
        end tell
      end tell
    `

    return new Promise<{ success: boolean }>((resolve) => {
      execFile('osascript', ['-e', script], { timeout: 10_000 }, (error) => {
        resolve({ success: !error })
      })
    })
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
