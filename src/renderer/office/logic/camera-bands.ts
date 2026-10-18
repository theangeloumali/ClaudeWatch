import type { ZoneGeometry } from '../scene-model'

export type ZoomBand = 'desk' | 'floor' | 'building'
export type ZoomDirection = 'in' | 'out'

// Orthographic zoom in screen pixels per metre: the desk fly-to, the scene's first frame and the
// cap on the building overview.
export const BAND_ZOOM: Record<ZoomBand, number> = { desk: 90, floor: 34, building: 8 }
// Hardware inspection needs more detail than the original agent fly-to.
export const MAX_INSPECTION_ZOOM = 240

const DEG_TO_RAD = Math.PI / 180
const ISO_ELEVATION_DEG = 35
// camera-controls measures polar angle from straight up.
export const ISO_POLAR = (90 - ISO_ELEVATION_DEG) * DEG_TO_RAD
export const ISO_START_AZIMUTH = 45 * DEG_TO_RAD
export const MIN_POLAR = 20 * DEG_TO_RAD
export const MAX_POLAR = 70 * DEG_TO_RAD
const TILT_STEP = 10 * DEG_TO_RAD

export function tiltPolar(polar: number, direction: -1 | 1): number {
  return Math.min(MAX_POLAR, Math.max(MIN_POLAR, polar - direction * TILT_STEP))
}

// dry-new: quadrant snapping cannot choose the nearest equivalent of an authored preset yaw.
export function nearestAzimuth(current: number, destination: number): number {
  return destination + Math.round((current - destination) / (2 * Math.PI)) * 2 * Math.PI
}
const SNAP_STEP = 90 * DEG_TO_RAD
const SNAP_EPSILON = 1e-6

const DESK_ENTER_ZOOM = 55
const DESK_LEAVE_ZOOM = 48
// Fractions of the zoom that fits this floor, which runs from 8 px/m (a full plate) to 60 (one office).
const BUILDING_ENTER_FIT = 0.8
const BUILDING_LEAVE_FIT = 0.9

// The band is a level of detail read off the zoom, never a zoom to snap to. Each threshold has
// a gap between entering and leaving, so hovering on one does not flicker the cards.
export function bandForZoom(zoom: number, previous: ZoomBand, floorFitZoom: number): ZoomBand {
  if (zoom >= (previous === 'desk' ? DESK_LEAVE_ZOOM : DESK_ENTER_ZOOM)) return 'desk'
  // A lone office fits above the desk threshold; measured from there it would have no floor level.
  const fitZoom = Math.min(floorFitZoom, DESK_LEAVE_ZOOM)
  const buildingBelow =
    fitZoom * (previous === 'building' ? BUILDING_LEAVE_FIT : BUILDING_ENTER_FIT)
  return zoom < buildingBelow ? 'building' : 'floor'
}

// The four isometric corners sit at 45° + k·90°.
export function snapAzimuth(azimuth: number, direction: -1 | 1): number {
  const steps = (azimuth - ISO_START_AZIMUTH) / SNAP_STEP
  const target =
    direction > 0 ? Math.floor(steps + SNAP_EPSILON) + 1 : Math.ceil(steps - SNAP_EPSILON) - 1
  return ISO_START_AZIMUTH + target * SNAP_STEP
}

// The widest view: `scene` is the scene's extent, the plate with its apron and its lots. Its
// centre is wherever the plate lies; left out, it is the gate.
export function buildingFraming(
  scene: { x?: number; z?: number; width: number; depth: number },
  floorCount: number,
  viewport: { width: number; height: number },
  pose: { azimuth?: number; polar?: number } = {}
) {
  const { x = 0, z = 0, width, depth } = scene
  const height = Math.max(8, floorCount * 2.2 + 1)
  const azimuth = pose.azimuth ?? ISO_START_AZIMUTH
  const polar = pose.polar ?? ISO_POLAR
  const projectedWidth = width * Math.abs(Math.cos(azimuth)) + depth * Math.abs(Math.sin(azimuth))
  const projectedDepth = width * Math.abs(Math.sin(azimuth)) + depth * Math.abs(Math.cos(azimuth))
  const projectedHeight = projectedDepth * Math.cos(polar) + height * Math.sin(polar)
  return {
    // The scene's own centre: its extent already includes the deeper apron to the north.
    target: [x, height / 2, z] satisfies [number, number, number],
    projectedWidth,
    projectedHeight,
    zoom: Math.max(
      0.1,
      Math.min(
        BAND_ZOOM.building,
        viewport.width / (projectedWidth * 1.2),
        viewport.height / (projectedHeight * 1.2)
      )
    )
  }
}

interface Point3 {
  x: number
  y: number
  z: number
}

// Everything that is drawn: the scene's extent on the ground, and how low and high it reaches.
export interface SceneBox {
  x: number
  z: number
  width: number
  depth: number
  minY: number
  maxY: number
}

// `forward` is the unit direction the camera looks along; the half sizes are the view's, in metres.
export interface CameraPose {
  position: Point3
  forward: Point3
  halfWidth: number
  halfHeight: number
}

