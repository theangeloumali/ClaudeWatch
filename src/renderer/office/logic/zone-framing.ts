import { clamp } from '../../../shared/range'
import type { FloorGeometry, RoomGeometry, ZoneGeometry } from '../scene-model'
import { BAND_ZOOM, ISO_POLAR } from './camera-bands'
import { HUD_COLUMNS_BREAKPOINT, HUD_SAFE_INSETS } from './hud-layout'
export { HUD_SAFE_INSETS } from './hud-layout'

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface ScreenView {
  target: [number, number, number]
  zoom: number
  azimuth: number
  polar?: number
}

interface Viewport {
  width: number
  height: number
}

interface Insets {
  left: number
  right: number
  top: number
  bottom: number
}

// Below this safe width the rails stack (md breakpoint), so framing uses the whole viewport.
const MIN_SAFE_WIDTH = 180
const OCCUPIED_PADDING_M = 1.5
// Name cards float about 2 m up; framing includes that height so cards are not cut off.
const FRAMED_HEIGHT_M = 2.6
const MIN_FRAME_ZOOM = 4

// Where name cards may sit: clear of the side rails and the top and bottom bars. A robot walking
// north out of a desk-zoom frame would otherwise carry its card under the top bar.
export function cardSafeArea(
  viewport: Viewport,
  insets: Insets = HUD_SAFE_INSETS
): {
  left: number
  right: number
  top: number
  bottom: number
} {
  const hasRoomForRails =
    viewport.width >= HUD_COLUMNS_BREAKPOINT &&
    viewport.width - insets.left - insets.right >= MIN_SAFE_WIDTH
  return {
    left: hasRoomForRails ? insets.left : 0,
    right: viewport.width - (hasRoomForRails ? insets.right : 0),
    top: insets.top,
    bottom: viewport.height - insets.bottom
  }
}

type Shift = { x: number; z: number }

const moved = <Point extends Shift>(point: Point, by: Shift): Point => ({
  ...point,
  x: point.x - by.x,
  z: point.z - by.z
})

function movedRoom(room: RoomGeometry, by: Shift): RoomGeometry {
  return {
    ...moved(room, by),
    door: moved(room.door, by),
    seats: room.seats.map((seat) => moved(seat, by))
  }
}

function movedZone(zone: ZoneGeometry, by: Shift): ZoneGeometry {
  const { lounge } = zone
  return {
    ...moved(zone, by),
    door: zone.door && moved(zone.door, by),
    children: zone.children.map((child) => movedZone(child, by)),
    ...(lounge && {
      lounge: {
        ...moved(lounge, by),
        door: moved(lounge.door, by),
        seats: lounge.seats.map((seat) => moved(seat, by))
      }
    })
  }
}

// The floor as a theme's slab and lift see it. They draw around their own origin, so
// they are drawn in a group at the plate centre and given this copy, measured from there.
export function plateLocalFloor(floor: FloorGeometry): FloorGeometry {
  const centre = { x: floor.x, z: floor.z }
  return {
    ...floor,
    x: 0,
    z: 0,
    corridor: { ...floor.corridor, z: floor.corridor.z - centre.z },
    elevator: moved(floor.elevator, centre),
    rooms: floor.rooms.map((room) => movedRoom(room, centre)),
    zones: floor.zones.map((zone) => movedZone(zone, centre))
  }
}

export function boundsOfZone(zone: Pick<ZoneGeometry, 'x' | 'z' | 'width' | 'depth'>): Bounds {
  return {
    minX: zone.x - zone.width / 2,
    maxX: zone.x + zone.width / 2,
    minZ: zone.z - zone.depth / 2,
    maxZ: zone.z + zone.depth / 2
  }
}

function union(all: readonly Bounds[]): Bounds {
  return {
    minX: Math.min(...all.map((bounds) => bounds.minX)),
    maxX: Math.max(...all.map((bounds) => bounds.maxX)),
    minZ: Math.min(...all.map((bounds) => bounds.minZ)),
    maxZ: Math.max(...all.map((bounds) => bounds.maxZ))
  }
}

export function padBounds(bounds: Bounds, metres: number): Bounds {
  return {
    minX: bounds.minX - metres,
    maxX: bounds.maxX + metres,
    minZ: bounds.minZ - metres,
    maxZ: bounds.maxZ + metres
  }
}

function hasLiveSession(zone: ZoneGeometry, live: ReadonlySet<string>): boolean {
  if (zone.sessionKey && live.has(zone.sessionKey)) return true
  return zone.children.some((child) => hasLiveSession(child, live))
}

function occupiedProjects(
  zones: readonly ZoneGeometry[],
  live: ReadonlySet<string>
): ZoneGeometry[] {
  return zones.flatMap((zone) => {
    if (!hasLiveSession(zone, live)) return []
    return zone.kind === 'project' ? [zone] : occupiedProjects(zone.children, live)
  })
}

