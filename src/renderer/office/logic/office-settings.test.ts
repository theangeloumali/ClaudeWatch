import { describe, expect, it, vi } from 'vitest'
import {
  createOfficeSettingsStore,
  DEFAULT_OFFICE_SETTINGS,
  OFFICE_SETTINGS_STORAGE_KEY,
  parseOfficeSettings
} from './office-settings'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value)
  }
}

const ALL_OFF = {
  town: false,
  citizens: false,
  vehicles: false,
  ambient: false,
  loungeTrips: false,
  player: false,
  hideNames: true,
  townSize: 'village'
}

describe('parseOfficeSettings', () => {
  it('starts with every feature on, and the town a city', () => {
    expect(DEFAULT_OFFICE_SETTINGS).toEqual({
      town: true,
      citizens: true,
      vehicles: true,
      ambient: true,
      loungeTrips: true,
      player: true,
      hideNames: false,
      townSize: 'city'
    })
    expect(parseOfficeSettings(null)).toEqual(DEFAULT_OFFICE_SETTINGS)
  })

  it('reads a complete stored choice', () => {
    expect(parseOfficeSettings(JSON.stringify(ALL_OFF))).toEqual(ALL_OFF)
  })

  it('fills the keys a stored choice lacks from the defaults', () => {
    expect(parseOfficeSettings(JSON.stringify({ citizens: false }))).toEqual({
      ...DEFAULT_OFFICE_SETTINGS,
      citizens: false
    })
  })

  it('drops unknown keys and falls back per key on a value that is not a boolean', () => {
    const stored = { town: 'no', citizens: 0, player: false, weather: false, vehicles: null }
    expect(parseOfficeSettings(JSON.stringify(stored))).toEqual({
      ...DEFAULT_OFFICE_SETTINGS,
      player: false
    })
  })

  it('reads a stored town size', () => {
    expect(parseOfficeSettings(JSON.stringify({ townSize: 'city' })).townSize).toBe('city')
  })

  it.each([['metropolis'], [true], [3], [null], ['Village']])(
    'keeps the default city for a stored size of %j',
    (townSize) => {
      expect(parseOfficeSettings(JSON.stringify({ townSize, player: false }))).toEqual({
        ...DEFAULT_OFFICE_SETTINGS,
        player: false
      })
    }
  )

  it.each(['', 'not json', '[]', 'null', '7', '"town"', '[false]'])(
    'gives the defaults for %j',
    (raw) => {
      expect(parseOfficeSettings(raw)).toEqual(DEFAULT_OFFICE_SETTINGS)
    }
  )
})

