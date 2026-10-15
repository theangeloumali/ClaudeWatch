import { CompanyGrounds, FloorSlab, LiftAt, ProjectRoom } from '../ZoneArchitecture'
import { box, lit, Parts, type PartSpec } from '../parts'
import type { FloorProps, ZoneProps } from '../types'
import { SAMURAI_MATERIALS as material, SAMURAI_PALETTE } from './palette'

// dry-new: paired data pylons and offset mineral blades replace timber gate geometry.
const ENTRY: readonly PartSpec[] = [
  ...[-1, 1].flatMap((side) => [
    box([side * 3.58, 1.6, 0], [0.22, 3.2, 0.42], material.slate),
    box([side * 2.3, 3.18, 0], [2.85, 0.11, 0.66], material.indigo),
    box([side * 2.42, 3.36, -0.06], [3.1, 0.08, 0.58], material.mineral),
    lit(box([side * 3.58, 1.86, 0.23], [0.07, 1.5, 0.025], material.cyan)),
    box([side * 3.58, 0.055, 0], [0.64, 0.11, 0.76], material.charcoal),
    lit(box([side * 3.15, 1.37, 0.18], [0.15, 0.23, 0.18], material.amber))
  ])
]
const LIFT: readonly PartSpec[] = [
  box([0, 0.03, 0], [1.82, 0.06, 1.82], material.mineral),
  ...[-1, 1].flatMap((side) => [
    box([side * 0.8, 0.66, 0], [0.13, 1.26, 1.54], material.slate),
    box([side * 0.36, 0.64, -0.7], [0.69, 1.2, 0.04], material.indigo),
    lit(box([side * 0.75, 0.83, 0.77], [0.027, 0.23, 0.025], material.cyan))
  ]),
  box([0, 0.65, -0.75], [1.48, 1.24, 0.07], material.charcoal),
  box([0, 1.36, 0], [1.88, 0.13, 1.7], material.mineral),
  lit(box([0, 1.275, 0.65], [1.3, 0.025, 0.08], material.amber))
]

export function SamuraiCompanyZone({ zone }: ZoneProps) {
  return <CompanyGrounds zone={zone} palette={SAMURAI_PALETTE} gate={<Parts parts={ENTRY} />} />
}

export function SamuraiProjectOffice({ zone }: ZoneProps) {
  return <ProjectRoom zone={zone} palette={SAMURAI_PALETTE} />
}

export function SamuraiSlab({ floor }: FloorProps) {
  return <FloorSlab floor={floor} ground={material.slate} lane={material.charcoal} />
}

export function SamuraiElevator({ floor }: FloorProps) {
  return <LiftAt floor={floor} parts={LIFT} />
}
