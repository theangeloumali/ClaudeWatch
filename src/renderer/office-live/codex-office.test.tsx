import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { session as simSession } from '../../office/sim/fixtures'
import { placements } from '../../office/sim/placements'
import { World } from '../../office/sim/world'
import type { FeedMessage, SessionRef } from '../../shared/office/types'
import { makeSession } from '../office/__tests__/fixtures'
import { agentTable, officesPanel, setupHud } from '../office/hud/hud-test-harness'
import { buildAttentionQueue } from '../office/logic/attention-queue'
import { buildNameCards } from '../office/logic/name-cards'
import { createOfficeSettingsStore } from '../office/logic/office-settings'
import { RobotCrew } from '../office/scene/Robot'
import type { OfficeFrame } from '../office/scene-model'
import { garrisonLook } from '../office/themes/orbital-garrison/roster'
import { groveLook } from '../office/themes/quiet-grove/roster'
import { listThemes, themeCharacter } from '../office/themes/registry'
import { courtLook } from '../office/themes/violet-court/roster'
import { createLiveFeed, type FeedSource } from './live-feed'

// React DOM checks the model trees; it cannot place three.js refs or animate them.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useLayoutEffect: () => undefined
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('../office/scene/textures', () => ({ blobShadowTexture: () => null }))
vi.mock('../office/webgl-support', () => ({ canCreateWebGL2: () => false }))

function sessionsFor(host: SessionRef['host']): SessionRef[] {
  return [
    makeSession({ ...simSession('claude:synthetic'), activity: 'editing' }),
    makeSession({
      ...simSession('codex:synthetic'),
      provider: 'codex',
      host,
      orcaPaneKey: host === 'orca' ? 'synthetic-tab:synthetic-pane' : null,
      activity: 'reading',
      usage: {
        own: { input: 100, output: 20, cacheWrite: 0, cacheRead: 30 },
        subagents: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
        spawned: 0,
        contextTokens: 50,
        contextLimit: 1000
      }
    })
  ]
}

function hello(sessions: SessionRef[]): FeedMessage {
  return { type: 'hello', v: 1, snapshot: { rev: 1, generatedAtMs: 1, sessions, sources: [] } }
}

