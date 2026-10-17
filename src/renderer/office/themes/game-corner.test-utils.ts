import { cornerReach, gameCorner } from '../../../office/sim/game-corner'
import { LOUNGE_WIDTH } from '../../../office/sim/rooms'
import { toLounge } from '../../office-live/layout-geometry'
import type { LoungeGeometry } from '../scene-model'

// The sim's four ways a corner faces: seats look at the screen on the far edge.
export const HEADINGS = [0, Math.PI, Math.PI / 2, -Math.PI / 2] as const
const OFFICES_M = 4

// The sim's own corner, its seats facing `heading`, moved to `centre`. The synthetic floor is
// one office against its back wall, with room for a corner only on the side ahead of it.
export function gameCornerFixture(
  heading: number,
  seatCount: number,
  centre = { x: 20, z: -10 }
): LoungeGeometry {
  const ahead = { x: Math.round(Math.sin(heading)), z: Math.round(Math.cos(heading)) }
  const length = OFFICES_M + cornerReach(seatCount) + 3
  const across = LOUNGE_WIDTH + 2.5
  const sized = (along: number, beside: number) =>
    ahead.x === 0 ? { width: beside, depth: along } : { width: along, depth: beside }
  const back = { x: (-ahead.x * length) / 2, z: (-ahead.z * length) / 2 }
  const layout = gameCorner({
    floorId: 'floor-1',
    footprint: { x: 0, z: 0, ...sized(length, across) },
    rooms: [
      {
        x: back.x + (ahead.x * OFFICES_M) / 2,
        z: back.z + (ahead.z * OFFICES_M) / 2,
        ...sized(OFFICES_M, across)
      }
    ],
    entrance: back,
    deskCount: seatCount
  })
  if (!layout) throw new Error(`No game corner faces ${heading} rad`)
  const lounge = toLounge(layout)
  const moved = <Point extends { x: number; z: number }>(point: Point): Point => ({
    ...point,
    x: point.x + centre.x - lounge.x,
    z: point.z + centre.z - lounge.z
  })
  return { ...moved(lounge), door: moved(lounge.door), seats: lounge.seats.map(moved) }
}
