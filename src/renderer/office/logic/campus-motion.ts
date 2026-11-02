export interface CampusClock {
  // Shared by every Campus shader as its `uTime` uniform.
  uTime: { value: number }
  tick(elapsedS: number, isReducedMotion: boolean): void
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

const IDLE_PACKET_SPEED = 0.15
const PACKET_SPEED_PER_AGENT = 0.12
const BUSIEST_ROOM_AGENTS = 12

// Reduced motion freezes the time where it stands, so every layer holds a lit still frame.
export function createCampusClock(): CampusClock {
  const uTime = { value: 0 }
  return {
    uTime,
    tick: (elapsedS, isReducedMotion) => {
      if (!isReducedMotion) uTime.value = elapsedS
    }
  }
}

// The one clock CampusLayers ticks each frame.
export const campusClock = createCampusClock()

// 0..1, a sine eased in and out over `periodS`.
export function breath(timeS: number, periodS: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * timeS) / periodS)
}

// A wave from the core to the rim: `share` of the rim radius it has reached, fading as it goes.
export function rippleAt(
  timeS: number,
  periodS: number,
  phase: number
): { share: number; opacity: number } {
  const progress = (((timeS / periodS + phase) % 1) + 1) % 1
  return { share: progress, opacity: (1 - progress) ** 2 }
}

// Road packets in road lengths a second: an idle room still trickles.
export function packetSpeedFor(runningAgents: number): number {
  return IDLE_PACKET_SPEED + PACKET_SPEED_PER_AGENT * Math.min(runningAgents, BUSIEST_ROOM_AGENTS)
}

// The control point that lifts a quadratic arc `rise` metres above its higher end at its middle.
export function arcControl(from: Vec3, to: Vec3, rise: number): Vec3 {
  return { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + rise * 2, z: (from.z + to.z) / 2 }
}

export function arcPoints(from: Vec3, to: Vec3, rise: number, segments: number): Vec3[] {
  const control = arcControl(from, to, rise)
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments
    const a = (1 - t) ** 2
    const b = 2 * (1 - t) * t
    const c = t ** 2
    return {
      x: a * from.x + b * control.x + c * to.x,
      y: a * from.y + b * control.y + c * to.y,
      z: a * from.z + b * control.z + c * to.z
    }
  })
}

const BREATH_DEPTH = 0.04
const SHOCKWAVE_MS = 900

// The core's scale: rest minus 4% at the start of a breath, plus 4% at its middle.
export function breathScale(timeS: number, periodS: number): number {
  return 1 + BREATH_DEPTH * (2 * breath(timeS, periodS) - 1)
}

// The memory shockwave `elapsedMs` in: fast off the core, fading out at the rim; null when over.
export function shockwaveAt(elapsedMs: number): { share: number; opacity: number } | null {
  if (elapsedMs < 0 || elapsedMs >= SHOCKWAVE_MS) return null
  const progress = elapsedMs / SHOCKWAVE_MS
  return { share: 1 - (1 - progress) ** 3, opacity: 1 - progress }
}

export interface RunningRoom {
  projectKey: string
  runningCount: number
}

// A stable name for the running counts, so road speeds are rewritten only when one changes.
export function runningCountsKey(rooms: readonly RunningRoom[] | undefined): string {
  return (rooms ?? [])
    .map((room) => `${room.projectKey}=${room.runningCount}`)
    .sort()
    .join(',')
}
