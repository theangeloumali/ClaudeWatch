import { isJsonObject } from '../../../shared/json-object'
import type { OfficeState } from './office-reducer'

export const VIEW_PREFERENCE_KEY = 'claudewatch.office.view'
type ViewPreference = Pick<OfficeState, 'viewMode' | 'isListView' | 'areRoofsVisible'>
const DEFAULT_VIEW: ViewPreference = {
  viewMode: 'city',
  isListView: false,
  areRoofsVisible: true
}

export function readViewPreference(storage: Pick<Storage, 'getItem'> | null): ViewPreference {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(VIEW_PREFERENCE_KEY) ?? 'null')
    if (!isJsonObject(saved)) return DEFAULT_VIEW
    return {
      viewMode:
        saved.viewMode === 'office' || saved.viewMode === 'city'
          ? saved.viewMode
          : DEFAULT_VIEW.viewMode,
      isListView:
        typeof saved.isListView === 'boolean' ? saved.isListView : DEFAULT_VIEW.isListView,
      areRoofsVisible: typeof saved.areRoofsVisible === 'boolean' ? saved.areRoofsVisible : true
    }
  } catch {
    return DEFAULT_VIEW
  }
}

export function saveViewPreference(
  storage: Pick<Storage, 'setItem'> | null,
  preference: Pick<ViewPreference, 'viewMode' | 'isListView'> &
    Partial<Pick<ViewPreference, 'areRoofsVisible'>>
): boolean {
  if (!storage) return false
  try {
    storage.setItem(
      VIEW_PREFERENCE_KEY,
      JSON.stringify({ ...preference, areRoofsVisible: preference.areRoofsVisible ?? true })
    )
    return true
  } catch {
    return false
  }
}
