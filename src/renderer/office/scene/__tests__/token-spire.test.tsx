import { isValidElement, type ReactElement, type ReactNode, type Ref } from 'react'
import { Mesh } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import { buildingPlaces, createBuildingPlaces, crownTopOf } from '../../logic/building-place'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M, spireHeight } from '../../logic/token-spires'
import { getTheme } from '../../themes/registry'
import { everyElement } from '../../themes/scene.test-utils'
import { crownAnchor } from '../../themes/physical-building-parts'
import { PHYSICAL_STOREY_HEIGHT } from '../all-floor-model'
import { MultiFloorLayer } from '../MultiFloorLayer'
import { PhysicalBuildingShell } from '../PhysicalBuildingShell'
import { spireShare, TokenSpire, TokenSpires } from '../TokenSpire'

const frames = vi.hoisted(() => ({ run: [] as (() => void)[] }))
vi.mock('@react-three/fiber', () => ({ useFrame: (run: () => void) => void frames.run.push(run) }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current }),
  useLayoutEffect: () => undefined
}))

const theme = getTheme('corporate-city')
const floors = [0, 1].map((level) => ({
  ...makeFloor({ floorId: `f${level}`, buildingId: 'tower', x: 4, z: -2 }),
  elevation: level * PHYSICAL_STOREY_HEIGHT
}))
const ROOF = { x: 4, y: 10, z: -2 }

type RefCallback = (node: unknown) => (() => void) | undefined
// The shell's root group: the ref React hands its group on mount, and cleans up on unmount.
function rootRefOf(node: ReactNode): RefCallback {
  if (!isValidElement<{ ref?: Ref<unknown> }>(node) || typeof node.props.ref !== 'function')
    throw new Error('the shell registers its roof through its root ref')
  const ref = node.props.ref
  return (group) => {
    const cleanup: unknown = ref(group)
    return typeof cleanup === 'function' ? () => void cleanup() : undefined
  }
}

afterEach(() => {
  buildingPlaces.setRoof('tower', null)
  frames.run = []
})

describe('spireShare', () => {
  it('is nothing at stage 0 and the stage’s share of the tallest spire once settled', () => {
    const places = createBuildingPlaces()
    places.setRoof('b', ROOF)
    places.setStage('b', 0, 0)
    expect(spireShare(places, 'b', 0, false)).toBe(0)
    places.setRoof('opened', ROOF)
    places.setStage('opened', 3, 1_000)
    expect(spireShare(places, 'opened', 1_000, false)).toBeCloseTo(spireHeight(3) / SPIRE_MAX_M)
  })

  it('eases a live stage crossing and snaps under reduced motion', () => {
    const places = createBuildingPlaces()
    places.setRoof('b', ROOF)
    places.setStage('b', 1, 0)
    places.setStage('b', 4, 5_000)
    const eased = spireShare(places, 'b', 5_600, false)
    expect(eased).toBeGreaterThan(spireHeight(1) / SPIRE_MAX_M)
    expect(eased).toBeLessThan(spireHeight(4) / SPIRE_MAX_M)
    expect(spireShare(places, 'b', 5_000, true)).toBeCloseTo(spireHeight(4) / SPIRE_MAX_M)
  })

  it('rises its full stage over a tall roof, and is nothing for a building with no roof', () => {
    const places = createBuildingPlaces()
    places.setRoof('tall', { x: 0, y: 30, z: 0 })
    places.setStage('tall', 6, 0)
    expect(spireShare(places, 'tall', 0, false)).toBeCloseTo(1)
    expect(spireShare(places, 'none', 0, false)).toBe(0)
  })
})

describe('the city spire batch and the shell', () => {
  const shell = (props: Partial<Parameters<typeof PhysicalBuildingShell>[0]> = {}) =>
    PhysicalBuildingShell({ floors, theme, ...props })
  // The layer's own JSX, components unexpanded.
  const shallow = (node: ReactNode): ReactElement<{ children?: ReactNode }>[] =>
    Array.isArray(node)
      ? node.flatMap(shallow)
      : isValidElement<{ children?: ReactNode }>(node)
        ? [node, ...shallow(node.props.children)]
        : []
  const spiresOf = (spireStages?: ReadonlyMap<string, number>) =>
    shallow(
      MultiFloorLayer({
        floors,
        agents: [],
        floorTheme: theme,
        groups: new Map(),
        wallsMode: 'cutaway',
        isReducedMotion: true,
        selectedAgentKey: null,
        speakingAgentKey: null,
        onSelect: () => undefined,
        onFly: () => undefined,
        onFlyToZone: () => undefined,
        spireStages
      })
    ).filter((element) => element.type === TokenSpires)

  // Hidden modules still cost their triangles in the batch, so an unspent day carries none.
  it('mounts a spire for an office with a stage, and none for one that spent nothing today', () => {
    expect(spiresOf(new Map([['tower', 2]]))).toHaveLength(1)
    expect(spiresOf(new Map())).toHaveLength(0)
    expect(spiresOf()).toHaveLength(0)
  })

  it('a spire mounts one module per stage it has reached', () => {
    const spire = (stage: number) =>
      everyElement(TokenSpire({ buildingId: 'tower', theme, stage })).filter(
        (element) => element.type === 'mesh'
      )
    expect(spire(1)).toHaveLength(1)
    expect(spire(3)).toHaveLength(3)
  })

  it('stands on the deck while the shell gives it a roof, and hides when the roof goes', () => {
    const meshes = everyElement(TokenSpire({ buildingId: 'tower', theme, stage: 2 }))
      .filter((element) => element.type === 'mesh')
      .map((element) => {
        const mesh = new Mesh()
        const ref = (element.props as { ref?: (mesh: Mesh) => void }).ref
        ref?.(mesh)
        return mesh
      })
    // The spire's own frame loop; the shell's needs a camera.
    const spireFrames = [...frames.run]
    const frame = () => spireFrames.forEach((run) => run())
    buildingPlaces.setStage('tower', 2, 0)
    frame()
    expect(meshes.every((mesh) => !mesh.visible)).toBe(true)
    const cleanup = rootRefOf(shell())({})
    frame()
    expect(meshes.every((mesh) => mesh.visible)).toBe(true)
    const roof = crownTopOf(floors, theme)
    expect(meshes[0].position.y - meshes[0].scale.y / 2).toBeCloseTo(crownAnchor(floors[1]).y)
    expect(meshes[1].position.y + meshes[1].scale.y / 2).toBeCloseTo(
      (roof?.y ?? 0) + SPIRE_BASE_GAP_M + spireHeight(2)
    )
    cleanup?.()
    frame()
    expect(meshes.every((mesh) => !mesh.visible)).toBe(true)
  })

  it('feeds the place store its crown top and deck on mount and clears it when it goes', () => {
    const cleanup = rootRefOf(shell())({})
    expect(buildingPlaces.roofOf('tower')).toEqual({
      crown: crownTopOf(floors, theme),
      deck: crownAnchor(floors[1])
    })
    cleanup?.()
    expect(buildingPlaces.roofOf('tower')).toBeNull()
  })

  it('gives the place store no roof while the roof is off or a floor is focused', () => {
    rootRefOf(shell({ areRoofsVisible: false }))({})
    expect(buildingPlaces.topAt('tower', 0, true)).toBeNull()
    rootRefOf(shell({ focusedFloorId: 'f1' }))({})
    expect(buildingPlaces.topAt('tower', 0, true)).toBeNull()
  })
})
