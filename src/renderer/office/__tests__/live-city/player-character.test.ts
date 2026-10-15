import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import {
  createPlayerCharacterStore,
  PLAYER_CHARACTERS,
  PLAYER_CHARACTER_STORAGE_KEY
} from '../../player/character-choice'
import {
  playerCharacterGeometry,
  playerCharacterGeometryFactory
} from '../../themes/character-geometry'
import { CYBERPUNK_PALETTE } from '../../themes/cyberpunk-city/palette'
import { characterParts } from '../../themes/cyberpunk-city/character-parts'

function memoryStorage(initial: string | null = null) {
  const values = new Map<string, string>()
  if (initial !== null) values.set(PLAYER_CHARACTER_STORAGE_KEY, initial)
  values.set('claudewatch.office.settings', 'legacy settings')
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  }
}

describe('independent presentation choice', () => {
  it('round-trips every choice using only the new storage key', () => {
    const storage = memoryStorage()
    for (const choice of PLAYER_CHARACTERS) {
      const store = createPlayerCharacterStore(() => storage)
      expect(store.choose(choice.id)).toBe(true)
      expect(createPlayerCharacterStore(() => storage).get()).toBe(choice.id)
    }
    expect(storage.getItem('claudewatch.office.settings')).toBe('legacy settings')
  })

  it.each([
    'null',
    '[]',
    '"samurai"',
    '{',
    '{"version":2,"id":"human"}',
    '{"version":1,"id":"unknown"}',
    '{"version":1,"id":"human","session":"secret"}'
  ])('fails closed for malformed or foreign saved values: %s', (saved) => {
    expect(createPlayerCharacterStore(() => memoryStorage(saved)).get()).toBe('theme')
  })

  it('keeps a session choice usable when storage is denied or full', () => {
    const store = createPlayerCharacterStore(() => ({
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      }
    }))
    expect(store.get()).toBe('theme')
    expect(store.choose('courier')).toBe(true)
    expect(store.get()).toBe('courier')
  })

  it('does not access browser storage when constructed for server rendering', () => {
    let reads = 0
    const store = createPlayerCharacterStore(() => {
      reads++
      return null
    })
    expect(reads).toBe(0)
    expect(store.getServerSnapshot()).toBe('theme')
    expect(reads).toBe(0)
  })

  it('rejects a foreign runtime choice without changing presentation or legacy storage', () => {
    const storage = memoryStorage()
    const store = createPlayerCharacterStore(() => storage)
    expect(Reflect.apply(store.choose, undefined, ['foreign-session-name'])).toBe(false)
    expect(store.get()).toBe('theme')
    expect(storage.getItem(PLAYER_CHARACTER_STORAGE_KEY)).toBeNull()
    expect(storage.getItem('claudewatch.office.settings')).toBe('legacy settings')
  })

  it('notifies only real changes and releases subscriptions', () => {
    const store = createPlayerCharacterStore(() => null)
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications++
    })
    store.choose('human')
    store.choose('human')
    expect(notifications).toBe(1)
    unsubscribe()
    store.choose('guard')
    expect(notifications).toBe(1)
    expect(store.getServerSnapshot()).toBe('theme')
  })
})

describe('original bounded character geometry', () => {
  it('keeps factory identity stable between renders and leaves theme default unoverridden', () => {
    expect(playerCharacterGeometryFactory('theme')).toBeUndefined()
    expect(playerCharacterGeometryFactory('samurai')).toBe(
      playerCharacterGeometryFactory('samurai')
    )
    expect(playerCharacterGeometryFactory('courier')).not.toBe(
      playerCharacterGeometryFactory('samurai')
    )
  })

  it('provides six different silhouettes with the same grounded owner envelope', () => {
    const named = PLAYER_CHARACTERS.filter((choice) => choice.id !== 'theme')
    expect(named).toHaveLength(6)
    const signatures = new Set<string>()
    for (const choice of named) {
      const geometry = playerCharacterGeometry(choice.id, CYBERPUNK_PALETTE)
      geometry.computeBoundingBox()
      expect(geometry.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.001)
      expect(geometry.boundingBox?.max.y).toBeCloseTo(2.46, 2)
      expect(geometry.boundingBox?.max.x).toBeLessThanOrEqual(0.62)
      expect(geometry.boundingBox?.min.x).toBeGreaterThanOrEqual(-0.62)
      expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count)
      expect(geometry.getAttribute('normal').count).toBe(geometry.getAttribute('position').count)
      expect(geometry.getAttribute('position').count / 3).toBeLessThan(5000)
      signatures.add(JSON.stringify(Array.from(geometry.getAttribute('position').array)))
      geometry.dispose()
    }
    expect(signatures.size).toBe(6)
  })

  it('faces forward with boots, facial features and separately articulated limbs', () => {
    const parts = characterParts({ kind: 'human', palette: CYBERPUNK_PALETTE, variant: 0 })
    expect(parts.eyes.every((eye) => eye.at[2] > 0)).toBe(true)
    expect(parts.joints.head.some((part) => part.at[2] > 0.07)).toBe(true)
    expect(parts.joints.leftKnee.some((part) => part.at[2] > 0)).toBe(true)
    expect(parts.joints.leftElbow.length).toBeGreaterThan(0)
    expect(parts.joints.rightHip.length).toBeGreaterThan(0)
  })

  it('uses the supplied world palette instead of pinning owner clothing to cyberpunk', () => {
    const palette = { ...CYBERPUNK_PALETTE, lacquer: '#ff0000' }
    const geometry = playerCharacterGeometry('courier', palette)
    const colors = geometry.getAttribute('color')
    const red = new Color(palette.lacquer)
    expect(
      Array.from(
        { length: colors.count },
        (_, index) =>
          colors.getX(index) === red.r &&
          colors.getY(index) === red.g &&
          colors.getZ(index) === red.b
      ).some(Boolean)
    ).toBe(true)
    geometry.dispose()
  })
})
