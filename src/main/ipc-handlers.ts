import { ipcMain, BrowserWindow, app } from 'electron'
import { execFile } from 'child_process'
import type { SessionTracker } from './session-tracker'
import type { SettingsStore } from './store'
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

  return validated
}

interface IpcHandlerOptions {
  tracker: SessionTracker
  store: SettingsStore
  onOpenDashboard: () => void
}

export function setupIpcHandlers(options: IpcHandlerOptions): void {
  const { tracker, store, onOpenDashboard } = options

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
      return store.getSettings()
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

  ipcMain.handle('terminal:open', (_event: Electron.IpcMainInvokeEvent, _projectPath: string) => {
    // Just activate Warp without creating a new tab.
    // Warp doesn't expose tab-level control via AppleScript,
    // so we bring it to front and let the user pick their tab.
    return new Promise<{ success: boolean }>((resolve) => {
      execFile('open', ['-a', 'Warp'], (error) => {
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
