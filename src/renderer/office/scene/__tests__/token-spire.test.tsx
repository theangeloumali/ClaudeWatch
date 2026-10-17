import { isValidElement, type ReactNode, type Ref } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import {
  buildingPlace,
  buildingPlaces,
  createBuildingPlaces,
  crownTopOf
} from '../../logic/building-place'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M, spireHeight } from '../../logic/token-spires'
import { getTheme } from '../../themes/registry'
import { everyElement } from '../../themes/scene.test-utils'
import { PHYSICAL_STOREY_HEIGHT } from '../all-floor-model'
import { PhysicalBuildingShell } from '../PhysicalBuildingShell'
import { spireShare, TokenSpire } from '../TokenSpire'
import { crownAnchor } from '../../themes/physical-building-parts'

vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current })
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

afterEach(() => buildingPlaces.setRoof('tower', null))

describe('spireShare', () => {
  it('is nothing at stage 0 and the stage’s share of the tallest spire once settled', () => {
    const places = createBuildingPlaces()
    places.setRoof('b', ROOF)
    places.setStage('b', 0, 0)
    expect(spireShare(places.place('b'), ROOF.y, 0, false)).toBe(0)
    places.setRoof('opened', ROOF)
    places.setStage('opened', 3, 1_000)
    expect(spireShare(places.place('opened'), ROOF.y, 1_000, false)).toBeCloseTo(
      spireHeight(3) / SPIRE_MAX_M
    )
  })

  it('eases a live stage crossing and snaps under reduced motion', () => {
    const places = createBuildingPlaces()
    places.setRoof('b', ROOF)
    places.setStage('b', 1, 0)
    places.setStage('b', 4, 5_000)
    const eased = spireShare(places.place('b'), ROOF.y, 5_600, false)
    expect(eased).toBeGreaterThan(spireHeight(1) / SPIRE_MAX_M)
    expect(eased).toBeLessThan(spireHeight(4) / SPIRE_MAX_M)
    expect(spireShare(places.place('b'), ROOF.y, 5_000, true)).toBeCloseTo(
      spireHeight(4) / SPIRE_MAX_M
    )
  })

  it('stops at the 24 m height rule, and is nothing for a building with no roof', () => {
    const places = createBuildingPlaces()
    places.setRoof('tall', { x: 0, y: 22, z: 0 })
    places.setStage('tall', 6, 0)
    expect(spireShare(places.place('tall'), 22, 0, false)).toBeCloseTo(
      (24 - 22 - SPIRE_BASE_GAP_M) / SPIRE_MAX_M
    )
    expect(spireShare(places.place('none'), 22, 0, false)).toBe(0)
  })
})

describe('the shell and its spire', () => {
  const shell = (props: Partial<Parameters<typeof PhysicalBuildingShell>[0]> = {}) =>
    PhysicalBuildingShell({ floors, theme, ...props })

  it('mounts the spire with the crown and hides it with the roof', () => {
    const spires = (node: ReactNode) =>
      everyElement(node).filter((element) => element.props.name === 'token-spire:tower')
    expect(spires(shell({ spireStage: 2 }))).toHaveLength(1)
    expect(spires(shell({ spireStage: 2, areRoofsVisible: false }))).toHaveLength(0)
    expect(spires(shell({ spireStage: 2, focusedFloorId: 'f0' }))).toHaveLength(0)
  })

  // Hidden modules still cost their triangles in the batch, so an unspent day carries none.
  it('a building that has spent nothing today carries no spire geometry', () => {
    const spires = (node: ReactNode) =>
      everyElement(node).filter((element) => element.props.name === 'token-spire:tower')
    expect(spires(shell())).toHaveLength(0)
  })

  it('a spire mounts one module per stage it has reached', () => {
    const roof = crownTopOf(floors, theme)
    if (!roof) throw new Error('the tower has a roof')
    const spire = (stage: number) =>
      everyElement(
        TokenSpire({ buildingId: 'tower', deck: crownAnchor(floors[1]), roof, theme, stage })
      ).filter((element) => element.type === 'mesh')
    expect(spire(1)).toHaveLength(1)
    expect(spire(3)).toHaveLength(3)
  })

  it('feeds the place store its crown top on mount and clears it when it goes', () => {
    const cleanup = rootRefOf(shell())({})
    expect(buildingPlace('tower').topAt(0, true)).toEqual(crownTopOf(floors, theme))
    cleanup?.()
    expect(buildingPlace('tower').topAt(0, true)).toBeNull()
  })

  it('gives the place store no roof while the roof is off or a floor is focused', () => {
    rootRefOf(shell({ areRoofsVisible: false }))({})
    expect(buildingPlace('tower').topAt(0, true)).toBeNull()
    rootRefOf(shell({ focusedFloorId: 'f1' }))({})
    expect(buildingPlace('tower').topAt(0, true)).toBeNull()
  })
})
