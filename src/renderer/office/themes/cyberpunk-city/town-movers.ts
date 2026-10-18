import { box, tube, ball, person, wheel, type CitizenFigure } from '../../citizens/figure-parts'
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

function streetVehicle(body: string, length: number) {
  return [
    box(body, [0.66, 0.28, length], [0, 0.36, 0]),
    box(material.glass, [0.56, 0.22, length * 0.52], [0, 0.6, -length * 0.12]),
    box(material.light, [0.47, 0.04, 0.025], [0, 0.39, length / 2 + 0.015]),
    ...[-1, 1].flatMap((side) =>
      [-1, 1].map((end) =>
        wheel(material.asphalt, 0.16, 0.085, [side * 0.34, 0.18, end * length * 0.31])
      )
    )
  ]
}

export const CYBERPUNK_VEHICLES: readonly VehicleDesign[] = [
  { name: 'electric shuttle', role: 'transit', parts: () => streetVehicle(material.steel, 1.6) },
  {
    name: 'garage supply van',
    role: 'freight',
    parts: () => [
      ...streetVehicle(material.asphalt, 1.25),
      box(material.amber, [0.62, 0.37, 0.6], [0, 0.64, -0.3])
    ]
  },
  { name: 'compact city taxi', role: 'runabout', parts: () => streetVehicle(material.amber, 0.95) }
]
