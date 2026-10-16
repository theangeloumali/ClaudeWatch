import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { Vector3 } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import { ISO_POLAR } from '../../logic/camera-bands'
import { facadeSideOpen } from '../../logic/facade-cutaway'
import { buildingExteriorProfile } from '../../themes/physical-building-parts'
import type { PlacedLot } from '../../themes/lot-kit'
import { box } from '../../themes/parts'
import { getTheme } from '../../themes/registry'
import { BuildingWindows } from '../BuildingWindows'
import { CitySceneryCutaway } from '../CitySceneryCutaway'
import { OperationalStructure } from '../OperationalStructure'
import { PhysicalBuildingShell } from '../PhysicalBuildingShell'

// flicker-2: components are called as plain functions; their frame callbacks are captured and
// fed an orthographic camera pose, and every ref receives a stand-in group.
interface FakeCamera {
  getWorldPosition: (into: Vector3) => Vector3
  getWorldDirection: (into: Vector3) => Vector3
}
type FrameCallback = (state: { camera: FakeCamera }) => void
const frames: FrameCallback[] = []
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => void frames.push(callback)
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current })
}))

interface StandIn {
  label: string
  visible: boolean
}

// Hands every ref a stand-in labelled with the nearest keyed ancestor, as React would on mount.
function mountRefs(node: ReactNode, label = '', standIns: StandIn[] = []): StandIn[] {
  if (Array.isArray(node)) node.forEach((child) => mountRefs(child, label, standIns))
  if (!isValidElement(node)) return standIns
  const element = node as ReactElement<{ ref?: unknown; name?: string; children?: ReactNode }>
  const own = typeof element.key === 'string' ? element.key : (element.props.name ?? label)
  const { ref } = element.props
  if (typeof ref === 'function' || (typeof ref === 'object' && ref !== null)) {
    const standIn = { label: own, visible: true }
    if (typeof ref === 'function') ref(standIn)
    else Object.assign(ref, { current: standIn })
    standIns.push(standIn)
  }
  mountRefs(element.props.children, own, standIns)
  return standIns
}

const theme = getTheme('corporate-city')
const floor = { ...makeFloor({ floorId: 'flicker-switch', width: 42.6, depth: 38 }), elevation: 0 }
const profile = buildingExteriorProfile({ floor, theme })
const DEG = Math.PI / 180
const QUARTER_TURNS = [0, 90, 180, 270]

// An orthographic camera aimed at `target` from `azimuthDeg`, as camera-controls places it.
function cameraAt(
  azimuthDeg: number,
  { target = new Vector3(floor.x, 0, floor.z), distance = 250 } = {}
): FakeCamera {
  const offset = new Vector3(
    Math.sin(azimuthDeg * DEG) * Math.sin(ISO_POLAR),
    Math.cos(ISO_POLAR),
    Math.cos(azimuthDeg * DEG) * Math.sin(ISO_POLAR)
  )
  const position = target.clone().addScaledVector(offset, distance)
  return {
    getWorldPosition: (into) => into.copy(position),
    getWorldDirection: (into) => into.copy(offset).negate()
  }
}

function drawnSides(standIns: readonly StandIn[], camera: FakeCamera): string {
  frames.forEach((frame) => frame({ camera }))
  return standIns
    .filter((standIn) => standIn.visible)
    .map((standIn) => standIn.label)
    .sort()
    .join(',')
}

const mounts = {
  BuildingWindows: () =>
    mountRefs(
      BuildingWindows({
        floor,
        palette: theme.palette,
        wallsMode: 'cutaway',
        presentation: 'exterior',
        exteriorProfile: profile
      })
    ),
  OperationalStructure: () =>
    mountRefs(
      OperationalStructure({ floor, theme, profile, wallsMode: 'cutaway', isOverview: false })
    )
}

beforeEach(() => {
  frames.length = 0
})

describe('facadeSideOpen', () => {
  it('opens above the band, closes below it and holds inside it', () => {
    expect(facadeSideOpen(0.09, false)).toBe(true)
    expect(facadeSideOpen(-0.09, true)).toBe(false)
    expect(facadeSideOpen(0.05, false)).toBe(false)
    expect(facadeSideOpen(-0.05, true)).toBe(true)
  })

  it('starts from the sign on mount', () => {
    expect(facadeSideOpen(0.01, null)).toBe(true)
    expect(facadeSideOpen(-0.01, null)).toBe(false)
  })
})

