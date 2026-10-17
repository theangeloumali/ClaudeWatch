import { createRef } from 'react'
import { Box3, Group, Mesh, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { robotPose, type RobotMood } from '../../logic/character-pose'
import { applyHumanPose } from '../../themes/corporate-city/human-pose'
import { selectHumanAppearance } from '../../themes/corporate-city/human-parts'
import { samuraiEmpire } from '../../themes/samurai-empire'
import { SAMURAI_DESK_PARTS } from '../../themes/samurai-empire/furniture'
import { samuraiParts, selectSamuraiAppearance } from '../../themes/samurai-empire/armor'
import { samuraiFigureParts } from '../../themes/samurai-empire/figure-geometry'
import { SAMURAI_DESIGNS } from '../../themes/samurai-empire/town-designs'
import { SAMURAI_TOWN } from '../../themes/samurai-empire/town'
import { agentsOn } from '../../themes/live-budget.test-utils'
import { mergedDraws } from '../../themes/scene.test-utils'
import { boundsOf, expectOnItsPlot, sizeOf } from '../../themes/town-bounds.test-utils'
import type { RobotRig, ThemePoseOptions } from '../../themes/types'
import { WORKSTATIONS } from '../../themes/workstations'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: object) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('../../scene/textures', () => ({ useSignTexture: () => new Texture() }))

function rig(): RobotRig {
  return {
    body: createRef<Group>(),
    head: createRef<Group>(),
    leftArm: createRef<Group>(),
    rightArm: createRef<Group>(),
    leftElbow: createRef<Group>(),
    rightElbow: createRef<Group>(),
    leftHip: createRef<Group>(),
    rightHip: createRef<Group>(),
    leftKnee: createRef<Group>(),
    rightKnee: createRef<Group>(),
    gear: createRef<Group>(),
    legs: createRef<Group>(),
    base: createRef<Group>(),
    sensor: createRef<Group>(),
    eye: createRef<Mesh>(),
    thought: createRef<Group>(),
    puffs: []
  }
}

