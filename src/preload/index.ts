import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  InstanceUpdate,
  SessionHistoryEntry,
  UpdaterStatusPayload,
  UsageStats,
  PromoStatus,
  RateLimits
} from '../renderer/lib/types'

const api = {
  getInstances: (): Promise<InstanceUpdate> => ipcRenderer.invoke('instances:get'),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),

  setSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', settings),

  getHistory: (): Promise<SessionHistoryEntry[]> => ipcRenderer.invoke('history:get'),

  clearHistory: (): Promise<{ success: boolean }> => ipcRenderer.invoke('history:clear'),

  openDashboard: (): Promise<{ success: boolean }> => ipcRenderer.invoke('app:open-dashboard'),

  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),

  openTerminal: (path: string, terminalType?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('terminal:open', path, terminalType),

  checkNotificationPermission: (): Promise<{ supported: boolean }> =>
    ipcRenderer.invoke('notifications:check-permission'),

  openNotificationSettings: (): Promise<void> => ipcRenderer.invoke('notifications:open-settings'),

  sendTestNotification: (): Promise<{ sent: boolean; reason?: string }> =>
    ipcRenderer.invoke('notifications:send-test'),

  muteProject: (projectPath: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('notifications:mute-project', projectPath),

  unmuteProject: (projectPath: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('notifications:unmute-project', projectPath),

  onInstancesUpdate: (callback: (data: InstanceUpdate) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: InstanceUpdate): void =>
      callback(data)
    ipcRenderer.on('instances:update', handler)
    return () => {
      ipcRenderer.removeListener('instances:update', handler)
    }
  },

  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check'),

  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),

  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),

  onUpdaterStatus: (callback: (payload: UpdaterStatusPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: UpdaterStatusPayload): void =>
      callback(payload)
    ipcRenderer.on('updater:status', handler)
    return () => {
      ipcRenderer.removeListener('updater:status', handler)
    }
  },

  getUsage: (): Promise<UsageStats | null> => ipcRenderer.invoke('usage:get'),

  refreshUsage: (): Promise<UsageStats | null> => ipcRenderer.invoke('usage:refresh'),

  onUsageUpdate: (callback: (data: UsageStats) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: UsageStats): void => callback(data)
    ipcRenderer.on('usage:update', handler)
    return () => {
      ipcRenderer.removeListener('usage:update', handler)
    }
  },

  getPromoStatus: (): Promise<PromoStatus | null> => ipcRenderer.invoke('promo:get'),

  onPromoUpdate: (callback: (data: PromoStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PromoStatus): void => callback(data)
    ipcRenderer.on('promo:update', handler)
    return () => {
      ipcRenderer.removeListener('promo:update', handler)
    }
  },

  getRateLimits: (): Promise<RateLimits | null> => ipcRenderer.invoke('ratelimits:get'),

  onRateLimitsUpdate: (callback: (data: RateLimits) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: RateLimits): void => callback(data)
    ipcRenderer.on('ratelimits:update', handler)
    return () => {
      ipcRenderer.removeListener('ratelimits:update', handler)
    }
  },

  isStatuslineConfigured: (): Promise<boolean> =>
    ipcRenderer.invoke('ratelimits:statusline-status'),

  setupRateLimitSync: (): Promise<boolean> => ipcRenderer.invoke('ratelimits:setup-statusline'),

  // Popover pin controls
  setPopoverPinned: (pinned: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('popover:set-pinned', pinned),

  getPopoverPinned: (): Promise<boolean> => ipcRenderer.invoke('popover:get-pinned'),

  closePopover: (): Promise<{ success: boolean }> => ipcRenderer.invoke('popover:close'),

  onPopoverPinChanged: (callback: (pinned: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, pinned: boolean): void => callback(pinned)
    ipcRenderer.on('popover:pin-changed', handler)
    return () => {
      ipcRenderer.removeListener('popover:pin-changed', handler)
    }
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
