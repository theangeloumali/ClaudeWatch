import { describe, expect, it, vi } from 'vitest'
import { buildLayout } from '../../../office/sim/layout'
import { createWorldDocument } from '../../../shared/office/world-document'
import { makeSession } from '../__tests__/fixtures'
import { VenueLayer } from '../scene/VenueLayer'
import { MAP_ROTATIONS } from '../town/sightline.test-utils'
import { listThemes } from './registry'
import { mergedDraws } from './scene.test-utils'
import { venueLandmark } from './venue-landmarks'
import { boundsOf, covered, enters, silhouette, type Bounds } from './venue-landmarks.test-utils'

const landmarks = vi.hoisted(() => ({ isOff: false }))
vi.mock('./venue-landmarks', async (importOriginal) => {
  const real = await importOriginal<typeof import('./venue-landmarks')>()
  return {
    ...real,
    venueLandmark: (...args: Parameters<typeof real.venueLandmark>) =>
      landmarks.isOff ? [] : real.venueLandmark(...args)
  }
})
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useLayoutEffect: () => undefined,
  useEffect: () => undefined,
  memo: (component: unknown) => component,
  useRef: (current: unknown) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))

const sessions = [makeSession({ key: 'claude:venue-landmarks' })]
const venues = createWorldDocument(buildLayout(sessions, undefined), sessions).venues
const THEMES = listThemes()
// Venues keep 3 m from every office (world-document-venues.ts): the Heights rule allows 6.1 m.
const HEIGHT_CAP_M = 0.7 * 3 + 4
const FOOTPRINT_SLACK_M = 0.1
const MIN_SILHOUETTE_CHANGE = 0.15
// An agent's seat and the machine before it, and the walk in from the door under head height.
const SLOT_HALF_WIDTH_M = 1
const SLOT_REACH_M = { front: 0.8, back: 2.4 }
const APPROACH_HALF_WIDTH_M = 1.5
const HEADROOM_M = 2.6
// A face reads as dressed when tall parts near it cover this share of its length.
const DRESSING_REACH_M = 1.5
const DRESSING_MIN_TOP_M = 1.5
const MIN_DRESSED_SHARE = 0.3

describe('venue landmarks', () => {
  it('covers every venue kind', () => {
    expect(venues.map((venue) => venue.kind).sort()).toEqual([
      'arcade',
      'garage',
      'lounge',
      'market',
      'transit'
    ])
  })

  it('each venue kind has its own silhouette within its 12 × 10 m footprint', () => {
    for (const theme of THEMES) {
      const shapes = venues.map((venue) => {
        const parts = venueLandmark(venue, theme.palette)
        const where = `${theme.id} ${venue.kind}`
        expect(parts.length, where).toBeGreaterThan(0)
        expect(venue.footprint, where).toMatchObject({ width: 12, depth: 10 })
        for (const part of parts) {
          const box = boundsOf(part)
          expect(part.rotation, where).toBeUndefined()
          expect(box.min[1], where).toBeGreaterThanOrEqual(0)
          expect(box.max[1], where).toBeLessThanOrEqual(HEIGHT_CAP_M)
          for (const [axis, span] of [
            [0, venue.footprint.width],
            [2, venue.footprint.depth]
          ] as const) {
            expect(box.min[axis], where).toBeGreaterThanOrEqual(-span / 2 - FOOTPRINT_SLACK_M)
            expect(box.max[axis], where).toBeLessThanOrEqual(span / 2 + FOOTPRINT_SLACK_M)
          }
        }
        return silhouette(venue, parts)
      })
      for (let a = 0; a < shapes.length; a += 1)
        for (let b = a + 1; b < shapes.length; b += 1) {
          const changed = shapes[a].filter((top, cell) => Math.abs(top - shapes[b][cell]) > 0.5)
          expect(
            changed.length / shapes[a].length,
            `${theme.id} ${venues[a].kind} vs ${venues[b].kind}`
          ).toBeGreaterThanOrEqual(MIN_SILHOUETTE_CHANGE)
        }
    }
  })

  it('venue slots and entrances are unchanged', () => {
    const before = structuredClone(venues)
    for (const theme of THEMES) {
      VenueLayer({ venues, palette: theme.palette, theme })
      for (const venue of venues) {
        const parts = venueLandmark(venue, theme.palette)
        const where = `${theme.id} ${venue.kind}`
        const front = Math.min(...venue.slots.map((slot) => slot.z)) - SLOT_REACH_M.front
        const approach: Bounds = {
          min: [venue.entrance.x - APPROACH_HALF_WIDTH_M, 0, venue.entrance.z],
          max: [venue.entrance.x + APPROACH_HALF_WIDTH_M, HEADROOM_M, front]
        }
        expect(
          parts.filter((part) => enters(part, approach)),
          `${where} approach`
        ).toEqual([])
        for (const slot of venue.slots) {
          const seat: Bounds = {
            min: [slot.x - SLOT_HALF_WIDTH_M, -Infinity, slot.z - SLOT_REACH_M.front],
            max: [slot.x + SLOT_HALF_WIDTH_M, Infinity, slot.z + SLOT_REACH_M.back]
          }
          expect(
            parts.filter((part) => enters(part, seat)),
            `${where} ${slot.id}`
          ).toEqual([])
        }
      }
    }
    expect(venues).toEqual(before)
  })

  it('venue landmarks add at most 1 draw per theme', () => {
    for (const theme of THEMES) {
      const measure = () =>
        mergedDraws(VenueLayer({ venues, palette: theme.palette, theme }).props.children)
      landmarks.isOff = true
      const without = measure()
      landmarks.isOff = false
      const withLandmarks = measure()
      expect(withLandmarks.triangles, theme.id).toBeGreaterThan(without.triangles)
      expect(withLandmarks.draws - without.draws, theme.id).toBeLessThanOrEqual(1)
    }
  })

  it('every face is dressed at each quarter turn', () => {
    const bare: string[] = []
    for (const theme of THEMES)
      for (const venue of venues) {
        const boxes = venueLandmark(venue, theme.palette).map(boundsOf)
        for (const [turn, azimuth] of MAP_ROTATIONS.entries()) {
          const toCamera = [Math.sin(azimuth), 0, Math.cos(azimuth)]
          for (const axis of [0, 2] as const) {
            const sign = Math.sign(toCamera[axis])
            const half = (axis === 0 ? venue.footprint.width : venue.footprint.depth) / 2
            const along = axis === 0 ? 2 : 0
            const length = axis === 0 ? venue.footprint.depth : venue.footprint.width
            const near = boxes.filter(
              (box) =>
                box.max[1] >= DRESSING_MIN_TOP_M &&
                (sign > 0 ? box.max[axis] : -box.min[axis]) >= half - DRESSING_REACH_M
            )
            const spans = near.map((box): [number, number] => [box.min[along], box.max[along]])
            const share = covered(spans, -length / 2, length / 2) / length
            if (share < MIN_DRESSED_SHARE)
              bare.push(
                `${theme.id} ${venue.kind} turn ${turn} ${sign > 0 ? '+' : '-'}${'xyz'[axis]}`
              )
          }
        }
      }
    expect(bare).toEqual([])
  })
})
