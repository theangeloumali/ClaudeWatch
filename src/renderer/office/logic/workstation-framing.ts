import type { AgentView } from '../../../shared/office/types'
import type { DeskSlot, FloorGeometry } from '../scene-model'
import type { WorkstationSpec } from '../themes/types'
import { workstationPlacement } from '../themes/workstations'
import { MAX_INSPECTION_ZOOM, ISO_POLAR } from './camera-bands'
import { frameBounds } from './zone-framing'

// dry-new: floor fitting has no authored screen orientation or stationary seat lookup.
export function workstationSeat(agent: AgentView, floor: FloorGeometry): DeskSlot | null {
  const room = floor.rooms.find((candidate) => candidate.id === agent.roomId)
  return room?.seats.find((seat) => seat.slotId === agent.slotId) ?? null
}

export function workstationFraming(
  seat: DeskSlot,
  {
    spec,
    viewport,
    insets
  }: {
    spec: WorkstationSpec
    viewport: Parameters<typeof frameBounds>[1]
    insets?: Parameters<typeof frameBounds>[2]['insets']
  }
) {
  const screen = workstationPlacement(seat, spec)
  // Off-axis on the worker's side: the screen faces us without the worker hiding its centre.
  const azimuth = screen.rotationY + Math.PI / 4
  const polar = ISO_POLAR
  const padding = Math.max(0.75, screen.width / 2)
  const bounds = {
    minX: Math.min(seat.x, screen.x) - padding,
    maxX: Math.max(seat.x, screen.x) + padding,
    minZ: Math.min(seat.z, screen.z) - padding,
    maxZ: Math.max(seat.z, screen.z) + padding
  }
  return {
    ...frameBounds(bounds, viewport, {
      azimuth,
      polar,
      height: Math.max(2.6, screen.y + screen.height / 2),
      minZoom: 0.1,
      maxZoom: MAX_INSPECTION_ZOOM,
      insets
    }),
    azimuth,
    polar
  }
}
