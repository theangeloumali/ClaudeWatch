import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { session, subagent } from '../../../office/sim/fixtures'
import { buildLayout } from '../../../office/sim/layout'
import { createWorldDocument, validateWorldDocument } from '../../../shared/office/world-document'
import { overlaps } from '../../../shared/office/world-document-geometry'
import type { FeedMessage, SessionRef } from '../../../shared/office/types'
import { createOfficeSettingsStore } from '../../office/logic/office-settings'
import type { OfficeFrame } from '../../office/scene-model'
import { createLiveFeed, type FeedSource } from '../live-feed'
import { WORLD_DOCUMENT_STORAGE_KEY } from '../world-document-store'

const ROSTER_SEQUENCE = [
  [1],
  [1, 1],
  [2, 1],
  [2, 1, 1],
  [4, 1, 1],
  [4, 1, 1, 1],
  [7, 1, 1, 1],
  [4, 1, 1, 1],
  [4, 1, 1]
] as const
const subscriptions: (() => void)[] = []

function sessionsFor(projectSizes: readonly number[]): SessionRef[] {
  return projectSizes.flatMap((workerCount, projectIndex) =>
    Array.from({ length: workerCount }, (_, workerIndex) =>
      session(`claude:project-${projectIndex}-worker-${workerIndex}`, `project-${projectIndex}`)
    )
  )
}

// dry-new: live-feed.test.ts has private setup; this harness keeps ticks visible.
function createEnvironment() {
  const frames: OfficeFrame[] = []
  const bytes = new Map<string, string>()
  const storage = {
    getItem: (key: string) => bytes.get(key) ?? null,
    setItem: vi.fn((key: string, serialized: string) => {
      bytes.set(key, serialized)
    })
  }
  let listener: ((message: FeedMessage) => void) | undefined
  const source: FeedSource = {
    ready: vi.fn().mockResolvedValue(undefined),
    onFeedMessage: vi.fn((next: (message: FeedMessage) => void) => {
      listener = next
      return () => {
        listener = undefined
      }
    }),
    focus: vi.fn().mockResolvedValue({ success: true, target: 'pane' }),
    send: vi.fn().mockResolvedValue({ success: true }),
    respond: vi.fn().mockResolvedValue({ success: true }),
    peek: vi.fn().mockResolvedValue({ success: true, lines: ['ok'] }),
    start: vi.fn().mockResolvedValue({ success: true })
  }
  const settings = createOfficeSettingsStore(null)
  settings.set('loungeTrips', false)
  const feed = createLiveFeed(source, {
    storage,
    settings,
    visibility: {
      read: () => ({ isHidden: false, isFocused: true }),
      onChange: () => () => undefined
    }
  })
  subscriptions.push(feed.subscribe((frame) => frames.push(frame)))
  const emit = (message: FeedMessage): OfficeFrame => {
    if (!listener) throw new Error('Feed must be subscribed before publishing')
    const previousCount = frames.length
    listener(message)
    vi.advanceTimersByTime(100)
    expect(frames.length).toBeGreaterThan(previousCount)
    const latest = frames.at(-1)
    if (!latest) throw new Error('Feed did not emit a frame')
    return latest
  }
  let revision = 0
  const publish = (sessions: SessionRef[]): OfficeFrame =>
    emit({
      type: 'hello',
      v: 1,
      snapshot: {
        rev: ++revision,
        generatedAtMs: Date.now(),
        sessions,
        sources: [{ id: 'test-source', ok: true, detail: 'healthy' }]
      }
    })
  return { bytes, storage, settings, feed, frames, emit, publish }
}

function expectSeparatedSites(frame: OfficeFrame, roster: readonly number[]): void {
  const venues = frame.venues ?? []
  expect(venues.length).toBeGreaterThan(0)
  const sites = [
    ...frame.floors
      .filter((floor) => (floor.elevation ?? 0) === 0)
      .map((floor) => ({ id: floor.floorId, footprint: floor })),
    ...venues.map((venue) => ({ id: venue.id, footprint: venue.footprint }))
  ]
  for (const [index, first] of sites.entries())
    for (const second of sites.slice(index + 1))
      expect
        .soft(overlaps(first.footprint, second.footprint), `${roster}: ${first.id}/${second.id}`)
        .toBe(false)
}

