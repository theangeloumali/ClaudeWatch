import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Euler, Matrix4, Vector3, type Group } from 'three'
import type { FloorGeometry } from '../scene-model'
import type { PlacedLot } from '../themes/lot-kit'
import { LotFill } from '../themes/LotFill'
import { gapBetween } from '../themes/lot-math'
import type { PartSpec } from '../themes/parts'
import { floorElevation } from './all-floor-model'
import { BatchedScene } from './BatchedScene'

const LOCAL_CUTAWAY_REACH_METRES = 14
const STREET_LEVEL_HEIGHT_METRES = 2.4

// Nearby upper bands yield to inspection; street-level architecture never disappears.
export function CitySceneryCutaway({
  placed,
  floor,
  revision,
  isInspecting
}: {
  placed: readonly PlacedLot[]
  floor: FloorGeometry
  revision: string
  isInspecting: boolean
}) {
  const elevation = floorElevation(floor)
  const height = Math.max(STREET_LEVEL_HEIGHT_METRES, elevation + 1.2)
  const batchRevision = JSON.stringify([
    revision,
    floor.floorId,
    floor.x,
    floor.z,
    floor.width,
    floor.depth,
    height
  ])
  const sectors = useMemo(
    () =>
      [
        ...Map.groupBy(placed, ({ lot }) => {
          if (gapBetween(lot, floor) > LOCAL_CUTAWAY_REACH_METRES) return 'far'
          const dx = lot.x - floor.x
          const dz = lot.z - floor.z
          if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'east' : 'west'
          return dz > 0 ? 'south' : 'north'
        })
      ].map(([side, lots]) => {
        const bands = side === 'far' ? [] : lots.map((lot) => splitSceneryHeight(lot, height))
        return {
          side,
          lower: side === 'far' ? lots : bands.map((band) => band.lower),
          upper: bands.map((band) => band.upper)
        }
      }),
    [placed, floor, height]
  )
  const roots = useRef(new Map<string, Group>())
  const cameraPosition = useMemo(() => new Vector3(), [])
  useFrame(({ camera }) => {
    camera.getWorldPosition(cameraPosition)
    for (const [side, root] of roots.current) {
      const isFront =
        (side === 'east' && cameraPosition.x > floor.x) ||
        (side === 'west' && cameraPosition.x < floor.x) ||
        (side === 'south' && cameraPosition.z > floor.z) ||
        (side === 'north' && cameraPosition.z < floor.z)
      root.visible = !isInspecting || !isFront
    }
  })
  return (
    <>
      {sectors.map(({ side, lower, upper }) => (
        <group key={side}>
          <BatchedScene revision={`${batchRevision}:${side}:lower`} isStatic>
            <LotFill placed={lower} />
          </BatchedScene>
          {upper.length > 0 && (
            <group
              ref={(root) => {
                if (root) roots.current.set(side, root)
                else roots.current.delete(side)
              }}
            >
              <BatchedScene revision={`${batchRevision}:${side}:upper`} isStatic>
                <LotFill placed={upper} />
              </BatchedScene>
            </group>
          )}
        </group>
      ))}
    </>
  )
}

// dry-new: static batching cannot truncate a solid wall that straddles the inspection height.
function splitSceneryHeight(placed: PlacedLot, height: number) {
  const cutoff = (height - placed.at[1]) / placed.scale
  const lower: PartSpec[] = []
  const upper: PartSpec[] = []
  for (const part of placed.parts) {
    const isUpright = !part.rotation?.[0] && !part.rotation?.[2]
    const rotation = new Matrix4().makeRotationFromEuler(new Euler(...(part.rotation ?? [0, 0, 0])))
    const verticalReach =
      (Math.abs(rotation.elements[1] * part.size[0]) +
        Math.abs(rotation.elements[5] * part.size[1]) +
        Math.abs(rotation.elements[9] * part.size[2])) /
      2
    const bottom = part.at[1] - verticalReach
    const top = part.at[1] + verticalReach
    if (top <= cutoff) lower.push(part)
    else if (
      bottom >= cutoff ||
      !isUpright ||
      (part.shape !== 'box' && part.shape !== 'cylinder')
    ) {
      upper.push(part)
    } else {
      lower.push({
        ...part,
        at: [part.at[0], (bottom + cutoff) / 2, part.at[2]],
        size: [part.size[0], cutoff - bottom, part.size[2]]
      })
      upper.push({
        ...part,
        at: [part.at[0], (cutoff + top) / 2, part.at[2]],
        size: [part.size[0], top - cutoff, part.size[2]]
      })
    }
  }
  return { lower: { ...placed, parts: lower }, upper: { ...placed, parts: upper } }
}
