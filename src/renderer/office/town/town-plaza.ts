import { boundsOfZone } from '../logic/zone-framing'
import type { Rect } from '../themes/lot-math'
import type { Site } from '../themes/surroundings'
import {
  ROW_ACROSS_M,
  ROW_DEPTH_M,
  gardenPiece,
  levelled,
  roomOver,
  type GreenPlot
} from './garden-pieces'
import type { GardenRole } from './town-dress'
import { ROAD_WIDTH_M, SIDEWALK_M } from './town-grid'

// Each long edge, outward from the avenue's mouth: a pair flanking it, then lamp, seat, lamp.
const EDGE_SLOTS: readonly (readonly [GardenRole, number])[] = [
  ['plazaPair', 6.8],
  ['lamp', 8.3],
  ['seat', 9.8],
  ['lamp', 11.3]
]
const PIECE_ALONG_M = 1.2

// The avenue's width carried through the claim: the way in to the gate and on east.
export function campusStreet(claim: Rect): Rect {
  return { ...claim, z: 0, depth: ROAD_WIDTH_M.avenue }
}

// Its west edge on the boulevard's outer sidewalk, its east edge on the belt; both face in.
export function plazaPieces(claim: Rect, site: Site, promenades: readonly Rect[]): GreenPlot[] {
  const west = boundsOfZone(claim).minX
  const edges = [
    { name: 'west', x: west + SIDEWALK_M.boulevard / 2, facing: 'east' },
    { name: 'east', x: west + ROW_DEPTH_M, facing: 'west' }
  ] as const
  const pieces = edges.flatMap((edge) =>
    EDGE_SLOTS.flatMap(([role, along]) =>
      [-along, along].map((z) => {
        const rect = { x: edge.x, z, width: ROW_ACROSS_M, depth: PIECE_ALONG_M }
        return gardenPiece(`plaza:${edge.name}:${role}:${z}`, role, rect, {
          facing: edge.facing,
          zoneId: null,
          maxHeight: roomOver(rect, site, promenades)
        })
      })
    )
  )
  return levelled(pieces)
}
