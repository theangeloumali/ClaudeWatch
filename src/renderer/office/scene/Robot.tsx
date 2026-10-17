import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type ReactElement } from 'react'
import type { Group } from 'three'
import { AGENT_SCALE, SUBAGENT_SCALE } from '../../../shared/office/figure-scale'
import { DEPARTURE_FADE_MS, type AgentView } from '../../../shared/office/types'
import { livePose, officePoses } from '../../office-live/pose-store'
import type { FloorGeometry } from '../scene-model'
import { approach, approachAngle, moodFor, robotPose } from '../logic/character-pose'
import type { ThemeZoneGroup } from '../logic/office-themes'
import { getTheme } from '../themes/registry'
import { applyModelPose, useRobotRig } from '../themes/rig'
import type { OfficeTheme } from '../themes/types'
import { SHARED_BATCH } from './mesh-batches'
import { blobShadowTexture } from './textures'
import { physicalFloorId } from './all-floor-model'
import { OverviewWorker } from './OverviewWorker'
import { applyHumanPose } from '../themes/corporate-city/human-pose'
import { workerSeats, workerSeatPresence, type WorkerSeats } from './worker-seat-presence'

const MOVE_RATE = 5
const TURN_RATE = 6
const MOVING_EPSILON = 0.05
// Merged shadows sort as one object, so they are drawn before every other see-through part.
const SHADOW_BATCH = { [SHARED_BATCH]: 'agent-shadow' }
const SHADOW_RENDER_ORDER = -1

interface RobotProps {
  theme: OfficeTheme
  rosterIndex: number
  agent: AgentView
  isSelected: boolean
  isSpeaking: boolean
  isReducedMotion: boolean
  onSelect: (agentKey: string) => void
  onFly: (agentKey: string) => void
  motions?: Map<string, RobotMotion>
  isOverview?: boolean
  seats?: WorkerSeats
}

// dry-new: retained render poses prevent a presence change between crews from teleporting a worker.
export interface RobotMotion {
  x: number
  y: number
  z: number
  heading: number
  travelDistance: number
}

// Batched robot parts share opaque materials, so a departing robot fades by shrinking away over
// the sim's fade; reduced motion skips the animation and the robot simply goes (seating-4).
export function presenceAfter(
  presence: number,
  agent: Pick<AgentView, 'fade'>,
  delta: number,
  isReducedMotion: boolean
): number {
  const target = agent.fade === undefined ? 1 : 0
  if (isReducedMotion) return target
  const step = (delta * 1000) / DEPARTURE_FADE_MS
  return target > presence ? Math.min(target, presence + step) : Math.max(target, presence - step)
}

// An arrival mounts while still fading in: it starts at nothing and grows, never pops then shrinks.
export function presenceAtMount(agent: Pick<AgentView, 'fade'>): number {
  return agent.fade === undefined ? 1 : 0
}

function phaseFor(key: string): number {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return (hash % 1000) / 1000
}

