import type {
  AppSettings,
  InstanceUpdate,
  SessionHistoryEntry,
  UpdaterStatusPayload,
  UsageStats,
  PromoStatus,
  RateLimits
} from '../renderer/lib/types'

export interface ElectronAPI {
  getInstances: () => Promise<InstanceUpdate>
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  getHistory: () => Promise<SessionHistoryEntry[]>
  clearHistory: () => Promise<{ success: boolean }>
  openDashboard: () => Promise<{ success: boolean }>
  quit: () => Promise<void>
  openTerminal: (path: string) => Promise<{ success: boolean }>
  onInstancesUpdate: (callback: (data: InstanceUpdate) => void) => () => void
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdaterStatus: (callback: (payload: UpdaterStatusPayload) => void) => () => void
  getUsage: () => Promise<UsageStats | null>
  refreshUsage: () => Promise<UsageStats | null>
  onUsageUpdate: (callback: (data: UsageStats) => void) => () => void
  getPromoStatus: () => Promise<PromoStatus | null>
  onPromoUpdate: (callback: (data: PromoStatus) => void) => () => void
  getRateLimits: () => Promise<RateLimits | null>
  onRateLimitsUpdate: (callback: (data: RateLimits) => void) => () => void
  setPopoverPinned: (pinned: boolean) => Promise<{ success: boolean }>
  getPopoverPinned: () => Promise<boolean>
  closePopover: () => Promise<{ success: boolean }>
  onPopoverPinChanged: (callback: (pinned: boolean) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
