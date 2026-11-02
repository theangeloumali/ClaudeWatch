import { Parts, type PartSpec } from '../parts'
import { CORPORATE_DESK_PARTS } from '../corporate-city/office-furniture'
import { CORPORATE_PALETTE } from '../corporate-city/palette'
import type { DeskProps } from '../types'
import { NIGHT_CAMPUS_PALETTE } from './palette'

// The corporate desk with a white top, so desks read against the saturated room floors.
export const CAMPUS_DESK_PARTS: readonly PartSpec[] = CORPORATE_DESK_PARTS.map((part) =>
  part.color === CORPORATE_PALETTE.wood ? { ...part, color: NIGHT_CAMPUS_PALETTE.wood } : part
)

export function CampusDesk({ slot }: DeskProps) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.heading, 0]}>
      <Parts parts={CAMPUS_DESK_PARTS} />
    </group>
  )
}
