import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { officeSettings } from '../logic/office-settings'
import { pinQuality } from '../quality-store'
import type { FloorGeometry } from '../scene-model'
import { campusClaim, neededClaim } from './town-claim'
import { CLAIM_STORAGE_KEY, townOf, useTownPlan } from './use-town-plan'
import { LARGE_FLOOR, PAIR_FLOOR, edges, widened } from './town.test-utils'

const fresh = (floor: FloorGeometry) => edges(campusClaim(neededClaim(floor), null))
const store = (value: unknown): void =>
  localStorage.setItem(CLAIM_STORAGE_KEY, JSON.stringify(value))
const stored = (): unknown => JSON.parse(localStorage.getItem(CLAIM_STORAGE_KEY) ?? 'null')
// The scene's town: the city round the floor's own site.
const cityOn = (floor: FloorGeometry) => useTownPlan(floor, { protectedSites: [floor] })

beforeEach(() => {
  localStorage.clear()
  officeSettings.reset()
  pinQuality('full')
})
afterEach(() => vi.restoreAllMocks())

describe('townOf', () => {
  it('is the town of the floor alone when nothing is held', () => {
    const town = townOf(LARGE_FLOOR, null, 'full')
    expect(edges(town.plan.claim)).toEqual(fresh(LARGE_FLOOR))
    expect(town.green.length).toBeGreaterThan(0)
    expect(town.owners.size).toBeGreaterThan(0)
  })

  it('hands back the same plan for a floor that moves no claim edge', () => {
    const first = townOf(LARGE_FLOOR, null, 'full')
    const again = townOf(structuredClone(LARGE_FLOOR), first.plan.claim, 'full')
    expect(again.plan).toBe(first.plan)
  })
})

describe('useTownPlan', () => {
  it('previews moved plots without changing the persisted live claim or its held edges', () => {
    const initialProps: {
      preview: { floor: FloorGeometry; protectedSites: FloorGeometry[] } | undefined
    } = { preview: undefined }
    const { result, rerender } = renderHook(
      ({
        preview
      }: {
        preview: { floor: FloorGeometry; protectedSites: FloorGeometry[] } | undefined
      }) => useTownPlan(PAIR_FLOOR, { protectedSites: [PAIR_FLOOR], preview }),
      { initialProps }
    )
    const live = result.current
    const before = localStorage.getItem(CLAIM_STORAGE_KEY)
    const draft = { ...PAIR_FLOOR, x: PAIR_FLOOR.x + 350 }
    rerender({ preview: { floor: draft, protectedSites: [draft] } })
    expect(result.current.plan.officeSites).toEqual([draft])
    expect(edges(result.current.plan.claim)).not.toEqual(edges(live.plan.claim))
    expect(localStorage.getItem(CLAIM_STORAGE_KEY)).toBe(before)
    rerender({ preview: undefined })
    expect(edges(result.current.plan.claim)).toEqual(edges(live.plan.claim))
    expect(localStorage.getItem(CLAIM_STORAGE_KEY)).toBe(before)
  })

  it('uses a stored claim that still holds the campus', () => {
    // A floor whose east edge a first start would snap 15 m out, so 12 m nearer still holds it.
    const spare = fresh(LARGE_FLOOR).east - edges(neededClaim(LARGE_FLOOR)).east
    const floor = widened(LARGE_FLOOR, (((spare - 15) % 12) + 12) % 12)
    const held = { ...fresh(floor), east: fresh(floor).east - 12 }
    store({ version: 1, ...held })
    const { result } = renderHook(() => cityOn(floor))
    expect(edges(result.current.plan.claim)).toEqual(held)
  })

  it.each([
    ['text that is not JSON', '{nope'],
    ['a list', JSON.stringify([1, 2, 3, 4])],
    ['edges off the 12 m lines', JSON.stringify({ version: 1, ...fresh(LARGE_FLOOR), east: 100 })],
    ['a missing edge', JSON.stringify({ version: 1, west: -24, east: 96, north: -48 })],
    ['another version', JSON.stringify({ version: 2, ...fresh(LARGE_FLOOR) })]
  ])('ignores %s in storage', (_name, raw) => {
    localStorage.setItem(CLAIM_STORAGE_KEY, raw)
    const { result } = renderHook(() => cityOn(LARGE_FLOOR))
    expect(edges(result.current.plan.claim)).toEqual(fresh(LARGE_FLOOR))
  })

  it('ignores a stored claim that no longer contains the campus', () => {
    store({ version: 1, ...fresh(PAIR_FLOOR), east: 12 })
    const { result } = renderHook(() => cityOn(PAIR_FLOOR))
    expect(edges(result.current.plan.claim)).toEqual(fresh(PAIR_FLOOR))
  })

  it('stores the claim of a first start', () => {
    renderHook(() => cityOn(LARGE_FLOOR))
    expect(stored()).toEqual({ version: 1, ...fresh(LARGE_FLOOR) })
  })

  it('writes only when the claim changes', () => {
    store({ version: 1, ...fresh(LARGE_FLOOR) })
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const { result, rerender } = renderHook(({ floor }) => cityOn(floor), {
      initialProps: { floor: LARGE_FLOOR }
    })
    rerender({ floor: structuredClone(LARGE_FLOOR) })
    rerender({ floor: widened(LARGE_FLOOR, 1) })
    expect(write).not.toHaveBeenCalled()
    rerender({ floor: widened(LARGE_FLOOR, 30) })
    expect(write).toHaveBeenCalledTimes(1)
    expect(stored()).toEqual({ version: 1, ...edges(result.current.plan.claim) })
  })

  it('holds an edge when the campus comes back in by less than the release distance', () => {
    const { result, rerender } = renderHook(({ floor }) => cityOn(floor), {
      initialProps: { floor: widened(LARGE_FLOOR, 30) }
    })
    const grown = edges(result.current.plan.claim)
    const spare = grown.east - edges(neededClaim(widened(LARGE_FLOOR, 30))).east
    // Half of what is left before the edge lets go.
    rerender({ floor: widened(LARGE_FLOOR, 30 - (18 - spare) / 2) })
    expect(edges(result.current.plan.claim)).toEqual(grown)
    rerender({ floor: LARGE_FLOOR })
    expect(edges(result.current.plan.claim)).toEqual(fresh(LARGE_FLOOR))
  })

  it('plans a city when nothing is stored', () => {
    const { result } = renderHook(() => cityOn(LARGE_FLOOR))
    expect(result.current.plan.size).toBe('city')
  })
})
