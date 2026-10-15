import type { ThreeEvent } from '@react-three/fiber'
import type { FloorGeometry, ZoneGeometry } from '../scene-model'
import { floorElevation } from './all-floor-model'

const FLAT = -Math.PI / 2
// Just above each zone's plate; projects sit higher so the innermost zone is hit first.
const PICK_Y = { company: 0.02, project: 0.03 }

// A pan ends with a click on the plate under the pointer; only a still click counts.
const CLICK_SLOP_PX = 4

interface PickerProps {
  zone: ZoneGeometry
  y: number
  onFly: (zoneId: string) => void
  onMiss: () => void
  onWalk?: (point: { x: number; z: number }) => void
  onEditTarget?: (target: SceneEditTarget) => void
  buildingId: string
  onFocus?: () => void
}

export interface SceneEditTarget {
  kind: 'room' | 'building'
  id: string
  clientX: number
  clientY: number
}

export function editSceneTarget(
  event: ThreeEvent<MouseEvent>,
  options: {
    kind: SceneEditTarget['kind']
    id: string
    onEditTarget?: (target: SceneEditTarget) => void
  }
): void {
  event.nativeEvent.preventDefault()
  // Plain right-mouse gestures belong to orbit; editing needs an explicit modifier.
  if (!event.nativeEvent.shiftKey) return
  if (!options.onEditTarget || !isStillClick(event)) return
  event.stopPropagation()
  options.onEditTarget({
    kind: options.kind,
    id: options.id,
    clientX: event.clientX,
    clientY: event.clientY
  })
}

// One pointer at a time, and kept outside the component so a re-render mid-click cannot reset it.
const pressed = { x: 0, y: 0 }

interface Press {
  clientX: number
  clientY: number
}

export function trackPress(event: Press): void {
  pressed.x = event.clientX
  pressed.y = event.clientY
}

export function isStillClick(event: Press): boolean {
  return Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= CLICK_SLOP_PX
}

function Picker({
  zone,
  y,
  onFly,
  onMiss,
  onWalk,
  onEditTarget,
  buildingId,
  onFocus
}: PickerProps) {
  return (
    <mesh
      position={[zone.x, y, zone.z]}
      rotation={[FLAT, 0, 0]}
      onPointerDown={trackPress}
      // The plates catch every click on a zone's floor, so the canvas never reports a miss there.
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (!isStillClick(event)) return
        event.stopPropagation()
        if (!onWalk) {
          onFocus?.()
          return onMiss()
        }
        // The innermost plate takes the click, so the player is sent once.
        onWalk(event.point)
      }}
      onDoubleClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()
        onFly(zone.id)
      }}
      onContextMenu={(event: ThreeEvent<MouseEvent>) =>
        editSceneTarget(event, { kind: 'building', id: buildingId, onEditTarget })
      }
    >
      <planeGeometry args={[zone.width, zone.depth]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

// Invisible plates over company and project zones: double-click flies the camera to that zone,
// a click on bare floor clears the selection, or with `onWalk` sends the player there instead.
// Keyboard users use the Offices panel and Escape.
export function ZonePickers({
  floor,
  onFly,
  onMiss,
  onWalk,
  onEditTarget,
  onFocusFloor
}: {
  floor: FloorGeometry
  onFly: (zoneId: string) => void
  onMiss: () => void
  onWalk?: (point: { x: number; z: number }) => void
  onEditTarget?: (target: SceneEditTarget) => void
  onFocusFloor?: (floorId: string) => void
}) {
  const y = floorElevation(floor)
  const buildingId =
    'buildingId' in floor && typeof floor.buildingId === 'string' ? floor.buildingId : floor.floorId
  const contextProps = {
    onEditTarget,
    buildingId,
    onFocus: onFocusFloor ? () => onFocusFloor(floor.floorId) : undefined
  }
  return (
    <group>
      {onEditTarget && (
        <>
          <mesh
            position={[floor.x, y + 0.01, floor.z]}
            rotation={[FLAT, 0, 0]}
            onPointerDown={trackPress}
            onContextMenu={(event: ThreeEvent<MouseEvent>) =>
              editSceneTarget(event, { kind: 'building', id: buildingId, onEditTarget })
            }
          >
            <planeGeometry args={[floor.width, floor.depth]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          {floor.rooms.map((room) => (
            <mesh
              key={room.id}
              position={[room.x, y + 0.04, room.z]}
              rotation={[FLAT, 0, 0]}
              onPointerDown={trackPress}
              onContextMenu={(event: ThreeEvent<MouseEvent>) =>
                editSceneTarget(event, { kind: 'room', id: room.id, onEditTarget })
              }
            >
              <planeGeometry args={[room.width, room.depth]} />
              <meshBasicMaterial visible={false} />
            </mesh>
          ))}
        </>
      )}
      {floor.zones
        .filter((zone) => zone.kind === 'company')
        .flatMap((company) => [
          <Picker
            key={company.id}
            zone={company}
            y={y + PICK_Y.company}
            {...contextProps}
            onFly={onFly}
            onMiss={onMiss}
            onWalk={onWalk}
          />,
          ...company.children
            .filter((child) => child.kind === 'project')
            .map((project) => (
              <Picker
                key={project.id}
                zone={project}
                y={y + PICK_Y.project}
                {...contextProps}
                onFly={onFly}
                onMiss={onMiss}
                onWalk={onWalk}
              />
            ))
        ])}
    </group>
  )
}
