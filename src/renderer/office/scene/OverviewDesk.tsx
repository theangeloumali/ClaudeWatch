import type { DeskProps, ThemePalette } from '../themes/types'
import { UnitPart } from '../themes/unit-parts'

export function OverviewDesk({
  slot,
  palette
}: Pick<DeskProps, 'slot'> & { palette: ThemePalette }) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.heading, 0]}>
      <UnitPart shape="box" at={[0, 0.55, 0.62]} size={[1.1, 0.08, 0.5]} color={palette.wood} />
      <UnitPart shape="box" at={[0, 0.3, 0.62]} size={[0.15, 0.55, 0.3]} color={palette.stone} />
      <UnitPart shape="box" at={[0, 0.74, 0.8]} size={[0.43, 0.26, 0.05]} color={palette.ink} />
      <UnitPart shape="box" at={[0, 0.325, 0]} size={[0.42, 0.06, 0.4]} color={palette.lacquer} />
      <UnitPart
        shape="box"
        at={[0, 0.51, -0.205]}
        size={[0.36, 0.3, 0.07]}
        color={palette.lacquer}
      />
      <UnitPart shape="box" at={[0, 0.16, 0]} size={[0.09, 0.3, 0.09]} color={palette.stone} />
    </group>
  )
}
