import type { CitizenFigure } from '../citizens/figure-parts'
import { SIDE_NORMAL } from '../logic/room-layout'
import type { BuildingDesign, PlacedLot, Plot, PropDesign } from '../themes/lot-kit'
import { draw, hashOf } from '../themes/lot-math'
import type { PartSpec } from '../themes/parts'
import type { Lot } from '../themes/surroundings'
import type { TownLot } from './town-lots'
import type { TownDistrict } from './town-zones'

// The ground a zone design is built on, and the colour its roof or awning takes.
export interface ZonePlot extends Plot {
  accent: string
}

export interface ZoneDesign extends Omit<BuildingDesign, 'build'> {
  zones: readonly TownDistrict[]
  // Origin at the lot's centre on the ground; the front faces +z.
  build: (plot: ZonePlot) => PartSpec[]
  isLandmark?: true
  // Its chimneys among the parts `build` made: steam leaves the top of each.
  vents?: (parts: readonly PartSpec[]) => readonly PartSpec[]
}

export interface ZoneProp extends PropDesign {
  zones: readonly TownDistrict[]
}

interface ZoneLook {
  accent: string
  ground: string
}

export type VehicleRole = 'transit' | 'freight' | 'runabout'
export interface VehicleDesign extends CitizenFigure {
  role: VehicleRole
}

// Named by every theme, drawn by nothing since the campus garden went.
type GardenRole = 'tree' | 'lamp' | 'seat' | 'feature' | 'corner' | 'plazaPair' | 'innerTree'

// A theme's whole town, as data: one shared view draws every theme from it.
export interface TownDress {
  designs: readonly ZoneDesign[]
  props: readonly ZoneProp[]
  looks: Record<TownDistrict, ZoneLook>
  roads: { carriageway: string; sidewalk: string; promenade: string }
  citizens: readonly CitizenFigure[]
  vehicles: readonly VehicleDesign[]
  // Absent: each role takes the first prop or design whose name fits it.
  garden?: Record<GardenRole, string>
}

// What a lot must say to be dressed: a town lot does, and so does a plot of the campus green.
export type DressableLot = Lot & Pick<TownLot, 'zone' | 'facing' | 'isLandmark'>

// The lot's own seed draws 0 to 4 are spent elsewhere; lots have always drawn their height fifth.
const HEIGHT_DRAW = 5

// A theme with a gap still fills every lot: its zone's designs, else its homes, else anything.
function poolFor<Design extends { zones: readonly TownDistrict[] }>(
  designs: readonly Design[],
  zone: TownDistrict
): readonly Design[] {
  const ofZone = designs.filter((design) => design.zones.includes(zone))
  if (ofZone.length > 0) return ofZone
  const homes = designs.filter((design) => design.zones.includes('residential'))
  return homes.length > 0 ? homes : designs
}

// Every lot shuffles the pool its own way and takes the first that fits, so it changes design
// only when its own design stops fitting, never because another one came into reach.
function firstFitting<Design extends { name: string }>(
  pool: readonly Design[],
  seed: number,
  heightOf: (design: Design) => number,
  room: number
): Design | undefined {
  // Mixed through `draw`: neighbouring lots' seeds share their high bits, and the raw XOR then
  // puts the same design first on nearly every lot of a street.
  const turnOf = (design: Design): number => draw((hashOf(design.name) ^ seed) >>> 0, 0)
  const shuffled = [...pool].sort((a, b) => turnOf(a) - turnOf(b))
  const lowest = [...pool].sort((a, b) => heightOf(a) - heightOf(b)).at(0)
  return shuffled.find((design) => heightOf(design) <= room) ?? lowest
}

// What stands on a lot: picked from its zone and seed, built to the room it has, with its front
// turned to the street. In the form the shared lot renderer (themes/LotFill.tsx) draws.
export function dressLot(lot: DressableLot, base: number, dress: TownDress): PlacedLot {
  const room = lot.maxHeight - base
  const normal = SIDE_NORMAL[lot.facing]
  const isSideways = normal.z === 0
  const alongFront = isSideways ? lot.depth : lot.width
  const frontToBack = isSideways ? lot.width : lot.depth
  const placed = {
    lot,
    key: lot.id,
    at: [lot.x, base, lot.z] satisfies PlacedLot['at'],
    // The quarter turn about y that points a design's +z front the way the lot faces.
    turn: Math.atan2(normal.x, normal.z)
  }

  if (lot.kind === 'prop') {
    const prop = firstFitting(
      poolFor(dress.props, lot.zone),
      lot.seed,
      (each) => each.size[1],
      room
    )
    if (!prop) return { ...placed, design: '', scale: 1, parts: [] }
    const [length, height, reach] = prop.size
    const scale = Math.min(1, room / height, alongFront / length, frontToBack / reach)
    return { ...placed, design: prop.name, scale, parts: prop.parts }
  }

  const ordinary = dress.designs.filter((design) => !design.isLandmark)
  const landmarks = dress.designs.filter(
    (design) => design.isLandmark && design.zones.includes(lot.zone)
  )
  const minOf = (design: ZoneDesign): number => design.height.min
  // A landmark lot too low for its zone's landmark is dressed like its neighbours.
  const landmark = lot.isLandmark
    ? firstFitting(
        landmarks.filter((each) => minOf(each) <= room),
        lot.seed,
        minOf,
        room
      )
    : undefined
  const pool = poolFor(ordinary.length > 0 ? ordinary : dress.designs, lot.zone)
  const design = landmark ?? firstFitting(pool, lot.seed, minOf, room)
  if (!design) return { ...placed, design: '', scale: 1, parts: [] }
  const { min, max } = design.height
  const plot: ZonePlot = {
    width: alongFront,
    depth: frontToBack,
    height: Math.min(room, min + (max - min) * draw(lot.seed, HEIGHT_DRAW)),
    seed: lot.seed,
    accent: dress.looks[lot.zone].accent
  }
  return { ...placed, design: design.name, scale: 1, parts: design.build(plot) }
}