export function Robot({
  agent,
  theme,
  rosterIndex,
  isSelected,
  isSpeaking,
  isReducedMotion,
  onSelect,
  onFly,
  motions,
  isOverview = false,
  seats
}: RobotProps) {
  const rig = useRobotRig()
  const rootRef = useRef<Group>(null)
  const presenceRef = useRef<Group>(null)
  const isOverviewModel = isOverview && !isSelected
  const Model = isOverviewModel ? OverviewWorker : theme.robot.Model
  const agentRef = useRef(agent)
  agentRef.current = agent
  const phase = useMemo(() => phaseFor(agent.agentKey), [agent.agentKey])
  const travelDistanceRef = useRef(0)
  // Read once: after mounting, the frame loop alone sets the presence scale.
  const mountedPresence = useRef(presenceAtMount(agent)).current

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const initial = livePose(officePoses, agentRef.current)
    const retained = motions?.get(agentRef.current.agentKey)
    root.position.set(
      retained?.x ?? initial.x,
      retained?.y ?? initial.elevation,
      retained?.z ?? initial.z
    )
    root.rotation.y = retained?.heading ?? initial.heading
    travelDistanceRef.current = retained?.travelDistance ?? 0
    // Seeds the first position only; later frames ease toward the target.
  }, [rootRef, motions])

  // Per-frame motion mutates refs only. A walk reaches it through the pose store, so React
  // re-renders only when an agent's structure changes (perf-2).
  useFrame(({ clock }, delta) => {
    const root = rootRef.current
    const body = rig.body.current
    if (!root || !body) return
    const target = agentRef.current
    const goal = livePose(officePoses, target)
    const isMoving =
      Math.hypot(
        root.position.x - goal.x,
        root.position.y - goal.elevation,
        root.position.z - goal.z
      ) > MOVING_EPSILON
    const previousX = root.position.x
    const previousZ = root.position.z
    const presence = presenceRef.current
    // A robot faded to nothing goes straight to its pose: a recall seats it across town (FOUND 7).
    if (presence?.scale.x === 0) root.position.set(goal.x, goal.elevation, goal.z)
    else {
      root.position.x = approach(previousX, goal.x, delta, MOVE_RATE)
      root.position.y = approach(root.position.y, goal.elevation, delta, MOVE_RATE)
      root.position.z = approach(previousZ, goal.z, delta, MOVE_RATE)
    }
    travelDistanceRef.current += Math.hypot(
      root.position.x - previousX,
      root.position.z - previousZ
    )
    root.rotation.y = approachAngle(root.rotation.y, goal.heading, delta, TURN_RATE)
    if (presence)
      presence.scale.setScalar(presenceAfter(presence.scale.x, target, delta, isReducedMotion))
    if (motions) {
      const motion = motions.get(target.agentKey) ?? {
        x: 0,
        y: 0,
        z: 0,
        heading: 0,
        travelDistance: 0
      }
      motion.x = root.position.x
      motion.y = root.position.y
      motion.z = root.position.z
      motion.heading = root.rotation.y
      motion.travelDistance = travelDistanceRef.current
      motions.set(target.agentKey, motion)
    }
    const mood = moodFor(target, isMoving)
    const seatPresence = seats
      ? workerSeatPresence({ agent: target, position: root.position, seats, isMoving })
      : undefined
    const isWaiting = seatPresence === 'none' && mood !== 'walking' && mood !== 'needs-you'
    const pose = robotPose(isWaiting ? 'idle' : mood, clock.elapsedTime, phase, { isReducedMotion })
    const poseInput = {
      theme,
      rig,
      pose,
      options: {
        mood,
        time: clock.elapsedTime,
        phase,
        delta,
        isReducedMotion,
        isMoving,
        travelDistance: travelDistanceRef.current,
        isSubagent: target.isSubagent,
        isInLounge: seatPresence === 'lounge',
        seatPresence
      }
    }
    if (isOverviewModel) applyHumanPose(rig, pose, poseInput.options)
    else applyModelPose(poseInput)
  })

  const select = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation()
    onSelect(agent.agentKey)
  }
  const fly = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation()
    onFly(agent.agentKey)
  }

  return (
    <group ref={rootRef} scale={agent.isSubagent ? SUBAGENT_SCALE : AGENT_SCALE}>
      <group ref={presenceRef} scale={mountedPresence}>
        <mesh
          position={[0, 0.012, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          userData={SHADOW_BATCH}
          renderOrder={SHADOW_RENDER_ORDER}
        >
          <planeGeometry args={[0.9, 0.9]} />
          <meshBasicMaterial map={blobShadowTexture()} transparent depthWrite={false} />
        </mesh>
        {isSelected && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.42, 0.52, 40]} />
            <meshBasicMaterial color={theme.palette.glow} toneMapped={false} />
          </mesh>
        )}
        <Model
          agent={agent}
          skin={theme.robot.skins[agent.provider]}
          rosterIndex={rosterIndex}
          rig={rig}
          isReducedMotion={isReducedMotion}
        />
        {isSpeaking && (
          // Speech puff after a message is sent; OfficeApp clears it after about 1.5 s.
          <group position={[0.32, 1.32, 0]}>
            <mesh scale={[0.24, 0.16, 0.08]}>
              <sphereGeometry args={[1, 16, 10]} />
              <meshBasicMaterial color={theme.palette.steam} />
            </mesh>
            <mesh position={[-0.13, -0.13, 0]} scale={0.045}>
              <sphereGeometry args={[1, 8, 6]} />
              <meshBasicMaterial color={theme.palette.steam} />
            </mesh>
          </group>
        )}
        {/* Invisible, simple hit target: raycasting one capsule beats raycasting every part. */}
        <mesh
          position={[0, 0.6, 0]}
          onClick={select}
          onDoubleClick={fly}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <capsuleGeometry args={[0.32, 0.6, 2, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </group>
    </group>
  )
}