// The part of the floor worth looking at: project offices with live sessions, else the leaf
// rooms with sessions, else the whole plate.
export function occupiedBounds(floor: FloorGeometry, liveSessionKeys: ReadonlySet<string>): Bounds {
  const projects = occupiedProjects(floor.zones, liveSessionKeys)
  if (projects.length > 0) return padBounds(union(projects.map(boundsOfZone)), OCCUPIED_PADDING_M)
  const rooms = floor.rooms.filter(
    (room) => room.sessionKey && liveSessionKeys.has(room.sessionKey)
  )
  if (rooms.length > 0) return padBounds(union(rooms.map(boundsOfZone)), OCCUPIED_PADDING_M)
  return boundsOfZone(floor)
}

// Orthographic isometric projection into "screen metres": x to the right, y up the screen.
function toScreenMetres(
  point: { x: number; y: number; z: number },
  azimuth: number,
  polar = ISO_POLAR
) {
  const sin = Math.sin(azimuth)
  const cos = Math.cos(azimuth)
  return {
    x: point.x * cos - point.z * sin,
    y: point.y * Math.sin(polar) - (point.x * sin + point.z * cos) * Math.cos(polar)
  }
}

type Axis = [number, number, number]

// World directions of screen-right and screen-up: the inverse of toScreenMetres.
export function screenAxes(azimuth: number, polar = ISO_POLAR): { right: Axis; up: Axis } {
  const sin = Math.sin(azimuth)
  const cos = Math.cos(azimuth)
  return {
    right: [cos, 0, -sin],
    up: [-sin * Math.cos(polar), Math.sin(polar), -cos * Math.cos(polar)]
  }
}

export function projectToScreen(
  point: { x: number; y: number; z: number },
  view: ScreenView,
  viewport: Viewport
): { x: number; y: number } {
  const [tx, ty, tz] = view.target
  const relative = toScreenMetres(
    { x: point.x - tx, y: point.y - ty, z: point.z - tz },
    view.azimuth,
    view.polar
  )
  return {
    x: viewport.width / 2 + relative.x * view.zoom,
    y: viewport.height / 2 - relative.y * view.zoom
  }
}

// Fit the bounds (and the name cards above them) into the area the HUD leaves free, then place
// the camera target on the ground so the bounds' centre lands at that area's centre.
export function frameBounds(
  bounds: Bounds,
  viewport: Viewport,
  options: {
    azimuth: number
    polar?: number
    maxZoom?: number
    minZoom?: number
    height?: number
    insets?: Insets
  }
): { target: [number, number, number]; zoom: number } {
  const requested = options.insets ?? HUD_SAFE_INSETS
  const hasRoomForRails =
    viewport.width >= HUD_COLUMNS_BREAKPOINT &&
    viewport.width - requested.left - requested.right >= MIN_SAFE_WIDTH
  const insets = hasRoomForRails ? requested : { ...requested, left: 0, right: 0 }
  const safeWidth = viewport.width - insets.left - insets.right
  const safeHeight = Math.max(1, viewport.height - insets.top - insets.bottom)

  const projected = [bounds.minX, bounds.maxX].flatMap((x) =>
    [bounds.minZ, bounds.maxZ].flatMap((z) =>
      [0, options.height ?? FRAMED_HEIGHT_M].map((y) =>
        toScreenMetres({ x, y, z }, options.azimuth, options.polar)
      )
    )
  )
  const minX = Math.min(...projected.map((point) => point.x))
  const maxX = Math.max(...projected.map((point) => point.x))
  const minY = Math.min(...projected.map((point) => point.y))
  const maxY = Math.max(...projected.map((point) => point.y))
  const fit = Math.min(
    safeWidth / Math.max(maxX - minX, 0.01),
    safeHeight / Math.max(maxY - minY, 0.01)
  )
  const zoom = clamp(fit, [options.minZoom ?? MIN_FRAME_ZOOM, options.maxZoom ?? BAND_ZOOM.desk])

  // Screen-metre position the target must have so the bounds' centre sits mid safe-area.
  const targetX = (minX + maxX) / 2 - (insets.left + safeWidth / 2 - viewport.width / 2) / zoom
  const targetY = (minY + maxY) / 2 + (insets.top + safeHeight / 2 - viewport.height / 2) / zoom
  const depth = -targetY / Math.cos(options.polar ?? ISO_POLAR)
  const sin = Math.sin(options.azimuth)
  const cos = Math.cos(options.azimuth)
  return { target: [targetX * cos + depth * sin, 0, -targetX * sin + depth * cos], zoom }
}