describe('effective venues in createLiveFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe()
    vi.useRealTimers()
  })

  it('keeps every rendered office and venue separated through the reproduced roster sequence', () => {
    const environment = createEnvironment()
    const initial = sessionsFor([1])
    const venueIds = createWorldDocument(buildLayout(initial, undefined), initial)
      .venues.map((venue) => venue.id)
      .sort()
    for (const roster of ROSTER_SEQUENCE) {
      const frame = environment.publish(sessionsFor(roster))
      expect(frame.venues?.map((venue) => venue.id).sort()).toEqual(venueIds)
      expectSeparatedSites(frame, roster)
    }
  })

  it('keeps these small generated rosters on one ground storey per active project', () => {
    const environment = createEnvironment()
    for (const roster of ROSTER_SEQUENCE) {
      const sessions = sessionsFor(roster)
      const frame = environment.publish(sessions)
      expect(frame.floors).toHaveLength(roster.length)
      expect(frame.floors.map((floor) => floor.floorNumber)).toEqual(roster.map(() => 1))
      expect(frame.floors.map((floor) => floor.elevation)).toEqual(roster.map(() => 0))
      expect(
        frame.floors
          .flatMap((floor) =>
            floor.rooms.flatMap((room) => (room.sessionKey === null ? [] : [room.sessionKey]))
          )
          .sort()
      ).toEqual(sessions.map((worker) => worker.key).sort())
    }
  })

  it('removes empty offices and restores separated geometry when workers return', () => {
    const environment = createEnvironment()
    for (const roster of ROSTER_SEQUENCE) environment.publish(sessionsFor(roster))
    const empty = environment.publish([])
    expect(empty).toMatchObject({ connected: true, sessions: [], floors: [] })
    const returning = environment.publish(sessionsFor([4, 1, 1]))
    expect(returning.floors).toHaveLength(3)
    expect(returning.sessions).toHaveLength(6)
    expectSeparatedSites(returning, [4, 1, 1])
  })

  it('initializes without workers, then generates separated offices and venues on arrival', () => {
    const environment = createEnvironment()
    const empty = environment.publish([])
    expect(empty).toMatchObject({ connected: true, sessions: [], floors: [], venues: [] })
    const arriving = environment.publish(sessionsFor([1, 1]))
    expect(arriving.floors).toHaveLength(2)
    expectSeparatedSites(arriving, [1, 1])
    expect(environment.storage.setItem).not.toHaveBeenCalled()
  })

  it('adapts automatic geometry without writing saved document bytes or advancing its revision', () => {
    const environment = createEnvironment()
    const initial = sessionsFor([1])
    const layout = buildLayout(initial, undefined)
    const document = createWorldDocument(layout, initial)
    document.revision = 7
    environment.bytes.set('claudewatch.office.layout', JSON.stringify(layout))
    environment.bytes.set(WORLD_DOCUMENT_STORAGE_KEY, JSON.stringify(document))
    const savedBytes = new Map(environment.bytes)
    for (const roster of [...ROSTER_SEQUENCE, [], [4, 1, 1]]) {
      const frame = environment.publish(sessionsFor(roster))
      expect(frame.worldRevision).toBe(document.revision)
      expect(environment.feed.getWorldDocumentStore?.()?.get().revision).toBe(document.revision)
      expect(environment.bytes).toEqual(savedBytes)
    }
    expect(environment.storage.setItem).not.toHaveBeenCalled()
  })

  it('preserves saved two-storey room assignments while another team grows', () => {
    const environment = createEnvironment()
    const sessions = sessionsFor([1, 1])
    sessions[1].subagents = Array.from({ length: 5 }, (_, index) => subagent(`guest:${index}`))
    const document = createWorldDocument(buildLayout(sessions, undefined), sessions)
    const building = document.buildings.find((candidate) => candidate.projectKey === 'project-0')
    const room = document.rooms.find(
      (candidate) => candidate.target === `session:${sessions[0].key}`
    )
    if (!building || !room) throw new Error('Fixture needs the first project office')
    building.floors = 2
    room.floorNumber = 2
    room.displayName = 'Saved upper studio'
    expect(
      validateWorldDocument(document, { layout: buildLayout(sessions, undefined), sessions })
    ).toEqual([])
    const savedBytes = JSON.stringify(document)
    environment.bytes.set(WORLD_DOCUMENT_STORAGE_KEY, savedBytes)
    for (const memberCount of [5, 10]) {
      const frame = environment.publish([
        sessions[0],
        {
          ...sessions[1],
          subagents: Array.from({ length: memberCount }, (_, index) => subagent(`guest:${index}`))
        }
      ])
      expect(
        frame.floors
          .filter((floor) => floor.buildingId === building.id)
          .map((floor) => floor.floorNumber)
      ).toEqual([1, 2])
      const assignedFloor = frame.floors.find((floor) =>
        floor.rooms.some((candidate) => candidate.worldTarget === room.target)
      )
      expect(assignedFloor).toMatchObject({ buildingId: building.id, floorNumber: 2 })
      expect(
        assignedFloor?.rooms.find((candidate) => candidate.worldTarget === room.target)?.label
      ).toBe('Saved upper studio')
      expect(environment.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(savedBytes)
    }
    expect(environment.storage.setItem).not.toHaveBeenCalled()
  })

  it('reuses floors and venues for an activity-only patch without mutating earlier geometry', () => {
    const environment = createEnvironment()
    environment.publish(sessionsFor([1]))
    environment.publish(sessionsFor([1, 1]))
    const sessions = sessionsFor([2, 1])
    const before = environment.publish(sessions)
    expect(before.venues?.length).toBeGreaterThan(0)
    const serialized = JSON.stringify({ floors: before.floors, venues: before.venues })
    const after = environment.emit({
      type: 'patch',
      v: 1,
      seq: 4,
      upserts: [{ ...sessions[0], activity: 'editing' }],
      removed: []
    })
    expect(after.sessions[0].activity).toBe('editing')
    expect(after.floors).toBe(before.floors)
    expect(after.venues).toBe(before.venues)
    expect(JSON.stringify({ floors: before.floors, venues: before.venues })).toBe(serialized)
  })

  it('takes leisure visitors to the moved arcade after roster adaptation', () => {
    const environment = createEnvironment()
    const initial = environment.publish(sessionsFor([1]))
    const savedArcade = initial.venues?.find((venue) => venue.kind === 'arcade')
    if (!savedArcade) throw new Error('Fixture needs an arcade')
    environment.publish(sessionsFor([1, 1]))
    const sessions = sessionsFor([2, 1])
    sessions[0] = {
      ...sessions[0],
      attention: 'done',
      observation: {
        sourceId: 'test-source',
        observedAtMs: Date.now(),
        staleAfterMs: 1_000_000,
        coverage: 'own'
      }
    }
    const adapted = environment.publish(sessions)
    const movedArcade = adapted.venues?.find((venue) => venue.id === savedArcade.id)
    if (!movedArcade) throw new Error('Adaptation must retain the arcade')
    expect(movedArcade.footprint).not.toEqual(savedArcade.footprint)
    environment.settings.set('loungeTrips', true)
    vi.advanceTimersByTime(300_000)
    const visits = environment.frames.flatMap((frame) =>
      frame.agents.filter((agent) => agent.venueId !== undefined).map((agent) => ({ frame, agent }))
    )
    expect(visits.some(({ agent }) => agent.venueId === movedArcade.id)).toBe(true)
    for (const { frame, agent } of visits) {
      const venue = frame.venues?.find((candidate) => candidate.id === agent.venueId)
      if (!venue) throw new Error(`Visited venue ${agent.venueId} is not rendered`)
      const closestSlot = Math.min(
        ...venue.slots.map((slot) =>
          Math.hypot(agent.x - venue.footprint.x - slot.x, agent.z - venue.footprint.z - slot.z)
        )
      )
      expect.soft(closestSlot, `${agent.agentKey} at ${venue.id}`).toBeLessThan(0.01)
      expect(agent.elevation ?? 0).toBe(0)
    }
  })
})