describe('facade cutaways decide by view direction, with hysteresis (flicker-2)', () => {
  it.each(Object.entries(mounts))('a 0.4° wobble keeps the same sides: %s', (_, mount) => {
    const standIns = mount()
    const drawn = new Set(
      [-0.2, 0.2, -0.2, 0.2].map((wobble) => drawnSides(standIns, cameraAt(90 + wobble)))
    )
    expect(drawn.size, [...drawn].join(' | ')).toBe(1)
  })

  it.each(Object.entries(mounts))(
    'holds sides across a ±0.4° wobble at every quarter turn: %s',
    (_, mount) => {
      for (const turn of QUARTER_TURNS) {
        frames.length = 0
        const standIns = mount()
        const drawn = new Set(
          [-0.4, 0.4, -0.4, 0.4].map((wobble) => drawnSides(standIns, cameraAt(turn + wobble)))
        )
        expect(drawn.size, `${turn}°: ${[...drawn].join(' | ')}`).toBe(1)
      }
    }
  )

  it.each(Object.entries(mounts))('a real turn still swaps the cut sides: %s', (_, mount) => {
    const standIns = mount()
    const looking = drawnSides(standIns, cameraAt(45))
    expect(drawnSides(standIns, cameraAt(135))).not.toBe(looking)
    expect(drawnSides(standIns, cameraAt(45))).toBe(looking)
  })

  it.each(Object.entries(mounts))('a pan along a wall flips no side: %s', (_, mount) => {
    const standIns = mount()
    const before = drawnSides(standIns, cameraAt(90.5, { target: new Vector3(0, 0, floor.z + 2) }))
    expect(drawnSides(standIns, cameraAt(90.5, { target: new Vector3(0, 0, floor.z - 2) }))).toBe(
      before
    )
  })

  it.each(Object.entries(mounts))('a Horizon pushBack alone flips no side: %s', (_, mount) => {
    const standIns = mount()
    const target = new Vector3(floor.x, 0, floor.z + 3)
    const before = drawnSides(standIns, cameraAt(90.5, { target, distance: 250 }))
    expect(drawnSides(standIns, cameraAt(90.5, { target, distance: 550 }))).toBe(before)
  })

  it('the entrance facade holds across a wobble along its wall', () => {
    const standIns = mountRefs(
      PhysicalBuildingShell({ floors: [floor], theme, focusedFloorId: floor.floorId })
    ).filter((standIn) => standIn.label.startsWith('physical-entrance-facade:'))
    expect(standIns).toHaveLength(1)
    const target = new Vector3(floor.x, 0, floor.z + floor.depth / 2)
    const drawn = new Set(
      [-0.4, 0.4, -0.4, 0.4].map((wobble) =>
        drawnSides(standIns, cameraAt(90 + wobble, { target }))
      )
    )
    expect(drawn.size, [...drawn].join(' | ')).toBe(1)
  })
})

describe('city cutaway (flicker-2)', () => {
  const lotAt = (key: string, x: number, z: number): PlacedLot => ({
    key,
    at: [x, 0, z],
    turn: 0,
    scale: 1,
    parts: [box([0, 3, 0], [4, 6, 4], '#7a8a99')],
    lot: {
      id: key,
      kind: 'building',
      x,
      z,
      width: 4,
      depth: 4,
      maxHeight: 6,
      seed: 1,
      zoneId: null
    },
    design: 'probe-tower'
  })
  const placed = [
    lotAt('north', floor.x, floor.z - 25),
    lotAt('south', floor.x, floor.z + 25),
    lotAt('east', floor.x + 25, floor.z),
    lotAt('west', floor.x - 25, floor.z)
  ]

  it('upper city lots don’t blink at the boundary', () => {
    const standIns = mountRefs(
      CitySceneryCutaway({ placed, floor, revision: 'probe', isInspecting: true })
    )
    expect(standIns.map((standIn) => standIn.label).sort()).toEqual([
      'east',
      'north',
      'south',
      'west'
    ])
    for (const turn of QUARTER_TURNS) {
      const drawn = new Set(
        [-0.4, 0.4, -0.4, 0.4].map((wobble) => drawnSides(standIns, cameraAt(turn + wobble)))
      )
      expect(drawn.size, `${turn}°: ${[...drawn].join(' | ')}`).toBe(1)
    }
  })

  it('still cuts the upper band in front at a clear angle', () => {
    const standIns = mountRefs(
      CitySceneryCutaway({ placed, floor, revision: 'probe', isInspecting: true })
    )
    expect(drawnSides(standIns, cameraAt(20))).toBe('north,west')
    expect(drawnSides(standIns, cameraAt(200))).toBe('east,south')
  })
})
