import { describe, expect, it } from 'vitest'
import { buildLayout } from '../../../office/sim/layout'
import { session, subagent } from '../../../office/sim/fixtures'
import { createWorldDocument, parseWorldDocument, validateWorldDocument } from '../world-document'

const sessions = [session('one')]
const layout = buildLayout(sessions, undefined)
const fresh = () => createWorldDocument(layout, sessions)

describe('world document boundary', () => {
  it('round trips presentation and stable allocation, never session activity', () => {
    const document = fresh()
    expect(parseWorldDocument(JSON.parse(JSON.stringify(document)))).toEqual({
      success: true,
      document
    })
    expect(document.rooms[0].target).toBe('session:one')
    expect(JSON.stringify(document)).not.toMatch(
      /currentTool|startedAtMs|attention|provider|terminal/
    )
    expect(validateWorldDocument(document, { layout, sessions })).toEqual([])
  })

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite coordinates %s', (coordinate) => {
    const document = fresh()
    document.buildings[0].footprint.x = coordinate
    expect(parseWorldDocument(document).success).toBe(false)
  })

  it('rejects future versions, unexpected and malicious keys, oversized labels', () => {
    expect(parseWorldDocument({ ...fresh(), version: 3 }).success).toBe(false)
    expect(parseWorldDocument({ ...fresh(), activity: 'idle' }).success).toBe(false)
    expect(parseWorldDocument(JSON.parse('{"version":2,"__proto__":{}}')).success).toBe(false)
    const document = fresh()
    document.rooms[0].displayName = '😀'.repeat(120)
    expect(parseWorldDocument(document).success).toBe(true)
    document.rooms[0].displayName += '😀'
    expect(parseWorldDocument(document).success).toBe(false)
  })

  it('rejects duplicate targets, unknown floors, theme IDs and occupied shrinking', () => {
    const document = fresh()
    document.rooms.push(structuredClone(document.rooms[0]))
    expect(parseWorldDocument(document).success).toBe(false)
    const floorDraft = fresh()
    floorDraft.rooms[0].floorNumber = 3
    expect(validateWorldDocument(floorDraft, { layout, sessions })).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'unknown-floor' })])
    )
    const themeDraft = fresh()
    themeDraft.rooms[0].themeId = 'not-installed'
    expect(
      validateWorldDocument(themeDraft, { layout, sessions, knownThemeIds: ['installed'] })
    ).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'unknown-theme' })]))
    const shrinkDraft = fresh()
    shrinkDraft.rooms[0].desks.pop()
    const occupied = [{ ...sessions[0], subagents: [subagent('guest-a'), subagent('guest-b')] }]
    expect(validateWorldDocument(shrinkDraft, { layout, sessions: occupied })).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'occupied-capacity' })])
    )
  })

  it('retains dormant bindings without requiring departed sessions', () => {
    expect(
      validateWorldDocument(fresh(), { layout: buildLayout([], undefined), sessions: [] })
    ).toEqual([])
  })

  it('rejects room overlap, blocked connectors and unreachable seats', () => {
    const crowded = [session('one'), session('two')]
    const crowdedLayout = buildLayout(crowded, undefined)
    const document = createWorldDocument(crowdedLayout, crowded)
    document.rooms[1].position = { ...document.rooms[0].position }
    expect(validateWorldDocument(document, { layout: crowdedLayout, sessions: crowded })).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'overlap' })])
    )
    const blocked = fresh()
    const connector = blocked.buildings[0].connector!
    blocked.rooms[0].position = { x: connector.x, z: connector.z }
    expect(validateWorldDocument(blocked, { layout, sessions })).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'blocked-connector' })])
    )
    const unreachable = fresh()
    unreachable.rooms[0].desks[0].x = 100
    expect(validateWorldDocument(unreachable, { layout, sessions })).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'desk-clearance' })])
    )
  })

  it('checks new live rooms as well as saved overrides', () => {
    const document = fresh()
    const latestSessions = [session('one'), session('two')]
    const latestLayout = buildLayout(latestSessions, layout)
    document.rooms[0].size.width = document.buildings[0].footprint.width
    expect(
      validateWorldDocument(document, { layout: latestLayout, sessions: latestSessions })
    ).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'overlap' })]))
  })

  it('bounds byte size and legacy seed integers without touching rejected input', () => {
    const huge = { ...fresh(), padding: 'x'.repeat(1024 * 1024) }
    expect(parseWorldDocument(huge)).toMatchObject({
      success: false,
      errors: [{ reason: 'limit' }]
    })
    const document = fresh()
    document.allocation!.reservations[0].bay = 1.5
    const before = structuredClone(document)
    expect(parseWorldDocument(document).success).toBe(false)
    expect(document).toEqual(before)
  })
})
