import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionTokens } from '../../deck/tokens'
import { officeThemes } from '../logic/office-themes'
import type { AgentView } from '../../../shared/office/types'
import type { OfficeFrame } from '../scene-model'
import { buildFixtureFrame, createFixtureFeed } from './fixture-feed'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

const frame = buildFixtureFrame(0, 1_000_000)

describe('seeded preview sessions', () => {
  it('carries usage in the hundreds of millions for most sessions', () => {
    const totals = frame.sessions.flatMap((session) => sessionTokens(session.usage) ?? [])
    expect(totals.length).toBeGreaterThan(frame.sessions.length / 2)
    for (const total of totals) {
      expect(total).toBeGreaterThanOrEqual(50_000_000)
      expect(total).toBeLessThan(2_000_000_000)
    }
  })

  it('leaves one session uncounted, the way a first scan arrives', () => {
    expect(frame.sessions.some((session) => session.usage === null)).toBe(true)
  })

  it('knows the window size only for Codex', () => {
    for (const session of frame.sessions) {
      if (!session.usage) continue
      expect(session.usage.contextLimit !== null).toBe(session.provider === 'codex')
    }
  })

  it('keeps usage growing from one tick to the next', () => {
    const later = buildFixtureFrame(5, 1_010_000)
    const before = sessionTokens(frame.sessions[1].usage) ?? 0
    expect(sessionTokens(later.sessions[1].usage)).toBeGreaterThan(before)
  })

  it('has a lead with two named teammates, each with a pane and tokens of its own', () => {
    const lead = frame.sessions.find(
      (session) => session.subagents.filter((member) => member.kind === 'teammate').length === 2
    )
    expect(lead).toBeDefined()
    const teammates = lead?.subagents.filter((member) => member.kind === 'teammate') ?? []
    for (const teammate of teammates) {
      expect(teammate.name).toBeTruthy()
      expect(teammate.orcaPaneKey).toBeTruthy()
      expect(teammate.tokens).toBeTruthy()
      expect(frame.agents.some((agent) => agent.agentKey === `${lead?.key}#${teammate.id}`)).toBe(
        true
      )
    }
  })
})

describe('createFixtureFeed', () => {
  beforeEach(() => localStorage.clear())

  it('puts two companies on different themes so the picker has something to show', () => {
    createFixtureFeed()
    const [first, second] = frame.floors[0].zones
    const themeOf = (companyKey: string | null): string =>
      officeThemes.getAssignments().companies[companyKey ?? ''] ?? 'default'
    expect(themeOf(first.companyKey)).not.toBe(themeOf(second.companyKey))
  })

  it('answers a focus request so the preview can show where it landed', async () => {
    const feed = createFixtureFeed()
    await expect(feed.focus?.('claude:claudewatch-0')).resolves.toMatchObject({ target: 'pane' })
    await expect(feed.focus?.('codex:claudewatch-1')).resolves.toMatchObject({
      success: false,
      target: 'app'
    })
  })
})

describe('the seeded preview runs the office sim', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  // Each frame with the second it arrived at.
  function watch(seconds: number): { atS: number; frame: OfficeFrame }[] {
    const startedAtMs = Date.now()
    const frames: { atS: number; frame: OfficeFrame }[] = []
    const stop = createFixtureFeed().subscribe((frame) =>
      frames.push({ atS: (Date.now() - startedAtMs) / 1000, frame })
    )
    vi.advanceTimersByTime(seconds * 1000)
    stop()
    return frames
  }
  const isOn = (agent: AgentView, seats: { x: number; z: number }[]): boolean =>
    seats.some((seat) => seat.x === agent.x && seat.z === agent.z)

  it('seats every agent at its desk on the first frame', () => {
    const [{ frame: first }] = watch(0.1)
    expect(first.connected).toBe(true)
    expect(first.agents.length).toBeGreaterThan(first.sessions.length)
    const rooms = first.floors.flatMap((floor) => floor.rooms)
    for (const agent of first.agents) {
      const room = rooms.find((candidate) => candidate.id === agent.roomId)
      const desk = room?.seats.find((candidate) => candidate.slotId === agent.slotId)
      expect(agent).toMatchObject({ x: desk?.x, z: desk?.z })
      expect(agent.place).toBeUndefined()
    }
  })

  // A game corner visit: a finished agent plays, then goes home to its desk.
  it('sends a finished agent to play inside a minute, and back to its desk later', () => {
    const frames = watch(300)
    const firstOut = frames.findIndex(({ frame }) =>
      frame.agents.some((agent) => agent.place === 'lounge')
    )
    expect(frames[firstOut]?.atS).toBeLessThan(60)

    const outing = frames[firstOut].frame.agents.find((agent) => agent.place === 'lounge')
    // Home in the step it sets off again, an idle agent may never show at its desk unplaced.
    const isAtDesk = (frame: OfficeFrame): boolean => {
      const agent = frame.agents.find((candidate) => candidate.agentKey === outing?.agentKey)
      const room = frame.floors
        .flatMap((floor) => floor.rooms)
        .find((candidate) => candidate.id === agent?.roomId)
      return agent !== undefined && isOn(agent, room?.seats ?? [])
    }
    const awayAt = frames.findIndex((entry, index) => index > firstOut && !isAtDesk(entry.frame))
    expect(awayAt).toBeGreaterThan(firstOut)
    expect(frames.slice(awayAt).some(({ frame }) => isAtDesk(frame))).toBe(true)
  })
})
