import { FURNITURE_SCALE } from '../../../shared/office/figure-scale'
import type { LoungeGeometry } from '../scene-model'

// The sim's contract: seats face the screen on the far edge, the door is mid-way along the
// edge facing the rooms, and the front row stands 1.2 m from the far edge.
export const HEADINGS = [0, Math.PI, Math.PI / 2, -Math.PI / 2] as const
const FRONT_ROW_M = 1.2
const SEATS_PER_ROW = 4

// A game corner laid out as the sim lays one: rows of four, sized at furniture scale.
export function gameCornerFixture(
  heading: number,
  seatCount: number,
  centre = { x: 20, z: -10 }
): LoungeGeometry {
  const rows = Math.ceil(seatCount / SEATS_PER_ROW)
  const across = 6 * FURNITURE_SCALE
  const along = (3 + rows * 2) * FURNITURE_SCALE
  const facing = { x: Math.sin(heading), z: Math.cos(heading) }
  const side = { x: Math.cos(heading), z: -Math.sin(heading) }
  // `ahead` runs from the door (-along / 2) to the far edge; `beside` across the corner.
  const at = (ahead: number, beside: number) => ({
    x: centre.x + facing.x * ahead + side.x * beside,
    z: centre.z + facing.z * ahead + side.z * beside
  })
  const isAlongZ = Math.abs(facing.z) > Math.abs(facing.x)
  return {
    id: 'floor-1:games',
    ...centre,
    width: isAlongZ ? across : along,
    depth: isAlongZ ? along : across,
    door: at(-along / 2, 0),
    seats: Array.from({ length: seatCount }, (_, index) => {
      const row = Math.floor(index / SEATS_PER_ROW)
      const ahead = along / 2 - FRONT_ROW_M - row * 2 * FURNITURE_SCALE
      const beside = -across / 2 + (1.125 + (index % SEATS_PER_ROW) * 1.25) * FURNITURE_SCALE
      return { slotId: `lounge_seat_${index}`, ...at(ahead, beside), heading }
    })
  }
}
