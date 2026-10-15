import { useSyncExternalStore } from 'react'
import { isJsonObject } from '../../../shared/json-object'
import { browserStorage } from '../../office-live/browser-storage'
import { TOWN_SIZES, type TownSize } from '../town/town-grid'

// Each feature of the living world the owner can switch off. Local to this page's origin.
interface OfficeSwitches {
  town: boolean
  citizens: boolean
  vehicles: boolean
  ambient: boolean
  loungeTrips: boolean
  player: boolean
}

export interface OfficeSettings extends OfficeSwitches {
  townSize: TownSize
}

export type OfficeSettingKey = keyof OfficeSwitches

export const DEFAULT_OFFICE_SETTINGS: OfficeSettings = {
  town: true,
  citizens: true,
  vehicles: true,
  ambient: true,
  loungeTrips: true,
  player: true,
  townSize: 'city'
}

export const OFFICE_SETTINGS_STORAGE_KEY = 'claudewatch.office.settings'

const SETTING_KEYS: readonly OfficeSettingKey[] = [
  'town',
  'citizens',
  'vehicles',
  'ambient',
  'loungeTrips',
  'player'
]

const isSettingKey = (key: string): key is OfficeSettingKey =>
  SETTING_KEYS.some((known) => known === key)

const isTownSize = (value: unknown): value is TownSize => TOWN_SIZES.some((size) => size === value)

// Checked by the shape of the defaults: a key that is not one of them is dropped, and a value
// not of its default's kind (a boolean, or one of the sizes) leaves that key on its default.
export function parseOfficeSettings(raw: string | null): OfficeSettings {
  if (raw === null) return DEFAULT_OFFICE_SETTINGS
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return DEFAULT_OFFICE_SETTINGS
  }
  if (!isJsonObject(stored)) return DEFAULT_OFFICE_SETTINGS
  const settings = { ...DEFAULT_OFFICE_SETTINGS }
  for (const key of SETTING_KEYS) {
    const value = stored[key]
    if (typeof value === 'boolean') settings[key] = value
  }
  if (isTownSize(stored.townSize)) settings.townSize = stored.townSize
  return settings
}

export interface OfficeSettingsStore {
  get(): OfficeSettings
  set(key: OfficeSettingKey, value: boolean): void
  setTownSize(size: TownSize): void
  reset(): void
  subscribe(listener: () => void): () => void
}

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>
// The window's `storage` event: another page on this origin saved its settings.
type StorageEvents = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

const isSame = (a: OfficeSettings, b: OfficeSettings): boolean =>
  a.townSize === b.townSize && SETTING_KEYS.every((key) => a[key] === b[key])

export function createOfficeSettingsStore(
  storage: SettingsStorage | null,
  storageEvents: StorageEvents | null = null
): OfficeSettingsStore {
  const listeners = new Set<() => void>()
  let settings = DEFAULT_OFFICE_SETTINGS
  // Once a write fails nothing here reaches storage, so storage stops being the newer copy.
  let canPersist = storage !== null

  const adopt = (next: OfficeSettings): void => {
    if (isSame(next, settings)) return
    settings = next
    for (const listener of listeners) listener()
  }
  // Another Office page may have saved since this one last looked.
  const latest = (): OfficeSettings => {
    if (!canPersist) return settings
    try {
      return parseOfficeSettings(storage?.getItem(OFFICE_SETTINGS_STORAGE_KEY) ?? null)
    } catch {
      return settings
    }
  }
  settings = latest()

  const commit = (next: OfficeSettings): void => {
    try {
      storage?.setItem(OFFICE_SETTINGS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The choice still applies for this session when it cannot be saved.
      canPersist = false
    }
    adopt(next)
  }
  // `key` is null when the other page cleared all of its storage.
  const onStorage = (event: Event): void => {
    if (!(event instanceof StorageEvent)) return
    if (event.key === OFFICE_SETTINGS_STORAGE_KEY || event.key === null) adopt(latest())
  }

  return {
    get: () => settings,
    set: (key, value) => {
      if (!isSettingKey(key) || typeof value !== 'boolean') return
      const current = latest()
      if (current[key] === value) return adopt(current)
      commit({ ...current, [key]: value })
    },
    setTownSize: (size) => {
      if (!isTownSize(size)) return
      const current = latest()
      if (current.townSize === size) return adopt(current)
      commit({ ...current, townSize: size })
    },
    reset: () => commit(DEFAULT_OFFICE_SETTINGS),
    subscribe: (listener) => {
      if (listeners.size === 0) storageEvents?.addEventListener('storage', onStorage)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) storageEvents?.removeEventListener('storage', onStorage)
      }
    }
  }
}

export const officeSettings = createOfficeSettingsStore(browserStorage(), window)

export function useOfficeSettings(): OfficeSettings {
  return useSyncExternalStore(officeSettings.subscribe, officeSettings.get)
}
