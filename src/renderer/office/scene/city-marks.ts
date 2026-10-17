import { OrthographicCamera, Vector3, type Camera } from 'three'
import { clamp, type Range } from '../../../shared/range'
import { cityEvents, type CityEvent } from '../../office-live/city-events'
import { buildingPlaces, type PlaceTop } from '../logic/building-place'
import { MIN_POLAR, type SceneBox, type ZoomBand } from '../logic/camera-bands'
import { cityClock } from '../logic/city-clock'
import { citySignalStore } from '../logic/city-signal-store'
import type { BuildingSignal, CitySignals } from '../logic/city-signals'
import type { QualityLevel } from '../logic/quality'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M } from '../logic/token-spires'

// What every city mark reads in one drawn frame: the live signals, events and roofs.
export interface CityMarkFrame {
  signals: CitySignals
  // Bumps only when a signal changed, so one sites scan serves every frame until then.
  signalsVersion: number
  events: readonly CityEvent[]
  topOf: (buildingId: string) => PlaceTop | null
  nowMs: number
  isPinned: boolean
  // Orthographic pixels per metre: a mark's size on screen follows it (N7).
  zoom: number
  band: ZoomBand
}

export function readCityMarks(band: ZoomBand, zoom: number): CityMarkFrame {
  const nowMs = cityClock.now()
  const isPinned = cityClock.isPinned()
  return {
    signals: citySignalStore.current(),
    signalsVersion: citySignalStore.version(),
    events: cityEvents.active(),
    topOf: (buildingId) => buildingPlaces.topAt(buildingId, nowMs, isPinned),
    nowMs,
    isPinned,
    zoom,
    band
  }
}

// Effects go first when the machine struggles; the state still shows on cards and gems.
export const isMarkLevel = (level: QualityLevel): boolean => level !== 'light'

// A crown stands at most this far over its top storey; a spec pins it for every theme.
export const CROWN_RISE_MAX_M = 3
// The tallest mark over a roof in metres: the beacon column.
export const MARK_RISE_M = 12
// The tallest screen-sized stack: a leader crown over the tallest name card and its gap.
export const NAME_CARD_MAX_PX = 72
export const CARD_GAP_PX = 6
export const CROWN_MAX_PX = 32
// A crown's corners lie within its size of its centre, so twice its size bounds its reach.
const MARK_MAX_PX = NAME_CARD_MAX_PX + CARD_GAP_PX + 2 * CROWN_MAX_PX

// Horizon clips at its box, so it keeps room over the scene for a crown, a spire and marks (N5).
export const markClipBox = (box: SceneBox): SceneBox => ({
  ...box,
  maxY: box.maxY + CROWN_RISE_MAX_M + SPIRE_BASE_GAP_M + SPIRE_MAX_M + MARK_RISE_M
})

export const screenMetres = (pixels: number, zoom: number): number => pixels / Math.max(zoom, 0.1)

// Screen-sized marks rise in pixels, so Horizon's room over the clip box grows as the camera pulls
// out; a lower tilt stretches each screen pixel over more height (`upY` is the camera's up.y).
export const markHeadroomM = (zoom: number, upY: number): number =>
  screenMetres(MARK_MAX_PX, zoom) / Math.max(upY, Math.sin(MIN_POLAR))

// A mark `metres` across, held between `pixels` on screen at every zoom (N7).
export interface MarkSize {
  metres: number
  pixels: Range
}

export const markSizeM = ({ metres, pixels: [low, high] }: MarkSize, zoom: number): number =>
  clamp(metres, [screenMetres(low, zoom), screenMetres(high, zoom)])

export const cameraZoom = (camera: Camera): number =>
  camera instanceof OrthographicCamera ? camera.zoom : 1

const view = new Vector3()
// The turn about +y that faces a mark toward the camera.
export function cameraAzimuth(camera: Camera): number {
  camera.getWorldDirection(view)
  return Math.atan2(-view.x, -view.z)
}

export const easeOut = (share: number): number => 1 - (1 - share) * (1 - share)

export interface MarkPose {
  x: number
  y: number
  z: number
  scaleX: number
  scaleY: number
  scaleZ: number
  rotationX?: number
  rotationY?: number
}

type SiteTest = (signal: BuildingSignal) => boolean
const NO_SITES: readonly string[] = []
const siteScans = new WeakMap<SiteTest, { version: number; limit: number; sites: string[] }>()

// The buildings whose signal holds, in a stable order, at most `limit`; none at the desk.
export function markSites(
  frame: Pick<CityMarkFrame, 'signals' | 'signalsVersion' | 'band'>,
  holds: SiteTest,
  limit: number
): readonly string[] {
  if (frame.band === 'desk') return NO_SITES
  const scan = siteScans.get(holds)
  if (scan?.version === frame.signalsVersion && scan.limit === limit) return scan.sites
  const sites: string[] = []
  for (const [buildingId, signal] of frame.signals.buildings)
    if (holds(signal)) sites.push(buildingId)
  sites.sort().splice(limit)
  siteScans.set(holds, { version: frame.signalsVersion, limit, sites })
  return sites
}
