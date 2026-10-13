import { createAppWindow } from './window-factory'
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
import { RateLimitReader } from './rate-limit-reader'
import {
  forwardAccountsToDashboard,
  forwardUpdatesToRenderer,
  setupIpcHandlers
} from './ipc-handlers'
import { createWidgetStatsWriter } from './widget-stats-writer'
import { SoundPlayer } from './sound-player'
import { setupWidgetSync } from './widget-sync'
import { setupOffice } from './office-setup'
import { paceBridgeByWindows } from './bridge-pace'
import { opensOfficeOnStart } from './office-window'
import { createAccountLedger } from './accounts'
import { dashboardChrome } from './window-chrome'
import { closePowerShellHost, runInteractivePowerShell } from '../shared/powershell-host'

// Prevent "write EIO" crashes when stdout/stderr pipe is broken
// (e.g., launching terminal closed, or running packaged without a TTY)
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EIO' || err.code === 'EPIPE') return
    throw err
  })
}

let mainWindow: BrowserWindow | null = null
let trayManager: TrayManager | null = null
let tracker: SessionTracker | null = null

function createWindow(store: SettingsStore): BrowserWindow {
  const win = createAppWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    show: false,
    ...dashboardChrome(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  })

  // Hide instead of close (tray app behavior)
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      win.hide()
      app.dock?.hide()
    }
  })

  // Hide to tray instead of minimizing to dock (when enabled)
  win.on('minimize', () => {
    const settings = store.getSettings()
    if (settings.minimizeToTray) {
      // Defer hide to next tick so Electron finishes processing the event
      process.nextTick(() => {
        if (!win.isDestroyed()) {
          win.hide()
          app.dock?.hide()
          trayManager?.show()
        }
      })
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
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    app.dock?.show()
    mainWindow.show()
    mainWindow.focus()
  }
}

// Windows attributes toasts to this id; without it a packaged app's notifications never show.
if (process.platform === 'win32') app.setAppUserModelId('com.zkidzdev.claudewatch')

// One copy only: a login item plus a manual start would otherwise run two Offices and two
// bridges. Development runs are left alone so they can sit beside the installed app.
const isOnlyInstance = !app.isPackaged || app.requestSingleInstanceLock()
if (!isOnlyInstance) app.quit()
app.on('second-instance', () => showDashboard())

app.whenReady().then(() => {
  if (!isOnlyInstance) return
  // Initialize store and settings
  const store = new SettingsStore()
  const settings = store.getSettings()

  // Sync launch-at-login with OS
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })

  // Initialize terminal resolver and process monitor
  const terminalResolver = new TerminalResolver(process.platform, runInteractivePowerShell)
  const monitor = new ProcessMonitor({
    terminalResolver,
    cpuIdleThreshold: settings.cpuIdleThreshold
  })
  tracker = new SessionTracker(monitor, {
    maxHistoryEntries: settings.maxHistoryEntries,
    staleThresholdMinutes: settings.staleThresholdMinutes,
    cooldownSeconds: settings.notifications.cooldownSeconds
  })

  const accounts = createAccountLedger({
    isWatching: settings.watchAccounts,
    home: app.getPath('home'),
    userData: app.getPath('userData')
  })
  const office = setupOffice(terminalResolver, store, tracker, accounts)
  // Before any window exists, so each one is watched from its creation.
  paceBridgeByWindows(app, () => BrowserWindow.getAllWindows(), office.setPollInterval)
  const focusSession = (pid: number): void => void office.focusSession(pid)

  // Initialize notifications and sound player
  const notifications = new NotificationManager(() => store.getSettings(), focusSession)
  const soundPlayer = new SoundPlayer()

  // Create window (hidden by default)
  mainWindow = createWindow(store)

  // Initialize auto-updater
  const updater = new AutoUpdaterManager([
    () => mainWindow,
    () => trayManager?.getPopoverWindow() ?? null
  ])

  // Create tray with popover support
  trayManager = new TrayManager({
    onOpenDashboard: showDashboard,
    onOpenOffice: office.open,
    onFocusSession: focusSession,
    onQuit: () => {
      app.isQuitting = true
      app.quit()
    },
    onCheckForUpdates: () => updater.checkForUpdates(),
    preloadPath: join(__dirname, '../preload/index.js'),
    store
  })

  // Initialize usage stats reader and promo checker
  const windowGetters: (() => Electron.BrowserWindow | null)[] = [
    () => mainWindow,
    () => trayManager?.getPopoverWindow() ?? null
  ]
  const usageReader = new UsageStatsReader(windowGetters)
  usageReader.setWeeklyTokenTarget(settings.weeklyTokenTarget)
  const promoChecker = new PromoChecker(windowGetters)
  const rateLimitReader = new RateLimitReader(windowGetters)

  // Setup IPC bridge
  setupIpcHandlers({
    tracker,
    store,
    updater,
    usageReader,
    promoChecker,
    rateLimitReader,
    notifications,
    onOpenDashboard: showDashboard,
    onOpenOffice: office.open,
    focusSession: office.focusSession,
    getOfficeSnapshot: office.snapshot,
    getTrayManager: () => trayManager,
    accounts
  })
  forwardAccountsToDashboard(accounts, () => mainWindow)

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
    setupWidgetSync({ tracker, usageReader, promoChecker, rateLimitReader, writer: widgetWriter })
  }

  // Wire notification events
  tracker.on('instance-status-changed', ({ instance, previousStatus }) => {
    console.log(
      `[notifications] instance-status-changed: pid=${instance.pid} ${previousStatus} → ${instance.status}`
    )
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
    console.log(`[notifications] instance-exited: pid=${entry.pid} project=${entry.projectName}`)
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

  // Start rate limit polling (every 15s)
  rateLimitReader.startPolling(15_000)

  // Start polling
  tracker.start(settings.pollingIntervalMs)

  // Start auto-update checks (every 4 hours, first check after 10s)
  updater.startAutoCheck()

  // Last, and contained: a failing Office must not cost the tray, where it can be switched off.
  // The bridge starts with the app: the dashboard shows its data with the Office closed.
  try {
    // Before the bridge: the ledger must know who is signed in when the first counts arrive.
    accounts.start()
    office.start()
    if (opensOfficeOnStart(settings, process.argv)) office.open({ isAtStartup: true })
  } catch (error) {
    console.error('Office failed to start:', error)
  }
  app.on('before-quit', () => {
    office.stop()
    accounts.stop()
  })
})

// Clean up tray before quitting to prevent "Object has been destroyed" errors
app.on('before-quit', () => {
  // Without this the hidden dashboard vetoes its own close and Cmd+Q leaves a process with
  // no tray and no window.
  app.isQuitting = true
  trayManager?.destroy()
  closePowerShellHost()
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

// Graceful exit when parent dev server is killed
process.on('SIGTERM', () => {
  app.isQuitting = true
  app.quit()
})
process.on('SIGINT', () => {
  app.isQuitting = true
  app.quit()
})

// Extend app type for isQuitting flag; Electron's `App` lives in the global namespace.
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean
    }
  }
}
