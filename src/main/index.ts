import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { ProcessMonitor } from './process-monitor'
import { TerminalResolver } from './terminal-resolver'
import { SessionTracker } from './session-tracker'
import { SettingsStore } from './store'
import { TrayManager } from './tray'
import { NotificationManager } from './notifications'
import { AutoUpdaterManager } from './auto-updater'
import { UsageStatsReader } from './usage-stats'
import { PromoChecker } from './promo-checker'
import { setupIpcHandlers, forwardUpdatesToRenderer } from './ipc-handlers'
import { createWidgetStatsWriter } from './widget-stats-writer'
import { SoundPlayer } from './sound-player'
import { setupWidgetSync } from './widget-sync'

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager | null = null
let tracker: SessionTracker | null = null

function createWindow(store: SettingsStore): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    show: false,
    frame: false,
    transparent: true,
    ...(isMac && {
      vibrancy: 'under-window' as const,
      visualEffectState: 'active' as const,
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 15, y: 15 }
    }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Hide instead of close (tray app behavior)
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  // Hide to tray instead of minimizing to dock (when enabled)
  win.on('minimize', (event) => {
    const settings = store.getSettings()
    if (settings.minimizeToTray) {
      event.preventDefault()
      win.hide()
    }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function showDashboard(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
}

app.whenReady().then(() => {
  // Initialize store and settings
  const store = new SettingsStore()
  const settings = store.getSettings()

  // Initialize terminal resolver and process monitor
  const terminalResolver = new TerminalResolver()
  const monitor = new ProcessMonitor({ terminalResolver })
  tracker = new SessionTracker(monitor, {
    maxHistoryEntries: settings.maxHistoryEntries,
    staleThresholdMinutes: settings.staleThresholdMinutes
  })

  // Initialize notifications and sound player
  const notifications = new NotificationManager(() => store.getSettings())
  const soundPlayer = new SoundPlayer()

  // Initialize usage stats reader and promo checker
  const windowGetters: (() => Electron.BrowserWindow | null)[] = [
    () => mainWindow,
    () => trayManager?.getPopoverWindow() ?? null
  ]
  const usageReader = new UsageStatsReader(windowGetters)
  usageReader.setWeeklyTokenTarget(settings.weeklyTokenTarget)
  const promoChecker = new PromoChecker(windowGetters)

  // Initialize auto-updater
  const updater = new AutoUpdaterManager(windowGetters)

  // Setup IPC bridge
  setupIpcHandlers({
    tracker,
    store,
    updater,
    usageReader,
    promoChecker,
    onOpenDashboard: showDashboard
  })

  // Create window (hidden by default)
  mainWindow = createWindow(store)

  // Create tray with popover support
  trayManager = new TrayManager({
    onOpenDashboard: showDashboard,
    onQuit: () => {
      app.isQuitting = true
      app.quit()
    },
    onCheckForUpdates: () => updater.checkForUpdates(),
    preloadPath: join(__dirname, '../preload/index.js')
  })

  // Forward tracker updates to renderer windows (main + popover) and tray
  forwardUpdatesToRenderer(
    tracker,
    () => mainWindow,
    () => trayManager?.getPopoverWindow() ?? null
  )

  // Initialize macOS widget stats writer (writes stats.json to App Group container)
  const widgetWriter = createWidgetStatsWriter()
  if (widgetWriter) {
    widgetWriter.ensureContainer().catch(() => {})
  }

  tracker.on('update', (data) => {
    trayManager?.update(data.instances, data.stats)
  })

  if (widgetWriter) {
    setupWidgetSync({ tracker, usageReader, promoChecker, writer: widgetWriter })
  }

  // Wire notification events
  tracker.on('instance-status-changed', ({ instance, previousStatus }) => {
    if (previousStatus === 'active' && instance.status === 'idle') {
      // Task just finished (active → idle) — fire task complete notification
      notifications.notifyTaskComplete(instance)

      const currentSettings = store.getSettings()
      if (currentSettings.notifications.pingSound && !currentSettings.notifications.doNotDisturb) {
        soundPlayer.playTaskComplete()
      }
    } else if (instance.status === 'idle') {
      // Other transition to idle (not from active) — use regular idle notification
      notifications.notifyIdle(instance)
    }
  })

  tracker.on('instance-exited', (entry) => {
    store.addHistoryEntry(entry)
    notifications.notifyExited(entry)
    terminalResolver.evict(entry.pid)
  })

  // Forward promo updates to tray
  promoChecker.startPolling(60_000)
  setInterval(() => {
    const promo = promoChecker.getLastData()
    if (promo) trayManager?.updatePromoStatus(promo)
  }, 60_000)
  // Initial promo check for tray
  setTimeout(() => {
    const promo = promoChecker.getLastData()
    if (promo) trayManager?.updatePromoStatus(promo)
  }, 1000)

  // Start usage stats polling (every 30s)
  usageReader.startPolling(30_000)

  // Start polling
  tracker.start(settings.pollingIntervalMs)

  // Start auto-update checks (every 4 hours, first check after 10s)
  updater.startAutoCheck()
})

// Clean up tray before quitting to prevent "Object has been destroyed" errors
app.on('before-quit', () => {
  trayManager?.destroy()
  trayManager = null
})

// macOS: keep app running when all windows are closed (tray app)
app.on('window-all-closed', () => {
  // Do nothing -- tray keeps the app alive
})

// macOS: re-show window when dock icon clicked
app.on('activate', () => {
  showDashboard()
})

// Extend app type for isQuitting flag
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}
