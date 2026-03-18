import type { AppSettings, InstanceUpdate, SessionHistoryEntry } from '../renderer/lib/types'

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
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
