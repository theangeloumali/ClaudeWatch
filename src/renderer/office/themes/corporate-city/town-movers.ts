import { ball, box, tube, type CitizenFigure, type FigurePart } from '../../citizens/figure-parts'
import { extrudedVehicle, type VehicleDress } from '../../citizens/vehicle-body'
import type { VehicleDesign } from '../../town/town-dress'
import {
  CORPORATE_MATERIALS as MATERIALS,
  HUMAN_CLOTHING_COLORS,
  HUMAN_HAIR_COLORS,
  HUMAN_SKIN_TONES
} from './palette'

// dry-new: the shared person builder wears a robe; these adults have trousers and unbadged coats.
function adult(dress: Record<'coat' | 'trousers' | 'hair' | 'skin', string>): FigurePart[] {
  return [
    ...[-1, 1].flatMap((side) => [
      box(MATERIALS.shoe, [0.13, 0.09, 0.26], [side * 0.095, 0.045, 0.05]),
      box(dress.trousers, [0.12, 0.41, 0.14], [side * 0.095, 0.275, 0]),
      box(dress.coat, [0.1, 0.39, 0.17], [side * 0.25, 0.67, 0])
    ]),
    box(dress.coat, [0.39, 0.42, 0.21], [0, 0.68, 0]),
    ball(dress.skin, 0.12, [0, 1.025, 0]),
    tube(dress.hair, [0.1, 0.12, 0.055], [0, 1.125, -0.005]),
    box(dress.skin, [0.05, 0.065, 0.05], [0, 1.01, 0.125])
  ]
}

export const CORPORATE_CITIZENS: readonly CitizenFigure[] = [
  {
    name: 'city commuter',
    parts: () =>
      adult({
        coat: HUMAN_CLOTHING_COLORS[0],
        trousers: MATERIALS.frame,
        hair: HUMAN_HAIR_COLORS[1],
        skin: HUMAN_SKIN_TONES[3]
      })
  },
  {
    name: 'neighborhood reader',
    parts: () =>
      adult({
        coat: HUMAN_CLOTHING_COLORS[1],
        trousers: MATERIALS.roof,
        hair: HUMAN_HAIR_COLORS[3],
        skin: HUMAN_SKIN_TONES[1]
      })
  },
  {
    name: 'studio visitor',
    parts: () =>
      adult({
        coat: HUMAN_CLOTHING_COLORS[2],
        trousers: MATERIALS.frame,
        hair: HUMAN_HAIR_COLORS[0],
        skin: HUMAN_SKIN_TONES[5]
      })
  },
  {
    name: 'park neighbor',
    parts: () =>
      adult({
        coat: HUMAN_CLOTHING_COLORS[4],
        trousers: MATERIALS.roof,
        hair: HUMAN_HAIR_COLORS[2],
        skin: HUMAN_SKIN_TONES[0]
      })
  }
]

// Extruded bodies sized to the lanes and to each role's zebra hold (NOSE_M).
const VEHICLE_DRESS: VehicleDress = {
  paint: MATERIALS.civic,
  glass: MATERIALS.glass,
  trim: MATERIALS.frame,
  tyre: MATERIALS.road,
  rim: MATERIALS.concrete,
  headlight: MATERIALS.light,
  taillight: MATERIALS.culture
}

const transit = () => extrudedVehicle('bus', VEHICLE_DRESS, 3.7)
const freight = () =>
  extrudedVehicle(
    'van',
    { ...VEHICLE_DRESS, paint: MATERIALS.workshop, cargo: MATERIALS.facade },
    2.95
  )
const runabout = () =>
  extrudedVehicle('hatchback', { ...VEHICLE_DRESS, paint: MATERIALS.residential }, 2.05)

export const CORPORATE_VEHICLES: readonly VehicleDesign[] = [
  { name: 'avenue electric bus', role: 'transit', parts: transit },
  { name: 'district delivery van', role: 'freight', parts: freight },
  { name: 'compact city runabout', role: 'runabout', parts: runabout }
]
