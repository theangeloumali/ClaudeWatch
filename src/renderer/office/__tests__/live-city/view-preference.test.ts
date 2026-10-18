import { expect, it } from 'vitest'
import {
  readViewPreference,
  saveViewPreference,
  VIEW_PREFERENCE_KEY
} from '../../logic/view-preference'

it('retains the owners saved city and list preference independently of availability', () => {
  const storage = new Map<string, string>()
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, preference: string) => {
      storage.set(key, preference)
    }
  }
  expect(saveViewPreference(adapter, { viewMode: 'city', isListView: true })).toBe(true)
  expect(readViewPreference(adapter)).toEqual({
    viewMode: 'city',
    isListView: true,
    areRoofsVisible: true
  })
})

it('does not overwrite unknown or corrupt saved bytes while reading', () => {
  const storage = {
    getItem: () => 'future document',
    setItem: () => {
      throw new Error('write during read')
    }
  }
  expect(readViewPreference(storage)).toEqual({
    viewMode: 'city',
    isListView: false,
    areRoofsVisible: true
  })
  expect(VIEW_PREFERENCE_KEY).not.toBe('claudewatch.office.theme')
})

it.each([
  { viewMode: 'office', isListView: true },
  { viewMode: 'office', isListView: true, areRoofsVisible: 'hidden' },
  { viewMode: 'office', isListView: true, areRoofsVisible: false }
])(
  'reads legacy and malformed roof choices without losing the saved view or writing bytes: %j',
  (saved) => {
    const bytes = JSON.stringify(saved)
    const preference = readViewPreference({ getItem: () => bytes })
    expect(preference).toEqual({
      viewMode: 'office',
      isListView: true,
      areRoofsVisible: saved.areRoofsVisible === false ? false : true
    })
    expect(JSON.stringify(saved)).toBe(bytes)
  }
)

it('reports failed persistence instead of claiming a successful save', () => {
  expect(
    saveViewPreference(
      {
        setItem: () => {
          throw new Error('quota')
        }
      },
      { viewMode: 'office', isListView: false }
    )
  ).toBe(false)
})
