import { FACADE_LAYER_STEP_M } from '../../scene/building-window-parts'
import { useMemo } from 'react'
import type { LoungeGeometry } from '../../scene-model'
import { firstClear, spotAt, type Footprint } from '../lounge-layout'
import { box, Parts, type PartSpec } from '../parts'
import type { LoungeProps } from '../types'
import { CORPORATE_LOUNGE_CHAIR_PARTS, CORPORATE_LOW_PLANTER_PARTS } from './office-furniture'
import { CORPORATE_MATERIALS as materials, CORPORATE_PALETTE as palette } from './palette'

const EDGE_SPOTS: readonly [number, number][] = [
  [-1, 1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [0, 1],
  [0, -1]
]
const WALL_INSET = 0.15

function clearLoungeSpot({
  lounge,
  width,
  depth,
  taken = []
}: {
  lounge: LoungeGeometry
  width: number
  depth: number
  taken?: readonly Footprint[]
}): Footprint | null {
  if (width + WALL_INSET * 2 > lounge.width || depth + WALL_INSET * 2 > lounge.depth) return null
  return firstClear(
    lounge,
    EDGE_SPOTS.map(([across, along]) => spotAt(lounge, across, along, width, depth)),
    taken
  )
}

// dry-new: compact coffee furniture replaces billiards while retaining the shared aisle planner.
function coffeeTableParts({ x, z, width, depth }: Footprint): PartSpec[] {
  return [
    ...[-1, 1].flatMap((across) =>
      [-1, 1].map((along) =>
        box(
          [x + across * (width / 2 - 0.09), 0.16, z + along * (depth / 2 - 0.09)],
          [0.05, 0.3, 0.05],
          materials.frame
        )
      )
    ),
    box([x, 0.33, z], [width, 0.04, depth], palette.wood),
    box([x - 0.16, 0.36, z], [0.23, 0.02, 0.17], palette.paper)
  ]
}

function coffeeCounterParts({ x, z, width, depth }: Footprint): PartSpec[] {
  return [
    box([x, 0.33, z], [width, 0.66, depth], materials.facade),
    box([x, 0.68, z], [width, 0.04, depth], palette.wood),
    box(
      [x, 0.3, z + depth / 2 - 0.004 + FACADE_LAYER_STEP_M],
      [0.018, 0.54, 0.008],
      materials.frame
    ),
    box([x - 0.26, 0.79, z], [0.26, 0.18, 0.24], materials.frame),
    box([x - 0.26, 0.8, z + 0.124], [0.18, 0.08, 0.012], materials.screen),
    box([x + 0.26, 0.75, z], [0.2, 0.1, 0.16], palette.paper)
  ]
}

export function corporateLoungeDecorParts(lounge: LoungeGeometry): PartSpec[] {
  const table = clearLoungeSpot({ lounge, width: 0.9, depth: 0.55 })
  const occupied = table ? [table] : []
  const counter = clearLoungeSpot({ lounge, width: 1.2, depth: 0.42, taken: occupied })
  const planter = clearLoungeSpot({
    lounge,
    width: 0.52,
    depth: 0.52,
    taken: counter ? [...occupied, counter] : occupied
  })
  return [
    ...(table ? coffeeTableParts(table) : []),
    ...(counter ? coffeeCounterParts(counter) : []),
    ...(planter
      ? CORPORATE_LOW_PLANTER_PARTS.map(
          (part) =>
            ({
              ...part,
              at: [part.at[0] + planter.x, part.at[1], part.at[2] + planter.z]
            }) satisfies PartSpec
        )
      : [])
  ]
}

export function CorporateLounge({ lounge }: LoungeProps) {
  const decor = useMemo(() => corporateLoungeDecorParts(lounge), [lounge])
  return (
    <>
      <Parts
        parts={[
          box([lounge.x, 0.014, lounge.z], [lounge.width, 0.025, lounge.depth], palette.floor)
        ]}
      />
      {lounge.seats.map((seat) => (
        <group
          key={seat.slotId}
          name="lounge-seat"
          position={[seat.x, 0, seat.z]}
          rotation={[0, seat.heading, 0]}
        >
          <Parts parts={CORPORATE_LOUNGE_CHAIR_PARTS} />
        </group>
      ))}
      <group name="lounge-decor">
        <Parts parts={decor} />
      </group>
    </>
  )
}