describe('createOfficeSettingsStore', () => {
  const saved = (storage: ReturnType<typeof memoryStorage>): unknown =>
    JSON.parse(storage.values.get(OFFICE_SETTINGS_STORAGE_KEY) ?? 'null')

  it('keeps its choices under the settings key', () => {
    expect(OFFICE_SETTINGS_STORAGE_KEY).toBe('claudewatch.office.settings')
  })

  it('saves a choice, tells its listeners and reads it back after a restart', () => {
    const storage = memoryStorage()
    const store = createOfficeSettingsStore(storage)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set('citizens', false)
    expect(store.get()).toEqual({ ...DEFAULT_OFFICE_SETTINGS, citizens: false })
    expect(listener).toHaveBeenCalledOnce()
    expect(saved(storage)).toEqual({ ...DEFAULT_OFFICE_SETTINGS, citizens: false })
    expect(createOfficeSettingsStore(storage).get()).toEqual(store.get())
  })

  it('keeps names hidden across a restart, off until the owner turns it on', () => {
    const storage = memoryStorage()
    const store = createOfficeSettingsStore(storage)
    expect(store.get().hideNames).toBe(false)
    store.set('hideNames', true)
    expect(createOfficeSettingsStore(storage).get().hideNames).toBe(true)
  })

  it('hands back the same object while nothing changed', () => {
    const store = createOfficeSettingsStore(memoryStorage())
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.get()
    store.set('town', true)
    expect(store.get()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores a write of the wrong shape', () => {
    const storage = memoryStorage()
    const store = createOfficeSettingsStore(storage)
    Reflect.apply(store.set, store, ['weather', false])
    Reflect.apply(store.set, store, ['town', 'off'])
    expect(store.get()).toEqual(DEFAULT_OFFICE_SETTINGS)
    expect(storage.values.has(OFFICE_SETTINGS_STORAGE_KEY)).toBe(false)
  })

  it('restores the defaults', () => {
    const storage = memoryStorage({ [OFFICE_SETTINGS_STORAGE_KEY]: JSON.stringify(ALL_OFF) })
    const store = createOfficeSettingsStore(storage)
    expect(store.get()).toEqual(ALL_OFF)
    store.reset()
    expect(store.get()).toEqual(DEFAULT_OFFICE_SETTINGS)
    expect(saved(storage)).toEqual(DEFAULT_OFFICE_SETTINGS)
  })

  it('ignores a stored value of the wrong shape', () => {
    const storage = memoryStorage({ [OFFICE_SETTINGS_STORAGE_KEY]: '{"town":"gone"' })
    expect(createOfficeSettingsStore(storage).get()).toEqual(DEFAULT_OFFICE_SETTINGS)
  })

  it('follows another page of the same origin through the storage event', () => {
    const storage = memoryStorage()
    const events = new EventTarget()
    const pageA = createOfficeSettingsStore(storage, events)
    const pageB = createOfficeSettingsStore(storage, events)
    const listener = vi.fn()
    const unsubscribe = pageB.subscribe(listener)

    pageA.set('ambient', false)
    events.dispatchEvent(new StorageEvent('storage', { key: OFFICE_SETTINGS_STORAGE_KEY }))
    expect(pageB.get().ambient).toBe(false)
    expect(listener).toHaveBeenCalledOnce()

    // Another key is somebody else's news.
    pageA.set('ambient', true)
    events.dispatchEvent(new StorageEvent('storage', { key: 'claudewatch.office.theme' }))
    expect(pageB.get().ambient).toBe(false)

    unsubscribe()
    events.dispatchEvent(new StorageEvent('storage', { key: OFFICE_SETTINGS_STORAGE_KEY }))
    expect(pageB.get().ambient).toBe(false)
  })

  it('keeps one page from undoing what another saved', () => {
    const storage = memoryStorage()
    const pageA = createOfficeSettingsStore(storage)
    const pageB = createOfficeSettingsStore(storage)
    pageA.set('town', false)
    pageB.set('player', false)
    expect(saved(storage)).toEqual({ ...DEFAULT_OFFICE_SETTINGS, town: false, player: false })
  })

  it('still applies a choice when storage throws on read and on write', () => {
    const refuse = (): never => {
      throw new Error('site data is blocked')
    }
    const store = createOfficeSettingsStore({ getItem: refuse, setItem: refuse })
    expect(store.get()).toEqual(DEFAULT_OFFICE_SETTINGS)
    store.set('town', false)
    expect(store.get().town).toBe(false)
  })

  it('saves a town size and ignores one that is not a size', () => {
    const storage = memoryStorage()
    const store = createOfficeSettingsStore(storage)
    const listener = vi.fn()
    store.subscribe(listener)
    store.setTownSize('town')
    expect(store.get().townSize).toBe('town')
    expect(saved(storage)).toEqual({ ...DEFAULT_OFFICE_SETTINGS, townSize: 'town' })
    Reflect.apply(store.setTownSize, store, ['metropolis'])
    store.setTownSize('town')
    expect(store.get().townSize).toBe('town')
    expect(listener).toHaveBeenCalledOnce()
    store.reset()
    expect(store.get().townSize).toBe('city')
  })

  it('runs without storage', () => {
    const store = createOfficeSettingsStore(null)
    store.set('player', false)
    expect(store.get().player).toBe(false)
  })
})
