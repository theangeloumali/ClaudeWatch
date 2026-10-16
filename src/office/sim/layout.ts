import type { SessionRef } from '../../shared/office/types'
import type { TownRoad } from '../../shared/office/town-roads'
import type { WorldVenue } from '../../shared/office/world-document-types'
import { LANE, packCompanies } from './allocation'
import { draftCompany, settleCompany } from './projects'
import type { FloorLayout, ZoneLayout } from './rooms'
export type { FloorLayout, LoungeLayout, RoomLayout, Slot, ZoneLayout } from './rooms'

export interface LayoutMap {
  version: 1
  floors: FloorLayout[]
  // Derived alongside floors; automatic adaptation never changes the saved document.
  effectiveVenues?: readonly WorldVenue[]
  streetBlocks?: { x: number; z: number; width: number; depth: number }[]
  // Derived like effectiveVenues: the city streets the renderer lays, never persisted.
  streets?: readonly TownRoad[]
  reservations: Record<
    string,
    { floorId: string; plate: number; bay: number; companyKey: string; projectKey: string }
  >
}

const EMPTY_FLOOR_SIDE = 12

// The tight box around every company and its 3 m margin, the street and the gate. The gate is
// the origin and stays put; the plate's centre is wherever that box falls.
function plateAround(companies: ZoneLayout[]): Pick<FloorLayout, 'x' | 'z' | 'width' | 'depth'> {
  if (companies.length === 0)
    return { x: 0, z: 0, width: EMPTY_FLOOR_SIDE, depth: EMPTY_FLOOR_SIDE }
  const street = LANE / 2
  const west = Math.min(-street, ...companies.map((c) => c.x - c.width / 2 - LANE))
  const east = Math.max(street, ...companies.map((c) => c.x + c.width / 2 + LANE))
  const north = Math.min(-street, ...companies.map((c) => c.z - c.depth / 2 - LANE))
  const south = Math.max(street, ...companies.map((c) => c.z + c.depth / 2 + LANE))
  return { x: (west + east) / 2, z: (north + south) / 2, width: east - west, depth: south - north }
}

// Only order and bays are read back from `saved`. Every size and position is rebuilt from the
// live sessions, so a map saved with larger numbers, or by an older shape, comes out compact.
export function buildLayout(sessions: SessionRef[], saved: LayoutMap | undefined): LayoutMap {
  const ordered = [...sessions].sort(
    (a, b) =>
      a.companyKey.localeCompare(b.companyKey) ||
      a.projectKey.localeCompare(b.projectKey) ||
      a.key.localeCompare(b.key)
  )
  const drafts = [...new Set(ordered.map((s) => s.companyKey))].map((companyKey) =>
    draftCompany(
      ordered.filter((s) => s.companyKey === companyKey),
      saved
    )
  )
  const zones = drafts.map((draft) => draft.zone)
  packCompanies(zones)
  return {
    version: 1,
    floors: [
      {
        id: 'hq',
        label:
          new Set(ordered.map((s) => s.projectKey)).size === 1
            ? ordered[0].projectLabel
            : 'Headquarters',
        ...plateAround(zones),
        rooms: drafts.flatMap((draft) => settleCompany(draft)),
        zones,
        elevator: { id: 'entrance', x: 0, z: 0, heading: 0 }
      }
    ],
    reservations: Object.fromEntries(drafts.flatMap((draft) => Object.entries(draft.reservations)))
  }
}
