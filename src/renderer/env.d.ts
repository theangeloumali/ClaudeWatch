interface ElectronAPI {
  getInstances: () => Promise<import('./lib/types').InstanceUpdate>
  getSettings: () => Promise<import('./lib/types').AppSettings>
  setSettings: (
    settings: Partial<import('./lib/types').AppSettings>
  ) => Promise<import('./lib/types').AppSettings>
  getHistory: () => Promise<import('./lib/types').SessionHistoryEntry[]>
  clearHistory: () => Promise<void>
  openDashboard: () => Promise<void>
  quit: () => Promise<void>
  openTerminal: (path: string) => Promise<{ success: boolean }>
  onInstancesUpdate: (callback: (data: import('./lib/types').InstanceUpdate) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
