import { SHARED_BATCH } from '../../scene/mesh-batches'
import { Parts, type PartSpec } from '../parts'
import { CORPORATE_DESK_PARTS } from '../corporate-city/office-furniture'
import { CORPORATE_PALETTE } from '../corporate-city/palette'
import type { DeskProps } from '../types'
import { WORKSTATIONS } from '../workstations'
import { BakedMesh } from './BakedMesh'
import { campusSurfaces } from './campus-screens'
import { CAMPUS_MODELS, deskModelBoxes, type PlacedModel } from './glb-props'
import { NIGHT_CAMPUS_PALETTE } from './palette'

// The corporate desk with a white top, so desks read against the saturated room floors.
export const CAMPUS_DESK_PARTS: readonly PartSpec[] = CORPORATE_DESK_PARTS.map((part) =>
  part.color === CORPORATE_PALETTE.wood ? { ...part, color: NIGHT_CAMPUS_PALETTE.wood } : part
)

const DESK_MODELS: readonly PlacedModel[] = Object.entries(deskModelBoxes()).flatMap(
  ([kind, box]) => {
    const part = CAMPUS_MODELS?.furniture.get(kind)
    return part ? [{ part, box }] : []
  }
)

const { screen, width, height } = WORKSTATIONS.corporate
// Just behind the plane the live screen draws on at close zoom, so that one stays in front.
const SCREEN_AT: [number, number, number] = [screen[0], screen[1], screen[2] + 0.003]
const WORKING_BATCH = { [SHARED_BATCH]: 'campus-code-working' }
const IDLE_BATCH = { [SHARED_BATCH]: 'campus-code-idle' }

// The session's own desk scrolls code; a guest desk, or a room with no session, sits dim and still.
function DeskScreen({ isWorking }: { isWorking: boolean }) {
  const surfaces = campusSurfaces()
  if (!surfaces) return null
  return (
    <mesh
      geometry={surfaces.plane}
      material={isWorking ? surfaces.workingScreen : surfaces.idleScreen}
      position={SCREEN_AT}
      rotation={[0, Math.PI, 0]}
      scale={[width, height, 1]}
      userData={isWorking ? WORKING_BATCH : IDLE_BATCH}
    />
  )
}

export function CampusDesk({ room, slot }: DeskProps) {
  const isWorking = room.sessionKey !== null && slot.slotId === 'desk_main'
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.heading, 0]}>
      {DESK_MODELS.length > 0 ? (
        DESK_MODELS.map((model, index) => <BakedMesh key={index} {...model} />)
      ) : (
        <Parts parts={CAMPUS_DESK_PARTS} />
      )}
      <DeskScreen isWorking={isWorking} />
    </group>
  )
}
