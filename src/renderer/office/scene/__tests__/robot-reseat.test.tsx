import { advance } from '@react-three/fiber'
import type { Object3D, Scene } from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { DEPARTURE_FADE_MS, SIM_TICK_MS, type AgentView } from '../../../../shared/office/types'
import { officePoses, poseOf } from '../../../office-live/pose-store'
import { makeAgent } from '../../__tests__/fixtures'
import { themeForTeam } from '../../themes/registry'
import { RobotCrew, type RobotMotion } from '../Robot'
import { mountInFiber } from './fiber-root.test-utils'

vi.mock('../textures', () => ({ blobShadowTexture: () => null }))
// A bare rig: the frame loop runs once the body is there, and posing is not under test.
vi.mock('../../themes/rig', () => ({
  useRobotRig: () => ({ body: { current: {} } }),
  applyModelPose: () => undefined
}))

afterEach(() => {
  vi.unstubAllGlobals()
  officePoses.retain(new Set())
})

const theme = { ...themeForTeam(), robot: { ...themeForTeam().robot, Model: () => null } }
const CREWS = ['f1', 'transit'] as const
type CrewId = (typeof CREWS)[number]
const TICK_S = 0.1
// The sim reseats a fader on the tick its fade ends.
const RESEAT_TICK = DEPARTURE_FADE_MS / (TICK_S * 1000)
// A place is where a robot stands and which way it faces.
type Place = Pick<AgentView, 'x' | 'z' | 'heading'>
const SPOT: Place = { x: 1, z: 1, heading: 0 }
const DESK: Place = { x: 5, z: -3, heading: Math.PI / 2 }
const AT_REST_M = 1e-6

interface DrawnFrame extends Place {
  scale: number
}

interface ReturnFeed {
  frameRate: number
  // A blurred feed holds frames back, so the fade can reach the scene ticks after it began.
  fadeSeenTick?: number
  // Frames drawn after the desk pose lands in the store but before the cleared fade commits.
  clearLagFrames?: number
  remountTick?: number
  reseatCrew?: CrewId
  desk?: Place
  isReducedMotion?: boolean
}

function crews(
  agent: AgentView,
  crewId: CrewId,
  motions: Map<string, RobotMotion>,
  feed: ReturnFeed
) {
  return (
    <>
      {CREWS.map((id) => (
        <group key={id} name={`crew:${id}`}>
          <RobotCrew
            agents={id === crewId ? [agent] : []}
            zoneGroups={[]}
            floorTheme={theme}
            selectedAgentKey={null}
            speakingAgentKey={null}
            isReducedMotion={feed.isReducedMotion ?? false}
            onSelect={() => undefined}
            onFly={() => undefined}
            motions={motions}
          />
        </group>
      ))}
    </>
  )
}

function drawnRobot(scene: Scene): { root: Object3D; presence: Object3D } {
  for (const id of CREWS) {
    const root = scene.getObjectByName(`crew:${id}`)?.children[0]
    const presence = root?.children[0]
    if (root && presence) return { root, presence }
  }
  throw new Error('no robot drawn')
}

// A same-floor return: poses land in the store each sim tick, React commits structure after.
async function playReturn(feed: ReturnFeed): Promise<DrawnFrame[]> {
  const { frameRate, fadeSeenTick = 0, clearLagFrames = 0, reseatCrew = 'f1' } = feed
  const motions = new Map<string, RobotMotion>()
  const standing = makeAgent({ agentKey: 'a', ...SPOT, physicalFloorId: 'f1' })
  const seated = { ...standing, ...(feed.desk ?? DESK) }
  const fading = (tick: number): AgentView => ({ ...standing, fade: tick / RESEAT_TICK })
  officePoses.write('a', poseOf(standing))
  const { scene, rerender, unmount } = await mountInFiber(crews(standing, 'f1', motions, feed))
  const frameS = 1 / frameRate
  const frames: DrawnFrame[] = []
  let tick = 0
  let reseatFrame = Infinity
  for (let frame = 1; frame <= frameRate * 1.5; frame++) {
    for (; tick * TICK_S <= frame * frameS + 1e-9; tick++) {
      officePoses.write('a', poseOf(tick < RESEAT_TICK ? standing : seated))
      if (tick === fadeSeenTick) await rerender(crews(fading(tick), 'f1', motions, feed))
      if (tick === feed.remountTick) await rerender(crews(fading(tick), 'transit', motions, feed))
      if (tick === RESEAT_TICK) reseatFrame = frame + clearLagFrames
    }
    if (frame === reseatFrame) await rerender(crews(seated, reseatCrew, motions, feed))
    advance(frame * frameS)
    const { root, presence } = drawnRobot(scene)
    frames.push({
      x: root.position.x,
      z: root.position.z,
      heading: root.rotation.y,
      scale: presence.scale.x
    })
  }
  await unmount()
  return frames
}

