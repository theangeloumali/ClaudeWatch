import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Group, Texture } from 'three'
import { groupZonesByTheme } from '../../logic/office-themes'
import type { FloorGeometry } from '../../scene-model'
import { FloorView } from '../../scene/FloorView'
import { registerTheme } from '../registry'
import { mergedDraws } from '../scene.test-utils'
import { WORLD_APRON } from '../surroundings'
import type { OfficeTheme } from '../types'
import { CIRCUIT_ALTITUDE_M, circuitPose, radarMounts } from './ambient'
import { DISH_REACH_M } from './buildings'
import { GarrisonAmbient, RadarDish, Shuttle } from './GarrisonAmbient'
import { orbitalGarrison } from './index'
import { FLOORS, officeGap } from './yard.test-utils'
import { drawnTown, townDressOf } from '../../town/drawn-town.test-utils'
import { dressLot, type DressableLot } from '../../town/town-dress'
import { drawnTop, topOf } from '../../town/town-ambient'

type Frame = (state: { clock: { elapsedTime: number }; invalidate: () => void }) => void
const frames: Frame[] = []
const refs: { current: Group }[] = []

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  // A mounted group for every ref, so a frame callback has something to move.
  useRef: (current: object | null) => {
    const ref = { current: current ?? new Group() }
    if (ref.current instanceof Group) refs.push({ current: ref.current })
    return ref
  }
}))
vi.mock('@react-three/fiber', () => ({ useFrame: (frame: Frame) => frames.push(frame) }))
vi.mock('../../scene/textures', () => ({ useSignTexture: () => new Texture() }))

// The whole theme may add this many draws across its lounge and ambient parts.
const DRAW_BUDGET = 9
const WIDE = FLOORS[2]

const withoutLounge: OfficeTheme = {
  ...orbitalGarrison,
  id: 'test-garrison-no-lounge',
  kit: { ...orbitalGarrison.kit, zone: { ...orbitalGarrison.kit.zone, Lounge: undefined } }
}
registerTheme(withoutLounge)

function floorDraws(floor: FloorGeometry, theme: OfficeTheme): number {
  return mergedDraws(
    createElement(FloorView, {
      floor,
      floorTheme: theme,
      zoneGroups: groupZonesByTheme(floor, () => theme.id),
      wallsMode: 'cutaway',
      isReducedMotion: true
    })
  ).draws
}

// Renders one mover, then runs the frame callback it registered against the group it holds.
function moved(render: () => unknown, seconds: number) {
  render()
  const group = refs.at(-1)?.current
  const frame = frames.at(-1)
  if (!group || !frame) throw new Error('The mover registered no frame callback')
  const invalidate = vi.fn()
  const before = [group.rotation.y, group.position.x, group.position.z]
  frame({ clock: { elapsedTime: seconds }, invalidate })
  frame({ clock: { elapsedTime: seconds + 2 }, invalidate })
  const after = [group.rotation.y, group.position.x, group.position.z]
  return { hasMoved: after.some((value, index) => value !== before[index]), invalidate }
}

describe('the Orbital Garrison draw budget', () => {
  it('registers a lounge and ambient movers on its zone kit', () => {
    const { Lounge, Ambient } = orbitalGarrison.kit.zone
    expect([Lounge, Ambient].every((part) => part !== undefined)).toBe(true)
  })

  it.each(FLOORS.map((floor) => [`${floor.width} x ${floor.depth}`, floor] as const))(
    'adds at most nine draws on a %s m floor',
    (_size, floor) => {
      // Handed what the zoned town draws, as TownAmbient hands it.
      const placed = drawnTown(orbitalGarrison.id, floor)
      const ambient = mergedDraws(
        createElement(GarrisonAmbient, {
          floor,
          lots: placed.map((each) => each.lot),
          placed,
          isReducedMotion: false
        })
      )
      const lounge = floorDraws(floor, orbitalGarrison) - floorDraws(floor, withoutLounge)
      expect(ambient.draws).toBeGreaterThan(0)
      expect(lounge).toBeGreaterThanOrEqual(0)
      expect(ambient.draws + lounge).toBeLessThanOrEqual(DRAW_BUDGET)
    }
  )
})

describe('what moves around the garrison', () => {
  // Civic lots of two sides, so the dish is checked on a narrow tower and on a broad one.
  it('mounts a dish on the pedestal of every radar tower a town draws', () => {
    for (const side of [8, 12]) {
      const civicLots = Array.from(
        { length: 8 },
        (_, seed): DressableLot => ({
          id: `civic:${side}:${seed}`,
          kind: 'building',
          x: seed * 16,
          z: 0,
          width: side,
          depth: side,
          maxHeight: 10,
          seed,
          zone: 'civic',
          facing: 'south',
          isLandmark: false
        })
      )
      const placed = civicLots.map((lot) => dressLot(lot, 0, townDressOf(orbitalGarrison.id)))
      const towers = placed.filter((each) => each.design === 'radar-tower')
      const mounts = radarMounts(placed)
      expect(mounts.length).toBe(towers.length)
      expect(mounts.length).toBeGreaterThan(0)
      towers.forEach((tower, index) => {
        const mount = mounts[index]
        // The drum the dish turns on is the tower's highest round part.
        const [top] = tower.parts
          .filter((part) => part.shape === 'cylinder')
          .map((part) => topOf(tower, part))
          .sort((a, b) => b.y - a.y)
        expect([mount.x, mount.y, mount.z]).toEqual([top.x, top.y, top.z])
        expect(mount.y).toBe(drawnTop(tower))
        expect(mount.y + DISH_REACH_M * mount.scale).toBeLessThanOrEqual(tower.lot.maxHeight + 1e-9)
      })
    }
  })

  it('flies the shuttle a circuit north of the plate, clear of every desk', () => {
    for (const floor of FLOORS) {
      const poses = Array.from({ length: 200 }, (_, step) => circuitPose(floor, step / 200))
      for (const pose of poses) {
        const north = floor.z - floor.depth / 2
        expect(pose.z).toBeLessThan(north - 3)
        expect(pose.z).toBeGreaterThan(north - WORLD_APRON.north)
        expect(Math.abs(pose.x - floor.x)).toBeLessThan(floor.width / 2)
        const gap = officeGap(floor, { x: pose.x, z: pose.z, width: 2, depth: 2 })
        expect(CIRCUIT_ALTITUDE_M + 0.5).toBeLessThanOrEqual(gap * 0.7)
      }
      expect(new Set(poses.map((pose) => pose.x.toFixed(1))).size).toBeGreaterThan(50)
    }
  })

  it('turns the dish and flies the shuttle, and never asks for a frame', () => {
    const mount = { x: 4, y: 6, z: 2, scale: 1 }
    for (const mover of [
      moved(() => RadarDish({ mount, isReducedMotion: false }), 3),
      moved(() => Shuttle({ floor: WIDE, isReducedMotion: false }), 3)
    ]) {
      expect(mover.hasMoved).toBe(true)
      expect(mover.invalidate).not.toHaveBeenCalled()
    }
  })

  it('holds both still under reduced motion', () => {
    const mount = { x: 4, y: 6, z: 2, scale: 1 }
    expect(moved(() => RadarDish({ mount, isReducedMotion: true }), 3).hasMoved).toBe(false)
    expect(moved(() => Shuttle({ floor: WIDE, isReducedMotion: true }), 3).hasMoved).toBe(false)
  })
})
