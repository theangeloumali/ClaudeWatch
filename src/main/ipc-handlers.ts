import { BrowserWindow, app, shell } from 'electron'
import { join } from 'path'
import { isAbsoluteFolder } from '../shared/platform-process'
import { handleTrusted } from './window-factory'
import { conformSettings } from './settings-shape'
import { openTerminal } from './terminal-opener'
import type { SessionTracker } from './session-tracker'
import type { SettingsStore } from './store'
import type { AutoUpdaterManager } from './auto-updater'
import type { UsageStatsReader } from './usage-stats'
import type { PromoChecker } from './promo-checker'
import type { RateLimitReader } from './rate-limit-reader'
import type { NotificationManager } from './notifications'
import type { AppSettings, TerminalType } from '../renderer/lib/types'
import type { TrayManager } from './tray'
import type { Office } from './office-setup'
import type { AccountLedger } from './accounts'
import type { AccountsState, AliasResult } from '../shared/accounts'

const TERMINAL_TYPES = {
  'terminal-app': true,
  iterm2: true,
  warp: true,
  alacritty: true,
  kitty: true,
  wezterm: true,
  hyper: true,
  ghostty: true,
  vscode: true,
  cursor: true,
  tmux: true,
  screen: true,
  unknown: true
} satisfies Record<TerminalType, boolean>

function isTerminalType(value: unknown): value is TerminalType {
  return typeof value === 'string' && Object.hasOwn(TERMINAL_TYPES, value)
}

interface IpcHandlerOptions {
  tracker: Pick<
    SessionTracker,
    | 'getInstances'
    | 'getStats'
    | 'start'
    | 'setCpuIdleThreshold'
    | 'setMaxHistoryEntries'
    | 'setStaleThreshold'
    | 'setCooldownSeconds'
  >
  store: Pick<SettingsStore, 'getSettings' | 'setSettings' | 'getHistory' | 'clearHistory'>
  updater?: Pick<AutoUpdaterManager, 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>
  usageReader?: Pick<UsageStatsReader, 'getLastData' | 'read' | 'setWeeklyTokenTarget'>
  promoChecker?: Pick<PromoChecker, 'getLastData'>
  rateLimitReader?: Pick<
    RateLimitReader,
    'getLastData' | 'isStatuslineConfigured' | 'setupStatusline'
  >
  notifications?: Pick<NotificationManager, 'isSupported' | 'sendTest'>
  onOpenDashboard: () => void
  onOpenOffice: Office['open']
  focusSession: Office['focusSession']
  getOfficeSnapshot: Office['snapshot']
  getTrayManager?: () => TrayManager | null
  accounts?: Pick<AccountLedger, 'dashboardState' | 'setAlias' | 'setWatching'>
}

const ACCOUNTS_OFF: AccountsState = { status: 'off' }
const ALIAS_REFUSED_OFF: AliasResult = { success: false, reason: 'off' }

// \\host\share, and its //, \\?\ and \\.\ forms: a terminal opened there connects over SMB and
// hands the host the user's NTLM response.
const WINDOWS_UNC_PREFIX = /^[\\/]{2}/