const isAt = (frame: DrawnFrame, place: Place): boolean =>
  Math.hypot(frame.x - place.x, frame.z - place.z) <= AT_REST_M &&
  Math.abs(frame.heading - place.heading) <= AT_REST_M

it.each<[string, ReturnFeed]>([
  ['60 Hz frames', { frameRate: 60 }],
  ['15 Hz frames', { frameRate: 15 }],
  ['a shrink that starts 200 ms late', { frameRate: 60, fadeSeenTick: 2 }],
  [
    'the desk pose landing frames before the cleared fade',
    { frameRate: 60, fadeSeenTick: 2, clearLagFrames: 3 }
  ],
  [
    'a remount into another crew as the fade clears',
    { frameRate: 60, fadeSeenTick: 2, reseatCrew: 'transit' }
  ]
])(
  'a robot recalled across the floor grows in at its desk, never sliding there (%s)',
  async (_, feed) => {
    const frames = await playReturn(feed)

    const visible = frames.filter((frame) => frame.scale > 0)
    expect(visible.filter((frame) => !isAt(frame, SPOT) && !isAt(frame, DESK))).toEqual([])
    const arrival = frames.find((frame) => isAt(frame, DESK))
    const growStep = 1000 / feed.frameRate / DEPARTURE_FADE_MS
    expect(arrival?.scale).toBeLessThanOrEqual(growStep + 1e-9)
    expect(frames.at(-1)).toEqual({ ...DESK, scale: 1 })
  }
)

it('under reduced motion a recalled robot goes from its spot and stands whole at its desk', async () => {
  const frames = await playReturn({ frameRate: 60, fadeSeenTick: 2, isReducedMotion: true })

  const visible = frames.filter((frame) => frame.scale > 0)
  expect(visible.filter((frame) => !isAt(frame, SPOT) && !isAt(frame, DESK))).toEqual([])
  expect(frames.find((frame) => isAt(frame, DESK))?.scale).toBe(1)
})

it('a recall that reappears where it stood grows back from the size its shrink had reached', async () => {
  const frames = await playReturn({ frameRate: 60, fadeSeenTick: 2, desk: SPOT })

  expect(frames.every((frame) => isAt(frame, SPOT))).toBe(true)
  // Seen faded for 300 of its 400 ms shrink: it never vanishes before growing back.
  expect(Math.min(...frames.map((frame) => frame.scale))).toBeGreaterThan(0.2)
  expect(frames.at(-1)?.scale).toBe(1)
})

it('a robot remounted mid-fade carries on shrinking from the size it was drawn at', async () => {
  const frames = await playReturn({
    frameRate: 60,
    remountTick: 3,
    reseatCrew: 'transit',
    desk: SPOT
  })

  const scales = frames.map((frame) => frame.scale)
  // The shrink is the faster of the two, so no frame may change by more than its step.
  const shrinkStep = 1000 / 60 / (DEPARTURE_FADE_MS - SIM_TICK_MS)
  scales.slice(1).forEach((scale, index) => {
    expect(Math.abs(scale - scales[index])).toBeLessThanOrEqual(shrinkStep + 1e-9)
  })
})
