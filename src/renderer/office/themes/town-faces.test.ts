import { describe, expect, it, vi } from 'vitest'
import { buildLayout } from '../../../office/sim/layout'
import { createWorldDocument } from '../../../shared/office/world-document'
import { makeSession } from '../__tests__/fixtures'
import {
  coplanarConflicts,
  drawnBoxes,
  kindsOf,
  partBoxes
} from '../scene/__tests__/coplanar.test-utils'
import { VenueLayer } from '../scene/VenueLayer'
import { MAP_ROTATIONS } from '../town/sightline.test-utils'
import type { ZoneDesign, ZonePlot } from '../town/town-dress'
import { wing } from './corporate-city/building-parts'
import { CORPORATE_MATERIALS } from './corporate-city/palette'
import { CORPORATE_DESIGNS } from './corporate-city/town-designs'
import { box, type PartSpec } from './parts'
import { listThemes } from './registry'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useLayoutEffect: () => undefined,
  useEffect: () => undefined,
  memo: (component: unknown) => component,
  useRef: (current: unknown) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))

const ACCENT = '#123456'
const sessions = [makeSession({ key: 'claude:town-faces' })]
const venues = createWorldDocument(buildLayout(sessions, undefined), sessions).venues
// A town lot, an avenue lot seen from its front and its side, and a city parcel.
const FOOTPRINTS = [
  { width: 8, depth: 8 },
  { width: 8, depth: 5 },
  { width: 5, depth: 8 },
  { width: 18, depth: 24 }
]
// Glass this close to a face, measured outward, reads as dressing that face.
const DRESSING_REACH_M = 0.3
const MIN_GLASS_SPAN = 0.8

interface Face {
  axis: 0 | 2
  sign: 1 | -1
}
const FACES: readonly Face[] = [
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 }
]

function plotsOf(design: ZoneDesign): ZonePlot[] {
  const { min, max } = design.height
  return FOOTPRINTS.flatMap((footprint) =>
    [min, (min + max) / 2, max].map((height) => ({ ...footprint, height, seed: 7, accent: ACCENT }))
  )
}

const low = (part: PartSpec, axis: number): number => part.at[axis] - part.size[axis] / 2
const high = (part: PartSpec, axis: number): number => part.at[axis] + part.size[axis] / 2
const shared = (a: PartSpec, b: PartSpec, axis: number): number =>
  Math.min(high(a, axis), high(b, axis)) - Math.max(low(a, axis), low(b, axis))

// A wing's body: a facade box on the ground, a third of the lot tall; planters stand a tenth.
function bodiesOf(parts: readonly PartSpec[], plot: ZonePlot): PartSpec[] {
  return parts.filter(
    (part) =>
      part.shape === 'box' &&
      part.color === CORPORATE_MATERIALS.facade &&
      part.size[1] >= plot.height * 0.3 &&
      part.size[0] >= plot.width * 0.12 &&
      part.size[2] >= plot.depth * 0.12 &&
      low(part, 1) <= plot.height * 0.35
  )
}

function isDressed(body: PartSpec, face: Face, parts: readonly PartSpec[]): boolean {
  const plane = face.sign > 0 ? high(body, face.axis) : low(body, face.axis)
  const along = face.axis === 0 ? 2 : 0
  return parts.some((part) => {
    if (part.color !== CORPORATE_MATERIALS.glass) return false
    const outward = (part.at[face.axis] - plane) * face.sign
    return (
      outward > 0 &&
      outward < DRESSING_REACH_M &&
      shared(part, body, along) >= body.size[along] * MIN_GLASS_SPAN &&
      shared(part, body, 1) >= body.size[1] * 0.5
    )
  })
}

// The two faces whose outward normals point toward the camera at one map rotation.
function facesToward(azimuth: number): Face[] {
  const toCamera = [Math.sin(azimuth), 0, Math.cos(azimuth)]
  return FACES.filter((face) => toCamera[face.axis] * face.sign > 0)
}

describe('town buildings are finished on every side', () => {
  const fillers = CORPORATE_DESIGNS.filter((design) => !design.zones.includes('park'))

  it('every corporate filler design dresses all four faces at each quarter turn', () => {
    expect(fillers.length).toBeGreaterThan(0)
    const bare: string[] = []
    for (const design of fillers)
      for (const plot of plotsOf(design)) {
        const where = `${design.name} ${plot.width}x${plot.depth}x${plot.height}`
        const parts = design.build(plot)
        const bodies = bodiesOf(parts, plot)
        expect(bodies.length, where).toBeGreaterThan(0)
        for (const [turn, azimuth] of MAP_ROTATIONS.entries())
          for (const face of facesToward(azimuth))
            for (const [index, body] of bodies.entries())
              if (!isDressed(body, face, parts))
                bare.push(
                  `${where} turn ${turn} body ${index} ${face.sign > 0 ? '+' : '-'}${'xyz'[face.axis]}`
                )
      }
    expect(bare).toEqual([])
  })

  it('curtain bands fall a storey apart, at most seven to a face', () => {
    const glassBands = (plotHeight: number): number => {
      const parts = wing(box([0, 0.4, 0], [0.8, 0.74, 0.6], ACCENT), {
        width: 8,
        depth: 8,
        height: plotHeight
      })
      const front = parts.filter(
        (part) =>
          part.color === CORPORATE_MATERIALS.facade && part.at[2] > 0.3 && part.size[1] < 0.74 * 0.1
      )
      return front.length
    }
    // 0.74 of 12 m is 8.9 m, three storeys of 3.2 m and two bands between them.
    expect(glassBands(12)).toBe(2)
    expect(glassBands(60)).toBe(7)
  })

  it('no town or venue design in any theme has a coplanar face pair', () => {
    const townTies = listThemes().flatMap((theme) =>
      (theme.town?.designs ?? []).flatMap((design) =>
        plotsOf(design).flatMap((plot) =>
          coplanarConflicts(partBoxes(design.name, design.build(plot), [0, 0, 0])).map(
            (line) => `${theme.id} ${plot.width}x${plot.depth}x${plot.height}: ${line}`
          )
        )
      )
    )
    // Each venue as VenueLayer draws it: slab, canopy, posts, furniture, lounge and landmark.
    const venueTies = listThemes().flatMap((theme) =>
      venues.flatMap((venue) => {
        const layer = VenueLayer({ venues: [venue], palette: theme.palette, theme })
        return coplanarConflicts(drawnBoxes(layer.props.children, venue.kind)).map(
          (line) => `${theme.id} venue: ${line}`
        )
      })
    )
    const ties = [...townTies, ...venueTies]
    expect(ties.length, `tied face kinds:\n${kindsOf(ties)}`).toBe(0)
  })
})
