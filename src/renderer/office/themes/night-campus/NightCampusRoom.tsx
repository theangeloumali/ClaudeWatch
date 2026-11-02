import { useMemo } from 'react'
import type { CampusRoomColors } from '../../logic/campus-colors'
import type { FloorGeometry } from '../../scene-model'
import { floorElevation } from '../../scene/all-floor-model'
import { SHARED_BATCH } from '../../scene/mesh-batches'
import { Parts } from '../parts'
import { BakedMesh } from './BakedMesh'
import { campusSurfaces } from './campus-screens'
import { CAMPUS_MODELS, propModels } from './glb-props'
import {
  campusPropPlacements,
  campusRoomParts,
  campusRoomShell,
  chartPlacement
} from './room-parts'
import { PROP_SCALE } from './room-props'

const GLOW_RADIUS_M = 1.2
// The chart's plot area in its own frame, just proud of the screen face.
const SPARKLINE_AT: [number, number, number] = [
  -0.21 * PROP_SCALE,
  1.52 * PROP_SCALE,
  0.063 * PROP_SCALE
]
const SPARKLINE_SIZE: [number, number, number] = [0.82 * PROP_SCALE, 0.2 * PROP_SCALE, 1]
const GLOW_BATCH = { [SHARED_BATCH]: 'campus-lamp-glow' }
const SPARKLINE_BATCH = { [SHARED_BATCH]: 'campus-sparkline' }

function RoomMotion({ floor }: { floor: FloorGeometry }) {
  const surfaces = campusSurfaces()
  if (!surfaces) return null
  const chart = chartPlacement(floor)
  const lamps = campusPropPlacements(floor).filter((placement) => placement.kind === 'lamp')
  return (
    <>
      {lamps.map((lamp, index) => (
        <mesh
          key={index}
          geometry={surfaces.plane}
          material={surfaces.lampGlow}
          position={[lamp.x, 0.02, lamp.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[GLOW_RADIUS_M * 2, GLOW_RADIUS_M * 2, 1]}
          userData={GLOW_BATCH}
        />
      ))}
      <group position={[chart.x, 0, chart.z]} rotation={[0, chart.yaw, 0]}>
        <mesh
          geometry={surfaces.plane}
          material={surfaces.sparkline}
          position={SPARKLINE_AT}
          scale={SPARKLINE_SIZE}
          userData={SPARKLINE_BATCH}
        />
      </group>
    </>
  )
}

// Kenney models where they decoded; the part-built room otherwise, so a bad asset never blanks it.
export function NightCampusRoom({
  floor,
  colors
}: {
  floor: FloorGeometry
  colors: CampusRoomColors
}) {
  const room = useMemo(() => {
    if (!CAMPUS_MODELS) return { parts: campusRoomParts(floor, colors), props: [] }
    const props = campusPropPlacements(floor).map((placement) => ({
      placement,
      models: propModels(placement.kind)
    }))
    return { parts: campusRoomShell(floor, colors), props }
  }, [floor, colors])
  return (
    <group position={[0, floorElevation(floor), 0]}>
      <Parts parts={room.parts} />
      {room.props.map(({ placement, models }, index) =>
        // A placement's parts are already in room space; its models sit in the prop's own frame.
        models.length > 0 ? (
          <group
            key={index}
            position={[placement.x, 0, placement.z]}
            rotation={[0, placement.yaw, 0]}
          >
            {models.map((model, part) => (
              <BakedMesh key={part} {...model} />
            ))}
          </group>
        ) : (
          <Parts key={index} parts={placement.parts} />
        )
      )}
      <RoomMotion floor={floor} />
    </group>
  )
}
