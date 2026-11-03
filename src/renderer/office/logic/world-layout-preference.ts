// City keeps the saved street plan; Campus rings the same rooms round a hub.
export type WorldLayout = 'city' | 'campus'

export const WORLD_LAYOUT_PREFERENCE_KEY = 'claudewatch.office.world-layout'
const DEFAULT_WORLD_LAYOUT: WorldLayout = 'city'

export function readWorldLayoutPreference(storage: Pick<Storage, 'getItem'> | null): WorldLayout {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(WORLD_LAYOUT_PREFERENCE_KEY) ?? 'null')
    return saved === 'campus' || saved === 'city' ? saved : DEFAULT_WORLD_LAYOUT
  } catch {
    return DEFAULT_WORLD_LAYOUT
  }
}

export function saveWorldLayoutPreference(
  storage: Pick<Storage, 'setItem'> | null,
  layout: WorldLayout
): boolean {
  if (!storage) return false
  try {
    storage.setItem(WORLD_LAYOUT_PREFERENCE_KEY, JSON.stringify(layout))
    return true
  } catch {
    return false
  }
}
