import { boundsOfZone } from '../logic/zone-framing'
import type { FloorGeometry } from '../scene-model'
import { overlaps, type Rect, type Span } from '../themes/lot-math'
import { MIN_LOT_HEIGHT_M, surveySite } from '../themes/surroundings'
import {
  ROW_ACROSS_M,
  ROW_DEPTH_M,
  gardenPiece,
  levelled,
  roomOver,
  sidePiece,
  type GreenPlot
} from './garden-pieces'
import type { GardenRole } from './town-dress'
import { avenuesOf } from './belt-avenue'
import {
  OPPOSITE_PAIRS,
  RUN_END_CLEAR_M,
  SIDES,
  centredSlots,
  isAlongX,
  isClearOfPlate,
  onSide,
  runsOf,
  type Ground,
  type Side
} from './belt-frame'
import { MIN_BELT_M } from './town-grid'
import { nearestCompany, type CampusPlan } from './town-plan'
import { campusStreet, plazaPieces } from './town-plaza'

export type { GreenPlot } from './garden-pieces'

// Trees every two slots, lamps every four between them, seats in the gaps the lamps leave.
// The garden is one instanced batch, so a wide campus keeps the same pitch: count costs nothing.
const SLOT_M = 3
const ROW_ALONG_M = 1.6
// Features and corners stand behind the row, where only the plate can take their room.
const DEEP_FROM_M = MIN_BELT_M + 0.4
const FEATURE_M = { along: 8, across: 4 }
const CORNER_M = 4
const PLATE_CLEAR_M = 1

// Centred on a seat: trees at odd slots, lamps and seats taking turns at the even ones.
function roleAt(slot: number): GardenRole {
  const away = Math.abs(slot)
  if (away % 2 === 1) return 'tree'
  return (away / 2) % 2 === 1 ? 'lamp' : 'seat'
}

function rowOf(ground: Ground, side: Side, run: Span, runIndex: number): GreenPlot[] {
  const middle = (run.min + run.max) / 2
  return centredSlots(run, ROW_ALONG_M, SLOT_M).map((slot) => {
    const role = roleAt(slot)
    const rect = onSide(ground.claim, side, middle + slot * SLOT_M, ROW_DEPTH_M, {
      along: ROW_ALONG_M,
      across: ROW_ACROSS_M
    })
    return sidePiece(ground, side, `garden:${side}:${role}:${runIndex}:${slot}`, role, rect)
  })
}

// Clear of the plate and the campus street, and tall enough for a design to stand.
function hasRoom(piece: GreenPlot, ground: Ground): boolean {
  return (
    isClearOfPlate(piece, ground, PLATE_CLEAR_M) && piece.maxHeight >= MIN_LOT_HEIGHT_M.building
  )
}

// All four or none, so every side stays its own mirror.
function cornersOf(ground: Ground): GreenPlot[] {
  const { claim } = ground
  const depth = DEEP_FROM_M + CORNER_M / 2
  const corners = (['north', 'south'] as const).flatMap((side) =>
    [claim.minX + depth, claim.maxX - depth].map((x) => {
      const rect = onSide(claim, side, x, depth, { along: CORNER_M, across: CORNER_M })
      return gardenPiece(`garden:${side}:corner:${x}`, 'corner', rect, {
        facing: side,
        zoneId: null,
        maxHeight: roomOver(rect, ground.site, ground.promenades)
      })
    })
  )
  return levelled(corners)
}

// One per run, centred on it; opposite runs keep theirs only together.
function featuresOf(ground: Ground, corners: readonly Rect[]): GreenPlot[] {
  const depth = DEEP_FROM_M + FEATURE_M.across / 2
  const featureOf = (side: Side, run: Span, runIndex: number): GreenPlot | null => {
    if (run.max - run.min < FEATURE_M.along + RUN_END_CLEAR_M * 2) return null
    const rect = onSide(ground.claim, side, (run.min + run.max) / 2, depth, FEATURE_M)
    const piece = sidePiece(ground, side, `garden:${side}:feature:${runIndex}`, 'feature', rect)
    const isClear = hasRoom(piece, ground) && !corners.some((corner) => overlaps(piece, corner))
    return isClear ? piece : null
  }
  return OPPOSITE_PAIRS.flatMap(([one, other]) =>
    runsOf(one, ground.claim).flatMap((run, runIndex) => {
      const pair = [featureOf(one, run, runIndex), featureOf(other, run, runIndex)]
      return pair[0] && pair[1] ? levelled([pair[0], pair[1]]) : []
    })
  )
}

// The campus garden, laid out from the claim: a row of trees, lamps and seats along the walk
// on every side, an inner avenue and edging, a feature centred on each run and a piece at each
// corner, then the plaza. Only what stands behind the row depends on the plate.
export function campusGreen(floor: FloorGeometry, plan: CampusPlan): GreenPlot[] {
  const site = surveySite(floor)
  const claim = boundsOfZone(plan.claim)
  const middleOf = (side: Side): Rect =>
    onSide(claim, side, isAlongX(side) ? plan.claim.x : plan.claim.z, ROW_DEPTH_M, {
      along: ROW_ALONG_M,
      across: ROW_ACROSS_M
    })
  const ground: Ground = {
    claim,
    site,
    street: campusStreet(plan.claim),
    promenades: plan.promenades,
    zoneIdOf: (side) => nearestCompany(middleOf(side), site.companies)?.id ?? null
  }
  const rows = SIDES.flatMap((side) =>
    runsOf(side, claim).flatMap((run, runIndex) => rowOf(ground, side, run, runIndex))
  )
  // Features keep off the corners' places whether or not the corners have room.
  const corners = cornersOf(ground)
  const hasCorners = corners.every((corner) => hasRoom(corner, ground))
  const features = featuresOf(ground, corners)
  return [
    ...levelled(rows),
    ...avenuesOf(ground, [...features, ...corners]),
    ...features,
    ...(hasCorners ? corners : []),
    ...plazaPieces(plan.claim, site, plan.promenades)
  ]
}