interface RobotCrewProps extends Pick<
  RobotProps,
  'isReducedMotion' | 'onSelect' | 'onFly' | 'motions' | 'isOverview'
> {
  agents: readonly AgentView[]
  zoneGroups: readonly ThemeZoneGroup[]
  floorTheme: OfficeTheme
  selectedAgentKey: string | null
  speakingAgentKey: string | null
  floors?: readonly FloorGeometry[]
}

// Shallow value equality: a sim step hands over fresh agent objects whose fields mostly match.
function isShallowEqual(prev: object, next: object): boolean {
  const prevEntries = new Map(Object.entries(prev))
  const nextEntries = Object.entries(next)
  return (
    prevEntries.size === nextEntries.length &&
    nextEntries.every(
      ([key, value]) => prevEntries.has(key) && Object.is(prevEntries.get(key), value)
    )
  )
}

function isSameRobot(prev: RobotProps, next: RobotProps): boolean {
  const previousSeats = prev.seats
  const nextSeats = next.seats
  const hasSameSeats =
    previousSeats === nextSeats ||
    (previousSeats !== undefined &&
      nextSeats !== undefined &&
      previousSeats.workstationY === nextSeats.workstationY &&
      (previousSeats.workstation === nextSeats.workstation ||
        (previousSeats.workstation !== null &&
          nextSeats.workstation !== null &&
          isShallowEqual(previousSeats.workstation, nextSeats.workstation))) &&
      previousSeats.lounge.length === nextSeats.lounge.length &&
      previousSeats.lounge.every((seat, index) => isShallowEqual(seat, nextSeats.lounge[index])))
  return (
    hasSameSeats &&
    isShallowEqual({ ...prev, agent: null, seats: null }, { ...next, agent: null, seats: null }) &&
    isShallowEqual(prev.agent, next.agent)
  )
}

interface DrawnRobot {
  props: RobotProps
  element: ReactElement
}

// A robot wears the theme of its own room, and keeps it while it walks through other zones.
// An unchanged robot gets its previous element back, so React skips it on every sim step.
export function RobotCrew({
  agents,
  zoneGroups,
  floorTheme,
  selectedAgentKey,
  speakingAgentKey,
  floors,
  ...robotProps
}: RobotCrewProps) {
  const drawn = useRef<Map<string, DrawnRobot>>(null)
  const homes = useMemo(
    () =>
      new Map(
        zoneGroups.flatMap((zoneGroup) =>
          zoneGroup.rooms.map(
            (room) =>
              [room.id, { theme: getTheme(zoneGroup.themeId), rosterIndex: room.bay ?? 0 }] as const
          )
        )
      ),
    [zoneGroups]
  )
  const previous = drawn.current
  const seatCache = useMemo(() => new Map<string, WorkerSeats>(), [floors, zoneGroups])
  const next = new Map<string, DrawnRobot>()
  const elements = agents.map((agent) => {
    const home = homes.get(agent.roomId)
    const seatKey = `${agent.floorId}:${agent.roomId}:${agent.slotId}:${physicalFloorId(agent)}`
    const seats = seatCache.get(seatKey) ?? workerSeats({ agent, floors, zoneGroups })
    seatCache.set(seatKey, seats)
    const props: RobotProps = {
      ...robotProps,
      agent,
      seats,
      theme: home?.theme ?? floorTheme,
      rosterIndex: home?.rosterIndex ?? 0,
      isSelected: agent.agentKey === selectedAgentKey,
      isSpeaking: agent.agentKey === speakingAgentKey
    }
    const kept = previous?.get(agent.agentKey)
    const robot =
      kept && isSameRobot(kept.props, props)
        ? kept
        : { props, element: <Robot key={agent.agentKey} {...props} /> }
    next.set(agent.agentKey, robot)
    return robot.element
  })
  drawn.current = next
  return <>{elements}</>
}
