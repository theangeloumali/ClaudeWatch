import { FURNITURE_SCALE, GUEST_FURNITURE_SCALE } from '../../../shared/office/figure-scale'
import type { DeskSlot } from '../scene-model'
import { DESK_REACH } from '../logic/room-layout'
import type { WorkstationSpec } from './types'

// dry-new: hardware, display projection and camera fitting need the same authored screen plane.
export const WORKSTATIONS = {
  corporate: { screen: [0, 0.82, DESK_REACH + 0.102], width: 0.43, height: 0.25 },
  edo: { screen: [0, 0.66, DESK_REACH - 0.102], width: 0.33, height: 0.25 },
  samurai: { screen: [0, 0.82, DESK_REACH + 0.102], width: 0.47, height: 0.27 }
} satisfies Record<string, WorkstationSpec>

export function workstationPlacement(slot: DeskSlot, spec: WorkstationSpec) {
  const scale = slot.slotId === 'desk_main' ? FURNITURE_SCALE : GUEST_FURNITURE_SCALE
  const [across, height, along] = spec.screen
  return {
    x: slot.x + scale * (across * Math.cos(slot.heading) + along * Math.sin(slot.heading)),
    y: height * scale,
    z: slot.z + scale * (along * Math.cos(slot.heading) - across * Math.sin(slot.heading)),
    width: spec.width * scale,
    height: spec.height * scale,
    rotationY: slot.heading + Math.PI
  }
}