describe('Samurai Empire world contract', () => {
  const moods: readonly RobotMood[] = [
    'idle',
    'working',
    'reading',
    'thinking',
    'needs-you',
    'walking',
    'lounging'
  ]

  it.each(moods)('applies the shared articulated %s posture to the Samurai rig', (mood) => {
    const modelRig = rig()
    for (const ref of [
      modelRig.body,
      modelRig.head,
      modelRig.leftArm,
      modelRig.rightArm,
      modelRig.leftElbow,
      modelRig.rightElbow,
      modelRig.leftHip,
      modelRig.rightHip,
      modelRig.leftKnee,
      modelRig.rightKnee,
      modelRig.gear,
      modelRig.sensor
    ]) {
      if (ref) ref.current = new Group()
    }
    const options: ThemePoseOptions = {
      mood,
      time: 0.5,
      phase: 0,
      delta: 0.1,
      isReducedMotion: true,
      isMoving: mood === 'walking',
      isInLounge: mood === 'lounging'
    }
    samuraiEmpire.robot.applyPose?.(modelRig, robotPose(mood, 0.5, 0, options), options)
    expect(modelRig.gear.current?.visible).toBe(mood === 'reading')
    expect(modelRig.leftKnee?.current?.rotation.x).toBeCloseTo(mood === 'walking' ? 0 : Math.PI / 2)
    expect(Number.isFinite(modelRig.leftElbow?.current?.rotation.x)).toBe(true)
    expect(Number.isFinite(modelRig.rightElbow?.current?.rotation.x)).toBe(true)
  })

  it('exports every office surface without inventing a roster or replacing pose behavior', () => {
    expect(samuraiEmpire.id).toBe('samurai-empire')
    expect(samuraiEmpire.roster).toBeUndefined()
    expect(samuraiEmpire.robot.applyPose).toBe(applyHumanPose)
    expect(samuraiEmpire.workstation).toBe(WORKSTATIONS.samurai)
    expect(Object.keys(samuraiEmpire.kit.zone)).toEqual(
      expect.arrayContaining([
        'CompanyZone',
        'ProjectOffice',
        'RoomFloors',
        'Walls',
        'Doorway',
        'Desk',
        'RoomDressing',
        'RoomSign',
        'Lounge'
      ])
    )
    expect(
      Object.values(samuraiEmpire.kit.floor).every((surface) => typeof surface === 'function')
    ).toBe(true)
  })

  it('keeps real-identity skin, adult face, and separate armored elbows and knees', () => {
    const appearance = selectSamuraiAppearance('claude:real-agent')
    expect(appearance).toEqual(selectSamuraiAppearance('claude:real-agent'))
    expect(appearance.skin).toBe(selectHumanAppearance('claude:real-agent').skin)
    const figure = samuraiParts(appearance)
    for (const joint of ['leftElbow', 'rightElbow', 'leftKnee', 'rightKnee'] as const) {
      expect(figure.joints[joint].length).toBeGreaterThan(2)
    }
    expect(figure.joints.head.some((part) => part.color === appearance.skin)).toBe(true)
    expect(
      new Set(
        Array.from({ length: 40 }, (_, index) => selectSamuraiAppearance(`agent:${index}`).armor)
      ).size
    ).toBeGreaterThan(1)
    const bounds = sizeOf({
      name: 'canonical samurai',
      parts: () => samuraiFigureParts(appearance)
    })
    expect(bounds.min.y).toBeCloseTo(0, 5)
    expect(bounds.max.y).toBeLessThan(1.22)
    expect(bounds.max.y).toBeGreaterThan(1)
  })

  it('leaves the live display plane unobstructed by hardware', () => {
    const [across, height, along] = WORKSTATIONS.samurai.screen
    const backing = SAMURAI_DESK_PARTS.find(
      (part) =>
        part.at[0] === across &&
        part.at[1] === height &&
        part.size[0] === WORKSTATIONS.samurai.width
    )
    expect(backing).toBeDefined()
    expect(backing ? backing.at[2] - backing.size[2] / 2 : 0).toBeCloseTo(along + 0.003, 6)
    expect(SAMURAI_DESK_PARTS.length).toBeLessThan(70)
  })

  it('covers all districts, its garden, citizens, and vehicle roles', () => {
    for (const district of Object.keys(SAMURAI_TOWN.looks)) {
      expect(SAMURAI_DESIGNS.some((design) => design.zones.some((zone) => zone === district))).toBe(
        true
      )
    }
    expect(SAMURAI_TOWN.citizens.map((figure) => figure.name)).toEqual([
      'canal ronin',
      'network guard',
      'repair courier',
      'arcade artisan'
    ])
    expect(SAMURAI_TOWN.vehicles.map((vehicle) => vehicle.role)).toEqual([
      'transit',
      'freight',
      'runabout'
    ])
    const names = [...SAMURAI_TOWN.designs, ...SAMURAI_TOWN.props].map((entry) => entry.name)
    expect(names).toContain(SAMURAI_TOWN.garden)
  })

  it('bounds every district on narrow and broad lots without detail growing with height', () => {
    for (const design of SAMURAI_DESIGNS) {
      for (const size of [1.2, 3, 8]) {
        const plot = {
          width: size,
          depth: size * 0.8,
          height: design.height.max,
          seed: 7,
          accent: samuraiEmpire.palette.glow
        }
        expectOnItsPlot(design, plot)
        expect(design.build(plot).length).toBeLessThanOrEqual(64)
      }
    }
  })

  it('keeps street props inside declared natural placement caps', () => {
    for (const prop of SAMURAI_TOWN.props) {
      const bounds = prop.parts.reduce((all, part) => all.union(boundsOf(part)), new Box3())
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.000001)
      expect(bounds.max.y).toBeLessThanOrEqual(prop.size[1] + 0.000001)
      expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeLessThanOrEqual(
        prop.size[0] / 2 + 0.000001
      )
      expect(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeLessThanOrEqual(
        prop.size[2] / 2 + 0.000001
      )
    }
  })

  it('merges matching player armor and disposes no shared geometry', () => {
    const geometry = samuraiEmpire.playerGeometry?.(samuraiEmpire.palette)
    expect(geometry).toBeDefined()
    if (!geometry) throw new Error('Missing Samurai player geometry')
    geometry.computeBoundingBox()
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count)
    const bounds = geometry.boundingBox ?? new Box3()
    expect(bounds.min.y).toBeGreaterThanOrEqual(0)
    expect((geometry.index?.count ?? geometry.getAttribute('position').count) / 3).toBeLessThan(
      3000
    )
    geometry.dispose()
  })

  it('renders the floor and elevator through shared merged unit parts', () => {
    const { floor } = agentsOn(4, 20)
    const Slab = samuraiEmpire.kit.floor.Slab
    const Elevator = samuraiEmpire.kit.floor.Elevator
    const measured = mergedDraws([
      <Slab key="slab" floor={floor} />,
      <Elevator key="elevator" floor={floor} />
    ])
    expect(measured.draws).toBeLessThanOrEqual(24)
    expect(measured.triangles).toBeLessThan(1500)
  })

  it.each([20, 40, 60])('bounds the merged character layer for %i actual agents', (count) => {
    const { agents } = agentsOn(4, count)
    const measured = mergedDraws(
      agents.map((agent) => (
        <samuraiEmpire.robot.Model
          key={agent.agentKey}
          agent={agent}
          skin={samuraiEmpire.robot.skins[agent.provider]}
          rosterIndex={0}
          rig={rig()}
          isReducedMotion
        />
      ))
    )
    expect(measured.draws).toBeLessThanOrEqual(90)
    expect(measured.triangles).toBeLessThanOrEqual(count * 3000)
  })
})
