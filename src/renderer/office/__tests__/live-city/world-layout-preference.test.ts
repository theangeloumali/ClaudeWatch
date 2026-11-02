import { expect, it } from 'vitest'
import {
  readWorldLayoutPreference,
  saveWorldLayoutPreference,
  WORLD_LAYOUT_PREFERENCE_KEY
} from '../../logic/world-layout-preference'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(
    initial === undefined ? [] : [[WORLD_LAYOUT_PREFERENCE_KEY, initial]]
  )
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value)
  }
}

it('restores a saved Campus layout', () => {
  const storage = memoryStorage()
  expect(saveWorldLayoutPreference(storage, 'campus')).toBe(true)
  expect(readWorldLayoutPreference(storage)).toBe('campus')
})

it('falls back to City for missing, unknown or corrupt values', () => {
  expect(WORLD_LAYOUT_PREFERENCE_KEY).toBe('claudewatch.office.world-layout')
  expect(readWorldLayoutPreference(null)).toBe('city')
  expect(readWorldLayoutPreference(memoryStorage())).toBe('city')
  expect(readWorldLayoutPreference(memoryStorage('"moon"'))).toBe('city')
  expect(readWorldLayoutPreference(memoryStorage('{not json'))).toBe('city')
  const throwing = {
    getItem: () => {
      throw new Error('denied')
    }
  }
  expect(readWorldLayoutPreference(throwing)).toBe('city')
})
