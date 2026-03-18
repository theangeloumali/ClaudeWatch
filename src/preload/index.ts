import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, InstanceUpdate, SessionHistoryEntry } from '../renderer/lib/types'

const api = {
  getInstances: (): Promise<InstanceUpdate> => ipcRenderer.invoke('instances:get'),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),

  setSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', settings),

  getHistory: (): Promise<SessionHistoryEntry[]> => ipcRenderer.invoke('history:get'),

  clearHistory: (): Promise<{ success: boolean }> => ipcRenderer.invoke('history:clear'),

  openDashboard: (): Promise<{ success: boolean }> => ipcRenderer.invoke('app:open-dashboard'),

  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),

  openTerminal: (path: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('terminal:open', path),

  onInstancesUpdate: (callback: (data: InstanceUpdate) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: InstanceUpdate): void =>
      callback(data)
    ipcRenderer.on('instances:update', handler)
    return () => {
      ipcRenderer.removeListener('instances:update', handler)
    }
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
