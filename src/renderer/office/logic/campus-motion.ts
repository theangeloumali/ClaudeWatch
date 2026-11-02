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

// A quadratic arc from `from` to `to`, lifted `rise` metres above the higher end at its middle.
export function arcPoints(from: Vec3, to: Vec3, rise: number, segments: number): Vec3[] {
  const control = {
    x: (from.x + to.x) / 2,
    y: Math.max(from.y, to.y) + rise * 2,
    z: (from.z + to.z) / 2
  }
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
