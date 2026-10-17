import { createElement, type ReactNode } from 'react'
import { Group } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drawnTown, townDressOf } from '../town/drawn-town.test-utils'
import { drawnTop } from '../town/town-ambient'
import { dressLot } from '../town/town-dress'
import { steamPuffAt } from './ambient-parts'
import { BrassAmbient, brassGears, turnGears } from './BrassAmbient'
import { dronePosition, EdoAmbient, lanternDrones } from './EdoAmbient'
import { LIVE_FLOORS } from './floors.test-utils'
import { GROUND_Y } from './surroundings'
import type { AmbientProps } from './types'

type FrameState = { clock: { elapsedTime: number }; invalidate: () => void }
const frame = vi.hoisted(() => ({
  callbacks: [] as ((state: FrameState) => void)[],
  root: null as Group | null
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: FrameState) => void) => frame.callbacks.push(callback)
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useRef: () => ({ current: frame.root })
}))

const floor = LIVE_FLOORS[2][1]
const TIMES = Array.from({ length: 120 }, (_, index) => index * 0.37)
const DRONE_HALF = { side: 0.18, height: 0.3 }
// The Brass civic landmark, as a lot of the town would draw it were the tower not standing there.
const clockTower = dressLot(
  {
    id: 'lot:clock',
    kind: 'building',
    x: 30,
    z: -20,
    width: 8,
    depth: 7,
    maxHeight: 20,
    seed: 77,
    zoneId: null,
    zone: 'civic',
    facing: 'east',
    isLandmark: true
  },
  GROUND_Y,
  townDressOf('brass-workshop')
)

beforeEach(() => {
  frame.callbacks.length = 0
})

function groupOf(childCount: number): Group {
  const root = new Group()
  for (let index = 0; index < childCount; index++) root.add(new Group())
  return root
}

const placesOf = (root: Group): number[][] =>
  root.children.map((child) => [...child.position.toArray(), child.rotation.z, child.scale.x])

describe('lantern drones', () => {
  const placed = drawnTown('neo-edo-steam', floor)
  const drones = lanternDrones(placed)

  it('patrol a handful of lots, the same ones on every start', () => {
    expect(drones.length).toBeGreaterThan(2)
    expect(drones.length).toBeLessThanOrEqual(10)
    expect(lanternDrones(drawnTown('neo-edo-steam', floor))).toEqual(drones)
  })

  it('stay over their own lot, clear of the building drawn and under the height limit', () => {
    for (const drone of drones) {
      const under = placed.find((each) => each.key === drone.lotId)
      if (!under) throw new Error('drone without a lot')
      const { lot } = under
      const seen = new Set<string>()
      for (const time of TIMES) {
        const [x, y, z] = dronePosition(drone, time)
        seen.add(`${x.toFixed(1)}:${z.toFixed(1)}`)
        expect(Math.abs(x - lot.x) + DRONE_HALF.side).toBeLessThanOrEqual(lot.width / 2)
        expect(Math.abs(z - lot.z) + DRONE_HALF.side).toBeLessThanOrEqual(lot.depth / 2)
        expect(y - DRONE_HALF.height).toBeGreaterThan(drawnTop(under))
        expect(y + DRONE_HALF.height).toBeLessThanOrEqual(lot.maxHeight)
      }
      expect(seen.size).toBeGreaterThan(20)
    }
  })
})

describe('rising steam', () => {
  it('lifts and swells each puff, then lets it vanish before the next', () => {
    const lifts = TIMES.map((time) => steamPuffAt(time, 0))
    expect(Math.min(...lifts.map((puff) => puff.size))).toBeLessThan(0.1)
    expect(Math.max(...lifts.map((puff) => puff.size))).toBeLessThanOrEqual(1.1)
    for (const puff of lifts) {
      expect(puff.lift).toBeGreaterThanOrEqual(0)
      expect(puff.lift).toBeLessThan(1)
    }
  })
})

describe('tower gears', () => {
  it('sit on the faces of the clock towers drawn, two to a tower, and on nothing else', () => {
    const placed = [clockTower, ...drawnTown('brass-workshop', floor)]
    const towers = placed.filter((each) => each.design === clockTower.design)
    const gears = brassGears(placed)
    expect(gears).toHaveLength(towers.length * 2)
    for (const gear of gears) {
      const [x, y, z] = gear.at
      const tower = towers.find(
        ({ lot }) => Math.abs(x - lot.x) < lot.width / 2 && Math.abs(z - lot.z) < lot.depth / 2
      )
      expect(tower, `gear at ${x}, ${z}`).toBeDefined()
      if (!tower) continue
      expect(y).toBeGreaterThan(GROUND_Y)
      expect(y + gear.radius).toBeLessThan(drawnTop(tower))
    }
  })

  it('turn in place', () => {
    const gears = brassGears([clockTower])
    const root = groupOf(gears.length)
    turnGears(root, 1)
    const before = placesOf(root)
    turnGears(root, 2)
    const after = placesOf(root)
    after.forEach((place, index) => {
      expect(place.slice(0, 3)).toEqual(before[index].slice(0, 3))
      expect(place[3]).not.toBe(before[index][3])
    })
  })
})

describe.each([
  ['Neo Edo Steam', EdoAmbient, drawnTown('neo-edo-steam', floor)],
  ['Brass Workshop', BrassAmbient, [clockTower]]
])('%s ambient part', (_name, Ambient, placed) => {
  // Expands the part and its children so every useFrame in it registers.
  function mount(isReducedMotion: boolean): Group {
    const root = groupOf(60)
    frame.root = root
    const expand = (node: ReactNode): void => {
      if (Array.isArray(node)) return node.forEach(expand)
      if (!node || typeof node !== 'object' || !('type' in node)) return
      const { type, props } = node as { type: unknown; props: { children?: ReactNode } }
      if (typeof type === 'function') return expand((type as (p: object) => ReactNode)(props))
      expand(props.children)
    }
    const props: AmbientProps = {
      floor,
      lots: placed.map((each) => each.lot),
      placed,
      isReducedMotion
    }
    expand(createElement(Ambient, props))
    return root
  }

  function run(time: number): () => void {
    const invalidate = vi.fn()
    for (const callback of frame.callbacks) callback({ clock: { elapsedTime: time }, invalidate })
    return invalidate
  }

  it('moves its things each frame and never asks for another frame', () => {
    const root = mount(false)
    expect(frame.callbacks.length).toBeGreaterThanOrEqual(1)
    const invalidate = run(1)
    const before = placesOf(root)
    run(2.3)
    expect(placesOf(root)).not.toEqual(before)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('holds everything still under reduced motion', () => {
    const root = mount(true)
    const before = placesOf(root)
    run(1)
    run(2.3)
    expect(placesOf(root)).toEqual(before)
  })

  it('draws no steam of its own: the town draws it once', () => {
    frame.callbacks.length = 0
    mount(false)
    expect(frame.callbacks.length).toBe(1)
  })
})
