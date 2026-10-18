import { CompanyGrounds, FloorSlab, LiftAt, ProjectRoom } from '../ZoneArchitecture'
import { box, Parts, type PartSpec } from '../parts'
import type { FloorProps, ZoneProps } from '../types'
import { CORPORATE_LOW_PLANTER_PARTS } from './office-furniture'
import { CORPORATE_MATERIALS as materials, CORPORATE_PALETTE as palette } from './palette'

// dry-new: square metal pylons and an integrated reception kiosk replace ceremonial gates.
const ENTRY_PARTS: readonly PartSpec[] = [
  ...[-3.55, 3.55].map((across) => box([across, 1.93, 0], [0.14, 3.86, 0.22], materials.frame)),
  box([0, 3.6, -0.07], [7.24, 1.2, 0.12], materials.frame),
  box([3.55, 0.46, 0.1], [0.64, 0.92, 0.34], materials.facade),
  box([3.55, 0.94, 0.1], [0.7, 0.04, 0.38], palette.wood),
  box([3.55, 1.04, 0.12], [0.22, 0.16, 0.045], materials.screen)
]
const LIFT_PARTS: readonly PartSpec[] = [
  box([0, 0.03, 0], [1.8, 0.06, 1.8], materials.concrete),
  ...[-0.79, 0.79].map((across) => box([across, 0.67, 0], [0.12, 1.28, 1.52], materials.facade)),
  box([0, 0.65, -0.74], [1.48, 1.24, 0.08], materials.frame),
  ...[-0.36, 0.36].map((across) => box([across, 0.63, -0.69], [0.68, 1.18, 0.035], palette.brass)),
  box([0, 1.35, 0], [1.84, 0.12, 1.64], materials.frame),
  box([0, 1.275, 0.6], [1.36, 0.025, 0.08], materials.light),
  box([0.79, 0.72, 0.77], [0.065, 0.23, 0.025], materials.frame),
  box([0.79, 0.77, 0.789], [0.035, 0.035, 0.018], materials.light),
  box([0.79, 0.67, 0.789], [0.035, 0.035, 0.018], materials.screen)
]
const PROJECT_PALETTE = { ...palette, paper: materials.facade }

export function CorporateCompanyZone({ zone }: ZoneProps) {
  return (
    <CompanyGrounds
      zone={zone}
      palette={palette}
      gate={
        <>
          <Parts parts={ENTRY_PARTS} />
          {[-4.1, 4.1].map((across) => (
            <group key={across} position={[across, 0, 0]}>
              <Parts parts={CORPORATE_LOW_PLANTER_PARTS} />
            </group>
          ))}
        </>
      }
    />
  )
}

export function CorporateProjectOffice({ zone }: ZoneProps) {
  return (
    // Only Y changes: the shared walls retain every boundary and doorway in XZ.
    <group scale={[1, 0.6, 1]}>
      <ProjectRoom zone={zone} palette={PROJECT_PALETTE} />
    </group>
  )
}

export function CorporateSlab({ floor }: FloorProps) {
  return <FloorSlab floor={floor} ground={materials.concrete} lane={materials.sidewalk} />
}

export function CorporateElevator({ floor }: FloorProps) {
  return <LiftAt floor={floor} parts={LIFT_PARTS} />
}
