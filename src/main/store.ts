import ElectronStore from 'electron-store'
import type { AppSettings, SessionHistoryEntry } from '../renderer/lib/types'
import { DEFAULT_SETTINGS } from '../renderer/lib/types'

// electron-store v10 uses ESM default export; handle both CJS and ESM resolution
const Store =
  typeof (ElectronStore as unknown as { default?: typeof ElectronStore }).default === 'function'
    ? (ElectronStore as unknown as { default: typeof ElectronStore }).default
    : ElectronStore

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
    return this.store.get('settings', DEFAULT_SETTINGS) as AppSettings
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
