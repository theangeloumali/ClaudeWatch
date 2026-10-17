import { box, tube, ball, person, type CitizenFigure } from '../../citizens/figure-parts'
import { extrudedVehicle, type VehicleDress } from '../../citizens/vehicle-body'
import type { VehicleDesign } from '../../town/town-dress'
import { CYBERPUNK_MATERIALS as material } from './palette'

const citizenDress = { robe: material.asphalt, coat: material.steel, hair: material.hair }
export const CYBERPUNK_CITIZENS: readonly CitizenFigure[] = [
  {
    name: 'market courier',
    parts: () => [
      ...person(citizenDress),
      box(material.amber, [0.22, 0.28, 0.1], [0, 0.62, -0.16]),
      box(material.hair, [0.06, 0.025, 0.02], [0, 0.9, 0.11])
    ]
  },
  {
    name: 'garage technician',
    parts: () => [
      ...person({ ...citizenDress, coat: material.amber }),
      box(material.cyan, [0.17, 0.04, 0.025], [0, 0.93, 0.12])
    ]
  },
  {
    name: 'street service robot',
    parts: () => [
      tube(material.steel, [0.12, 0.14, 0.48], [0, 0.3, 0]),
      box(material.asphalt, [0.27, 0.31, 0.18], [0, 0.65, 0]),
      ball(material.steel, 0.105, [0, 0.94, 0]),
      box(material.cyan, [0.14, 0.04, 0.02], [0, 0.94, 0.1]),
      box(material.asphalt, [0.08, 0.1, 0.14], [-0.07, 0.05, 0.02]),
      box(material.asphalt, [0.08, 0.1, 0.14], [0.07, 0.05, 0.02])
    ]
  },
  {
    name: 'neon night vendor',
    parts: () => [
      ...person({ ...citizenDress, coat: material.cyan }),
      box(material.amber, [0.3, 0.04, 0.17], [0, 1.03, 0]),
      box(material.light, [0.18, 0.1, 0.18], [0.18, 0.58, 0.12])
    ]
  }
]

// Extruded bodies sized to the lanes and to each role's zebra hold (NOSE_M).
const VEHICLE_DRESS: VehicleDress = {
  paint: material.steel,
  glass: material.glass,
  trim: material.graphite,
  tyre: material.asphalt,
  rim: material.steel,
  headlight: material.light,
  taillight: material.pink
}

export const CYBERPUNK_VEHICLES: readonly VehicleDesign[] = [
  {
    name: 'electric shuttle',
    role: 'transit',
    parts: () => extrudedVehicle('bus', VEHICLE_DRESS, 2.4)
  },
  {
    name: 'garage supply van',
    role: 'freight',
    parts: () =>
      extrudedVehicle(
        'van',
        { ...VEHICLE_DRESS, paint: material.asphalt, cargo: material.amber },
        1.9
      )
  },
  {
    name: 'compact city taxi',
    role: 'runabout',
    parts: () => extrudedVehicle('hatchback', { ...VEHICLE_DRESS, paint: material.amber }, 1.5)
  }
]
