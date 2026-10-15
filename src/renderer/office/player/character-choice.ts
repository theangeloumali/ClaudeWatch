import { useSyncExternalStore } from 'react'
import { browserStorage } from '../../office-live/browser-storage'

// dry-new: player appearance is independent of world assignments and session identity.
export const PLAYER_CHARACTER_STORAGE_KEY = 'claudewatch.office.player-character.v1'
export const PLAYER_CHARACTERS = [
  { id: 'theme', label: 'Theme default' },
  { id: 'samurai', label: 'Samurai' },
  { id: 'courier', label: 'Courier' },
  { id: 'technician', label: 'Technician' },
  { id: 'guard', label: 'Guard' },
  { id: 'human', label: 'Human' },
  { id: 'scoutrobo', label: 'Scout robot' }
] as const

export type PlayerCharacterId = (typeof PLAYER_CHARACTERS)[number]['id']
type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem'>

export function isPlayerCharacterId(value: unknown): value is PlayerCharacterId {
  return PLAYER_CHARACTERS.some((choice) => choice.id === value)
}

function parseCharacter(saved: string | null): PlayerCharacterId {
  if (saved === null) return 'theme'
  try {
    const parsed: unknown = JSON.parse(saved)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'theme'
    if (Object.keys(parsed).length !== 2 || Reflect.get(parsed, 'version') !== 1) return 'theme'
    const id: unknown = Reflect.get(parsed, 'id')
    return isPlayerCharacterId(id) ? id : 'theme'
  } catch {
    return 'theme'
  }
}

export function createPlayerCharacterStore(storage: () => ChoiceStorage | null = browserStorage) {
  let current: PlayerCharacterId | undefined
  const listeners = new Set<() => void>()
  const get = (): PlayerCharacterId => {
    if (current !== undefined) return current
    try {
      current = parseCharacter(storage()?.getItem(PLAYER_CHARACTER_STORAGE_KEY) ?? null)
    } catch {
      current = 'theme'
    }
    return current
  }
  const choose = (id: PlayerCharacterId): boolean => {
    if (!isPlayerCharacterId(id)) return false
    const previous = get()
    try {
      storage()?.setItem(PLAYER_CHARACTER_STORAGE_KEY, JSON.stringify({ version: 1, id }))
    } catch {
      // Blocked storage must not prevent an in-memory presentation choice.
    }
    current = id
    if (previous !== current) listeners.forEach((listener) => listener())
    return true
  }
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  return { get, choose, subscribe, getServerSnapshot: (): PlayerCharacterId => 'theme' }
}

const playerCharacters = createPlayerCharacterStore()
const getPlayerCharacter = playerCharacters.get
export const choosePlayerCharacter = playerCharacters.choose

export function usePlayerCharacter(): PlayerCharacterId {
  return useSyncExternalStore(
    playerCharacters.subscribe,
    getPlayerCharacter,
    playerCharacters.getServerSnapshot
  )
}