// The renderer names the folder, so a terminal opens only where a session the app tracks runs.
export function isOpenableFolder(
  folder: string,
  sessionFolders: readonly string[],
  platform: NodeJS.Platform = process.platform
): boolean {
  if (!isAbsoluteFolder(folder, platform)) return false
  if (platform === 'win32' && WINDOWS_UNC_PREFIX.test(folder)) return false
  return sessionFolders.includes(folder)
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
    onOpenOffice,
    focusSession,
    getOfficeSnapshot,
    getTrayManager,
    accounts
  } = options

  const handle = (channel: string, listener: Parameters<typeof handleTrusted>[2]): void =>
    handleTrusted('index.html', channel, listener)

  const beginQuit = (): void => {
    app.isQuitting = true
  }

  handle('instances:get', () => {
    return {
      instances: tracker.getInstances(),
      stats: tracker.getStats()
    }
  })

  handle('settings:get', () => store.getSettings())

  handle('settings:set', (_event: Electron.IpcMainInvokeEvent, data: Partial<AppSettings>) => {
    const validated = conformSettings(data)
    store.setSettings(validated)
    const updated = store.getSettings()
    if (validated.weeklyTokenTarget !== undefined && usageReader) {
      usageReader.setWeeklyTokenTarget(updated.weeklyTokenTarget)
    }
    if (validated.launchAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: validated.launchAtLogin })
    }
    if (validated.pollingIntervalMs !== undefined) tracker.start(updated.pollingIntervalMs)
    if (validated.cpuIdleThreshold !== undefined) {
      tracker.setCpuIdleThreshold(updated.cpuIdleThreshold)
    }
    if (validated.maxHistoryEntries !== undefined) {
      tracker.setMaxHistoryEntries(updated.maxHistoryEntries)
    }
    if (validated.staleThresholdMinutes !== undefined) {
      tracker.setStaleThreshold(updated.staleThresholdMinutes)
    }
    if (validated.notifications?.cooldownSeconds !== undefined) {
      tracker.setCooldownSeconds(updated.notifications.cooldownSeconds)
    }
    if (validated.watchAccounts !== undefined) accounts?.setWatching(updated.watchAccounts)
    return updated
  })

  // Emails are in this answer, so it goes to the dashboard page alone, like every handler here.
  handle('accounts:get', () => accounts?.dashboardState() ?? ACCOUNTS_OFF)

  handle(
    'accounts:set-alias',
    (_event: Electron.IpcMainInvokeEvent, key: unknown, alias: unknown) =>
      accounts?.setAlias(key, alias) ?? ALIAS_REFUSED_OFF
  )

  handle('history:get', () => store.getHistory())

  handle('history:clear', () => {
    store.clearHistory()
    return { success: true }
  })

  handle('app:open-dashboard', () => {
    onOpenDashboard()
    return { success: true }
  })

  handle('app:open-office', () => {
    onOpenOffice()
    return { success: true }
  })

  // What the Office shows, for the dashboard and popover; null until the bridge reports.
  handle('office:snapshot', () => getOfficeSnapshot())

  // The pid is the renderer's word only: focusSession acts on tracked processes alone.
  handle('session:focus', (_event: Electron.IpcMainInvokeEvent, pid: unknown) => focusSession(pid))

  handle('app:quit', () => {
    beginQuit()
    app.quit()
  })

  handle('updater:check', () => {
    updater?.checkForUpdates()
  })

  handle('updater:download', () => {
    updater?.downloadUpdate()
  })

  handle('updater:install', () => {
    if (!updater) return

    beginQuit()
    updater.quitAndInstall()
  })

  handle('usage:get', () => usageReader?.getLastData() ?? null)

  handle('usage:refresh', async () => usageReader?.read() ?? null)

  handle('promo:get', () => promoChecker?.getLastData() ?? null)

  handle('ratelimits:get', () => rateLimitReader?.getLastData() ?? null)

  handle(
    'ratelimits:statusline-status',
    async () => rateLimitReader?.isStatuslineConfigured() ?? false
  )

  handle('ratelimits:setup-statusline', async () => {
    if (!rateLimitReader) return false
    // extraResources puts the script at the root of resourcesPath, not under a resources/ folder.
    const scriptSource = app.isPackaged
      ? join(process.resourcesPath, 'claudewatch-statusline.sh')
      : join(app.getAppPath(), 'resources', 'claudewatch-statusline.sh')
    return rateLimitReader.setupStatusline(scriptSource)
  })

  handle('notifications:check-permission', () => ({
    supported: notifications?.isSupported() ?? false
  }))

  handle('notifications:open-settings', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications')
  })

  handle('notifications:send-test', () => {
    if (!notifications) return { sent: false, reason: 'Notification manager not available' }
    return notifications.sendTest()
  })

  handle(
    'notifications:mute-project',
    (_event: Electron.IpcMainInvokeEvent, projectPath: string) => {
      const settings = store.getSettings()
      const { mutedProjects } = settings.notifications
      store.setSettings({
        notifications: {
          ...settings.notifications,
          mutedProjects: mutedProjects.includes(projectPath)
            ? mutedProjects
            : [...mutedProjects, projectPath]
        }
      })
      return { success: true }
    }
  )

  handle(
    'notifications:unmute-project',
    (_event: Electron.IpcMainInvokeEvent, projectPath: string) => {
      const settings = store.getSettings()
      const mutedProjects = settings.notifications.mutedProjects.filter((p) => p !== projectPath)
      store.setSettings({
        notifications: { ...settings.notifications, mutedProjects }
      })
      return { success: true }
    }
  )

  handle(
    'terminal:open',
    (_event: Electron.IpcMainInvokeEvent, projectPath: string, terminalType?: string) => {
      if (terminalType !== undefined && !isTerminalType(terminalType)) return { success: false }
      const sessionFolders = [
        ...tracker.getInstances().map((instance) => instance.projectPath),
        ...(getOfficeSnapshot()?.sessions.map((session) => session.cwd) ?? [])
      ]
      if (typeof projectPath !== 'string' || !isOpenableFolder(projectPath, sessionFolders)) {
        return { success: false }
      }
      return openTerminal(projectPath, terminalType)
    }
  )

  handle('popover:set-pinned', (_event: Electron.IpcMainInvokeEvent, pinned: boolean) => {
    const tray = getTrayManager?.()
    if (!tray) return { success: false }
    tray.setPinned(pinned)
    return { success: true }
  })

  handle('popover:get-pinned', () => {
    const tray = getTrayManager?.()
    return tray?.isPinned() ?? false
  })

  handle('popover:close', () => {
    const tray = getTrayManager?.()
    if (!tray) return { success: false }
    tray.closePopover()
    return { success: true }
  })
}

// The accounts state carries email addresses: it is pushed to the dashboard window and no other.
export function forwardAccountsToDashboard(
  accounts: Pick<AccountLedger, 'onChange'>,
  getDashboard: () => BrowserWindow | null
): void {
  accounts.onChange((state) => {
    const window = getDashboard()
    if (window && !window.isDestroyed()) window.webContents.send('accounts:update', state)
  })
}

export function forwardUpdatesToRenderer(
  tracker: Pick<SessionTracker, 'on'>,
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
