import { advance } from '@react-three/fiber'
import type { Object3D } from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { DEPARTURE_FADE_MS, type AgentView } from '../../../../shared/office/types'
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

afterEach(() => vi.unstubAllGlobals())

const FRAME_S = 1 / 60
const theme = { ...themeForTeam(), robot: { ...themeForTeam().robot, Model: () => null } }
const CREWS = ['f1', 'f2', 'transit'] as const

// One crew per floor and one for transit, sharing retained motions as MultiFloorLayer does.
function crews(
  agent: AgentView,
  crewId: (typeof CREWS)[number],
  motions: Map<string, RobotMotion>
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
            isReducedMotion={false}
            onSelect={() => undefined}
            onFly={() => undefined}
            motions={motions}
          />
        </group>
      ))}
    </>
  )
}

async function crewRig() {
  const motions = new Map<string, RobotMotion>()
  const upstairs = makeAgent({ agentKey: 'a', x: 1, z: 1, physicalFloorId: 'f1' })
  const mount = await mountInFiber(crews(upstairs, 'f1', motions))
  let clockS = 0
  const step = (seconds: number) => {
    for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += FRAME_S) advance((clockS += FRAME_S))
  }
  const robotIn = (crewId: string): { root: Object3D; presence: Object3D } => {
    const root = mount.scene.getObjectByName(`crew:${crewId}`)?.children[0]
    const presence = root?.children[0]
    if (!root || !presence) throw new Error(`no robot in crew ${crewId}`)
    return { root, presence }
  }
  step(0.5)
  return { ...mount, motions, upstairs, step, robotIn }
}

it('a robot carried to another floor starts at its new spot from nothing and grows in', async () => {
  const { rerender, unmount, motions, upstairs, step, robotIn } = await crewRig()
  expect(robotIn('f1').root.position.x).toBeCloseTo(1)
  const moved = { ...upstairs, x: 30, z: -20, elevation: 5.5, physicalFloorId: 'f2' }
  await rerender(crews(moved, 'f2', motions))

  const { root, presence } = robotIn('f2')
  expect(presence.scale.x).toBe(0)
  expect([root.position.x, root.position.y, root.position.z]).toEqual([30, 5.5, -20])
  step(DEPARTURE_FADE_MS / 2000)
  expect(presence.scale.x).toBeGreaterThan(0.4)
  expect(presence.scale.x).toBeLessThan(0.6)
  step(DEPARTURE_FADE_MS / 1000)
  expect(presence.scale.x).toBe(1)
  expect([root.position.x, root.position.y, root.position.z]).toEqual([30, 5.5, -20])
  await unmount()
})

it('a robot changing crew on its own floor carries on whole from where it was drawn', async () => {
  const { rerender, unmount, motions, upstairs, step, robotIn } = await crewRig()
  const drawnX = robotIn('f1').root.position.x
  await rerender(crews({ ...upstairs, x: 4 }, 'transit', motions))

  const { root, presence } = robotIn('transit')
  expect(presence.scale.x).toBe(1)
  expect(root.position.x).toBeCloseTo(drawnX)
  step(FRAME_S)
  expect(root.position.x).toBeGreaterThan(drawnX)
  expect(root.position.x).toBeLessThan(4)
  await unmount()
})