const CLIP_MARGIN_M = 1
const MIN_NEAR_M = 0.1
// Where a retreat leaves the nearest thing: clear of the minimum, so rounding never asks again.
const RESTING_NEAR_M = 1
const GROUND_OVERSCAN = 1.05

// How much deeper the ground at the top edge of the view is than the ground at its centre.
function groundDepth(groundY: number, pose: CameraPose): { centre: number; spread: number } {
  const { position, forward, halfHeight } = pose
  return {
    centre: (groundY - position.y) / forward.y,
    spread: (halfHeight * Math.hypot(forward.x, forward.z)) / Math.abs(forward.y)
  }
}

// Near and far planes that hold the whole scene and the ground across the whole view. Whatever
// is behind the camera is neither drawn nor picked, so `pushBack` is how far it must retreat
// along its own line of sight first; the planes are measured from there.
export function clipPlanes(
  box: SceneBox,
  pose: CameraPose
): { near: number; far: number; pushBack: number } {
  const { position, forward } = pose
  const depths = [box.x - box.width / 2, box.x + box.width / 2].flatMap((x) =>
    [box.z - box.depth / 2, box.z + box.depth / 2].flatMap((z) =>
      [box.minY, box.maxY].map(
        (y) =>
          (x - position.x) * forward.x + (y - position.y) * forward.y + (z - position.z) * forward.z
      )
    )
  )
  const ground = groundDepth(box.minY, pose)
  const nearest = Math.min(...depths, ground.centre - ground.spread) - CLIP_MARGIN_M
  const farthest = Math.max(...depths, ground.centre + ground.spread) + CLIP_MARGIN_M
  const pushBack = nearest < MIN_NEAR_M ? RESTING_NEAR_M - nearest : 0
  return { near: nearest + pushBack, far: farthest + pushBack, pushBack }
}

// A square of ground under the view, large enough to pass every edge of it at any map rotation.
export function groundCover(
  groundY: number,
  pose: CameraPose
): { x: number; z: number; size: number } {
  const { position, forward, halfWidth, halfHeight } = pose
  const { centre } = groundDepth(groundY, pose)
  return {
    x: position.x + forward.x * centre,
    z: position.z + forward.z * centre,
    size: 2 * GROUND_OVERSCAN * Math.hypot(halfWidth, halfHeight / Math.abs(forward.y))
  }
}

// Desk zoom follows the place an agent sits (its room, or its company's lounge while it rests
// there), not the agent itself: that moves while walking.
export interface FollowAnchor {
  agentKey: string
  roomX: number
  roomZ: number
}

export type FollowStep =
  | { kind: 'stay' }
  | { kind: 'shift'; dx: number; dz: number; anchor: FollowAnchor }
  | { kind: 'lost' }

interface FollowedAgent {
  agentKey: string
  roomId: string
  place?: 'lounge'
}

type Spot = Pick<ZoneGeometry, 'x' | 'z'>
const NO_LOUNGES: ReadonlyMap<string, Spot> = new Map()

// Every office room's company lounge, keyed by the room: a project's leaves share the rooms' ids.
export function loungesByRoom(zones: readonly ZoneGeometry[]): Map<string, Spot> {
  const lounges = new Map<string, Spot>()
  for (const company of zones) {
    const { lounge } = company
    if (!lounge) continue
    const visit = (zone: ZoneGeometry): void => {
      lounges.set(zone.id, lounge)
      zone.children.forEach(visit)
    }
    company.children.forEach(visit)
  }
  return lounges
}

interface RoomCentre {
  id: string
  x: number
  z: number
}

const ROOM_MOVED_EPSILON_M = 0.01

export function followAnchor(
  agent: FollowedAgent,
  rooms: readonly RoomCentre[],
  lounges: ReadonlyMap<string, Spot> = NO_LOUNGES
): FollowAnchor | null {
  const lounge = agent.place === 'lounge' ? lounges.get(agent.roomId) : undefined
  const spot = lounge ?? rooms.find((candidate) => candidate.id === agent.roomId)
  return spot ? { agentKey: agent.agentKey, roomX: spot.x, roomZ: spot.z } : null
}

// 'shift' carries a delta, so a pan the owner made inside the office is kept, only moved along.
export function followStep(
  anchor: FollowAnchor,
  agents: readonly FollowedAgent[],
  rooms: readonly RoomCentre[],
  lounges: ReadonlyMap<string, Spot> = NO_LOUNGES
): FollowStep {
  const agent = agents.find((candidate) => candidate.agentKey === anchor.agentKey)
  if (!agent) return { kind: 'lost' }
  const next = followAnchor(agent, rooms, lounges)
  if (!next) return { kind: 'stay' }
  const dx = next.roomX - anchor.roomX
  const dz = next.roomZ - anchor.roomZ
  if (Math.hypot(dx, dz) < ROOM_MOVED_EPSILON_M) return { kind: 'stay' }
  return { kind: 'shift', dx, dz, anchor: next }
}
