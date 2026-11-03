import type { CourierRequest } from '../../office-live/work-trip-store'
import type { CampusSpoke } from './campus-geometry'

// Out to the hub rim and home again along the spoke.
export const COURIER_TRIP_MS = 4_000
// Two per room at the store's 2 s sample over eight rooms; extras beyond it are dropped.
export const COURIER_CAP = 16

export interface Courier {
  id: string
  buildingId: string
  // Render-clock time it set out.
  startMs: number
  // Copied at dispatch, so a ring laid out again mid-walk does not move it.
  fromX: number
  fromZ: number
  toX: number
  toZ: number
}

export interface CourierPose {
  x: number
  z: number
  // Yaw for a model that faces +z.
  heading: number
}

export interface CourierCrew {
  // False when the call's room has no spoke or the crew is full.
  dispatch(request: CourierRequest, spoke: CampusSpoke | undefined, nowMs: number): boolean
  // The couriers still walking at `nowMs`: the same list every call, pruned in place.
  step(nowMs: number): readonly Courier[]
  clear(): void
}

export function createCourierCrew(): CourierCrew {
  const walking: Courier[] = []
  return {
    dispatch(request, spoke, nowMs) {
      if (!spoke || walking.length >= COURIER_CAP) return false
      walking.push({
        id: request.id,
        buildingId: request.buildingId,
        startMs: nowMs,
        fromX: spoke.from.x,
        fromZ: spoke.from.z,
        toX: spoke.to.x,
        toZ: spoke.to.z
      })
      return true
    },
    step(nowMs) {
      let kept = 0
      for (const courier of walking)
        if (nowMs - courier.startMs < COURIER_TRIP_MS) walking[kept++] = courier
      walking.length = kept
      return walking
    },
    clear() {
      walking.length = 0
    }
  }
}

// Writes into `pose` so a frame loop allocates nothing; false once the courier is home.
export function courierPose(courier: Courier, nowMs: number, pose: CourierPose): boolean {
  const progress = (nowMs - courier.startMs) / COURIER_TRIP_MS
  if (progress >= 1) return false
  const isOutbound = progress < 0.5
  // 0 at the room, 1 at the hub rim.
  const reach = isOutbound ? progress * 2 : 2 - progress * 2
  const dx = courier.toX - courier.fromX
  const dz = courier.toZ - courier.fromZ
  pose.x = courier.fromX + dx * reach
  pose.z = courier.fromZ + dz * reach
  pose.heading = isOutbound ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz)
  return true
}
