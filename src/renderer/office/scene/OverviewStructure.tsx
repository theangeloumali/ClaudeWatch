import type { FloorGeometry } from '../scene-model'
import type { ThemePalette } from '../themes/types'
import { UnitPart } from '../themes/unit-parts'

export function OverviewStructure({
  floor,
  palette,
  foundation = false
}: {
  floor: FloorGeometry
  palette: ThemePalette
  foundation?: boolean
}) {
  return (
    <>
      {foundation && (
        <UnitPart
          shape="box"
          at={[0, -0.1, 0]}
          size={[floor.width, 0.2, floor.depth]}
          color={palette.floor}
        />
      )}
      <group position={[floor.elevator.x, 0, floor.elevator.z]}>
        <UnitPart shape="box" at={[0, 0.9, 0.5]} size={[2, 1.8, 0.14]} color={palette.stone} />
        <UnitPart shape="box" at={[-0.92, 0.9, 0]} size={[0.14, 1.8, 1]} color={palette.brass} />
        <UnitPart shape="box" at={[0.92, 0.9, 0]} size={[0.14, 1.8, 1]} color={palette.brass} />
      </group>
    </>
  )
}
