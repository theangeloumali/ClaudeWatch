import Store from 'electron-store'
import type { AppSettings, SessionHistoryEntry } from '../renderer/lib/types'
import { DEFAULT_SETTINGS } from '../renderer/lib/types'

export class SettingsStore {
  private store: InstanceType<typeof Store>

  constructor() {
    this.store = new Store({
      name: 'claudewatch',
      defaults: {
        settings: DEFAULT_SETTINGS,
        history: [] as SessionHistoryEntry[]
      }
    })
  }

  getSettings(): AppSettings {
    const stored = this.store.get('settings', DEFAULT_SETTINGS) as AppSettings
    // Ensure new notification fields exist for users upgrading from older versions
    if (stored.notifications.onTaskComplete === undefined) {
      stored.notifications.onTaskComplete = DEFAULT_SETTINGS.notifications.onTaskComplete
    }
    if (stored.notifications.pingSound === undefined) {
      stored.notifications.pingSound = DEFAULT_SETTINGS.notifications.pingSound
    }
    // Ensure minimizeToTray exists for users upgrading from older versions
    if (stored.minimizeToTray === undefined) {
      stored.minimizeToTray = DEFAULT_SETTINGS.minimizeToTray
    }
    // Ensure weeklyTokenTarget exists for users upgrading from older versions
    if (stored.weeklyTokenTarget === undefined) {
      stored.weeklyTokenTarget = DEFAULT_SETTINGS.weeklyTokenTarget
    }
    // Migrate cpuIdleThreshold from old default (1.0) to new default (3.0)
    if (stored.cpuIdleThreshold === 1.0) {
      stored.cpuIdleThreshold = DEFAULT_SETTINGS.cpuIdleThreshold
      this.store.set('settings', stored)
    }
    return stored
  }

  setSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings()
    const merged: AppSettings = { ...current, ...partial }
    this.store.set('settings', merged)
    return merged
  }

  getHistory(): SessionHistoryEntry[] {
    return (this.store.get('history', []) as SessionHistoryEntry[]) ?? []
  }

  addHistoryEntry(entry: SessionHistoryEntry): void {
    const history = this.getHistory()
    history.push(entry)
    const max = this.getSettings().maxHistoryEntries
    const trimmed = history.length > max ? history.slice(-max) : history
    this.store.set('history', trimmed)
  }

  clearHistory(): void {
    this.store.set('history', [])
  }
}