function startFeed(sessions: SessionRef[]) {
  let publish: (message: FeedMessage) => void = () => undefined
  let latest: OfficeFrame | undefined
  const source: FeedSource = {
    ready: vi.fn(async () => undefined),
    onFeedMessage: (listener) => {
      publish = listener
      return () => undefined
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  const settings = createOfficeSettingsStore(null)
  settings.set('loungeTrips', false)
  const stop = createLiveFeed(source, { storage: null, now: () => Date.now(), settings }).subscribe(
    (frame) => {
      latest = frame
    }
  )
  publish(hello(sessions))
  vi.advanceTimersByTime(100)
  const frame = (): OfficeFrame => {
    if (!latest) throw new Error('Feed emitted no frame')
    return latest
  }
  return { frame, publish, stop, source }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Codex from the bridge feed to the Office', () => {
  it.each(['terminal', 'orca'] as const)('seats both providers once with Codex in %s', (host) => {
    const sessions = sessionsFor(host)
    const world = new World({ loungeTrips: false })
    world.apply(hello(sessions))
    const layout = world.layout()
    const seats = placements(sessions, layout)
    expect(layout.floors[0].rooms.filter((room) => room.kind === 'office')).toHaveLength(2)
    expect(seats).toHaveLength(2)
    const agents = world.step(100)
    expect(agents.map((agent) => agent.provider)).toEqual(['claude', 'codex'])
    for (const seat of seats) {
      expect(agents.find((agent) => agent.agentKey === seat.session.key)).toMatchObject({
        roomId: seat.room.id,
        slotId: seat.slot.id,
        x: seat.slot.x,
        z: seat.slot.z,
        activity: seat.session.activity
      })
    }
    const feed = startFeed(sessions)
    expect(feed.frame().agents).toEqual(agents)
    expect(feed.frame().sessions).toEqual(sessions)
    expect(feed.frame().floors[0].rooms.filter((room) => room.sessionKey)).toHaveLength(2)
    feed.stop()
  })

  it('patches Codex activity without adding a desk or a second robot', () => {
    const sessions = sessionsFor('orca')
    const feed = startFeed(sessions)
    const activities = [
      'thinking',
      'reading',
      'editing',
      'running',
      'searching',
      'delegating',
      'idle'
    ] as const
    for (const [index, activity] of activities.entries()) {
      feed.publish({
        type: 'patch',
        v: 1,
        seq: index + 2,
        removed: [],
        upserts: [{ ...sessions[1], activity }]
      })
      // The sim holds each pose for 1.5 seconds to keep rapid tool changes readable.
      vi.advanceTimersByTime(1500)
      const frame = feed.frame()
      expect(frame.agents).toHaveLength(2)
      expect(frame.floors[0].rooms.filter((room) => room.sessionKey)).toHaveLength(2)
      const card = buildNameCards(frame, 'hq', null).find(
        (entry) => entry.agentKey === sessions[1].key
      )
      expect(card).toMatchObject({
        sessionKey: sessions[1].key,
        kind: 'card',
        detail: activity[0].toUpperCase() + activity.slice(1)
      })
    }
    expect(feed.source.focus).not.toHaveBeenCalled()
    expect(feed.source.send).not.toHaveBeenCalled()
    feed.stop()
  })

  it.each(listThemes())('draws both workers with a Codex provider identity in $id', (theme) => {
    const feed = startFeed(sessionsFor('terminal'))
    // Unknown three.js tags warn under React DOM, which stands in for the canvas here.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { container } = render(
      <RobotCrew
        agents={feed.frame().agents}
        zoneGroups={[]}
        floorTheme={theme}
        selectedAgentKey={null}
        speakingAgentKey={null}
        isReducedMotion
        onSelect={vi.fn()}
        onFly={vi.fn()}
      />
    )
    expect(container.children).toHaveLength(2)
    for (const robot of Array.from(container.children))
      expect(robot.querySelectorAll('meshstandardmaterial').length).toBeGreaterThan(0)
    const codex = feed.frame().agents[1]
    let bodyColor = theme.robot.skins.codex.body
    if (theme.id === 'corporate-city') bodyColor = theme.robot.skins.codex.trim
    if (theme.roster) {
      const index = theme.roster.indexFor(codex, 0)
      expect(themeCharacter(theme.id, codex, 0)).toEqual(theme.roster.entries(null)[index])
      if (theme.id === 'violet-court') {
        const { who } = courtLook(codex, 0)
        expect(who.faction).toBe('corps')
        bodyColor = who.jacket
      }
      if (theme.id === 'quiet-grove') {
        const { who } = groveLook(codex, 0)
        expect(who.kin).toBe('helper')
        bodyColor = who.body
      }
      if (theme.id === 'orbital-garrison') {
        const { who } = garrisonLook(codex, 0)
        expect(who.section).toBe('deck')
        bodyColor = who.suit
      }
    }
    expect(
      container.children[1].querySelector(`meshstandardmaterial[color="${bodyColor}"]`)
    ).not.toBeNull()
    feed.stop()
  })

  it('shows Codex activity and tokens in the list, office counts and inspector', () => {
    const feed = startFeed(sessionsFor('orca'))
    setupHud(undefined, { frame: feed.frame() })
    const table = agentTable()
    const row = within(table).getByText('Codex').closest('tr')
    expect(row).toHaveTextContent('reading')
    expect(row).toHaveTextContent('150')
    expect(within(table).getAllByText(/^(Claude|Codex)$/)).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Office totals' })).toHaveTextContent('2 agents')
    expect(screen.getByRole('region', { name: 'Office totals' })).toHaveTextContent('150+ tokens')
    expect(officesPanel()).toHaveTextContent('2 agents')
    expect(officesPanel()).toHaveTextContent('150+')
    act(() => within(table).getByText('Codex').closest('tr')?.querySelector('button')?.click())
    const inspector = screen.getByRole('complementary', { name: 'Agent details' })
    expect(
      within(inspector).getByText('Tokens', { selector: 'dt' }).nextElementSibling
    ).toHaveTextContent('150')
    feed.stop()
  })

  it.each(['question', 'permission'] as const)(
    'queues Codex %s attention without acting on it',
    (attention) => {
      const sessions = sessionsFor('orca')
      sessions[1] = { ...sessions[1], attention }
      const feed = startFeed(sessions)
      expect(buildAttentionQueue(feed.frame().sessions)).toMatchObject([
        { sessionKey: sessions[1].key, attention }
      ])
      setupHud(undefined, { frame: feed.frame() })
      expect(screen.getByRole('region', { name: 'Needs you' }).querySelectorAll('li')).toHaveLength(
        1
      )
      expect(
        within(officesPanel()).getAllByRole('button', { name: /2 agents, 1 needs you/ })
      ).toHaveLength(2)
      feed.stop()
    }
  )
})
