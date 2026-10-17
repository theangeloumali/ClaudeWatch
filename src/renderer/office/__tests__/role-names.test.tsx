import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedMessage, SessionRef } from '../../../shared/office/types'
import { createLiveFeed, type FeedSource } from '../../office-live/live-feed'
import { officeSettings } from '../logic/office-settings'
import { isActivityAvailable } from '../logic/activity-summary'
import { createRoleBook, maskFrame } from '../logic/role-names'
import { OfficeApp } from '../OfficeApp'
import type { FloorGeometry, OfficeFeed, OfficeFrame, ZoneGeometry } from '../scene-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from './fixtures'

const { signTexture } = vi.hoisted(() => ({ signTexture: vi.fn() }))

// Themes paint every room and zone label onto a sign; the stand-in scene does the same.
vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../scene/OfficeScene', () => ({
  default: ({ allFloors }: { allFloors: readonly FloorGeometry[] }) => {
    const visit = (zone: ZoneGeometry): void => {
      signTexture(zone.label)
      zone.children.forEach(visit)
    }
    for (const floor of allFloors) {
      signTexture(floor.label)
      floor.rooms.forEach((room) => signTexture(room.label))
      floor.zones.forEach(visit)
    }
    return <p>Scene drawn</p>
  }
}))

const REAL_NAMES = /Acme Labs|Rocket App|rocket-fix|Beta Corp|Billing/

const secretSession = (overrides: Partial<SessionRef> & Pick<SessionRef, 'key'>): SessionRef =>
  makeSession({
    name: 'rocket-fix',
    cwd: '/Users/ada/Acme Labs/Rocket App/.claude/.worktree/rocket-fix',
    projectRoot: '/Users/ada/Acme Labs/Rocket App',
    worktree: '/Users/ada/Acme Labs/Rocket App/.claude/.worktree/rocket-fix',
    companyKey: 'c_acme',
    companyLabel: 'Acme Labs',
    projectKey: 'p_rocket',
    projectLabel: 'Rocket App',
    ...overrides
  })

const projectZone = (companyKey: string, projectKey: string, label: string): ZoneGeometry =>
  makeZone({
    id: `zone-${projectKey}`,
    kind: 'project',
    label,
    companyKey,
    projectKey,
    children: [
      makeZone({
        id: `office-${projectKey}`,
        kind: 'office',
        label: 'rocket-fix',
        companyKey,
        projectKey,
        sessionKey: 'claude:a'
      })
    ]
  })

const secretFrame = (): OfficeFrame =>
  makeFrame({
    sessions: [
      secretSession({
        key: 'claude:a',
        subagents: [
          {
            id: 'm1',
            type: 'general-purpose',
            activity: 'idle',
            cwd: '/Users/ada/Acme Labs/Rocket App'
          }
        ]
      })
    ],
    agents: [makeAgent({ agentKey: 'claude:a', label: 'rocket-fix', roomId: 'r1', floorId: 'f1' })],
    floors: [
      makeFloor({
        floorId: 'f1',
        label: 'Rocket App · Floor 1',
        floorNumber: 1,
        rooms: [
          makeRoom({ id: 'r1', sessionKey: 'claude:a', label: 'rocket-fix' }),
          makeRoom({
            id: 'team',
            kind: 'team',
            label: 'Rocket App team',
            worldTarget: 'team:c_acme:p_rocket'
          })
        ],
        zones: [
          makeZone({
            id: 'company',
            kind: 'company',
            label: 'Acme Labs',
            companyKey: 'c_acme',
            children: [projectZone('c_acme', 'p_rocket', 'Rocket App')]
          })
        ]
      })
    ]
  })

function feedOf(frame: OfficeFrame): OfficeFeed {
  return {
    subscribe: (listener) => {
      listener(frame)
      return () => undefined
    },
    focus: vi.fn().mockResolvedValue({ success: true }),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
}

beforeEach(() => {
  localStorage.clear()
  officeSettings.reset()
  signTexture.mockClear()
})

describe('the privacy edge', () => {
  it('with names hidden, no company or project label reaches signTexture', async () => {
    officeSettings.set('hideNames', true)
    render(<OfficeApp feed={feedOf(secretFrame())} />)
    await screen.findByText('Scene drawn')
    const painted = signTexture.mock.calls.map(([label]) => String(label))
    expect(painted.length).toBeGreaterThan(0)
    expect(painted.filter((label) => REAL_NAMES.test(label))).toEqual([])
    expect(painted).toContain('Project A-1 · Floor 1')
    expect(document.body.textContent).not.toMatch(REAL_NAMES)
  })

  it('shows the real names while the switch is off', async () => {
    render(<OfficeApp feed={feedOf(secretFrame())} />)
    await screen.findByText('Scene drawn')
    expect(signTexture.mock.calls.map(([label]) => String(label))).toContain('Acme Labs')
  })

  it('a role keeps its letter when a new project appears', () => {
    const roles = createRoleBook()
    const first = maskFrame(secretFrame(), roles)
    expect(first.sessions[0]).toMatchObject({
      companyLabel: 'Company A',
      projectLabel: 'Project A-1'
    })
    const grown = secretFrame()
    grown.sessions = [
      secretSession({
        key: 'claude:b',
        companyKey: 'c_beta',
        companyLabel: 'Beta Corp',
        projectKey: 'p_bill',
        projectLabel: 'Billing'
      }),
      secretSession({ key: 'claude:c', projectKey: 'p_new', projectLabel: 'Billing' }),
      ...grown.sessions
    ]
    const later = maskFrame(grown, roles)
    expect(later.sessions.map((session) => [session.companyLabel, session.projectLabel])).toEqual([
      ['Company B', 'Project B-1'],
      ['Company A', 'Project A-2'],
      ['Company A', 'Project A-1']
    ])
    expect(later.floors[0].zones[0].label).toBe('Company A')
  })

  it('session names and cwd basenames are masked too', () => {
    const masked = maskFrame(secretFrame(), createRoleBook())
    expect(JSON.stringify(masked)).not.toMatch(REAL_NAMES)
    const [session] = masked.sessions
    expect(session.name).toBe('Session A-1.1')
    expect(session.cwd).toBe('/Company A/Project A-1')
    expect(session.subagents[0].cwd).toBe('/Company A/Project A-1')
    expect(masked.agents[0].label).toBe('Session A-1.1')
    expect(masked.floors[0].rooms.map((room) => room.label)).toEqual([
      'Session A-1.1',
      'Project A-1 team'
    ])
    // Keys are hashes, never names, and the scene and stores match on them.
    expect(session).toMatchObject({ key: 'claude:a', companyKey: 'c_acme', projectKey: 'p_rocket' })
  })

  // A Claude source is named for its config folder, which holds the user's home path.
  it('a source never shows its folder with names hidden, and keeps one role across the frame', () => {
    const sourceId = 'claude:/Users/someone/.claude'
    const observation = {
      sourceId,
      observedAtMs: 1,
      staleAfterMs: 60_000,
      coverage: 'own' as const
    }
    const frame = {
      ...secretFrame(),
      sessions: [makeSession({ key: 'claude:a', observation })],
      sources: [{ id: sourceId, ok: false, detail: `${sourceId}/projects could not be read` }]
    }
    const masked = maskFrame(frame, createRoleBook())
    expect(JSON.stringify(masked)).not.toMatch(/someone/)
    expect(masked.sessions[0].observation?.sourceId).toBe(masked.sources[0].id)
    expect(masked.sources[0].id).toBe('claude:config 1')
    // The provider prefix stays, so a failing Claude source still marks activity unavailable.
    expect(isActivityAvailable(masked)).toBe(false)
    expect(maskFrame(frame, createRoleBook()).sources[0].detail).not.toMatch(/\//)
  })

  it('a frame that only moved agents keeps the masked floors and sessions it had', () => {
    const roles = createRoleBook()
    const frame = secretFrame()
    const first = maskFrame(frame, roles)
    const moved = maskFrame({ ...frame, agents: [...frame.agents] }, roles)
    expect(moved.floors).toBe(first.floors)
    expect(moved.sessions).toBe(first.sessions)
  })

  it('a frame that only moved agents keeps every other masked field, accounts included', () => {
    const roles = createRoleBook()
    const accounts = [
      { key: 'acct-1', provider: 'claude' as const, label: 'Acme Labs', plan: null, isActive: true }
    ]
    const frame = { ...secretFrame(), accounts }
    const first = maskFrame(frame, roles)
    const moved = maskFrame({ ...frame, agents: [...frame.agents] }, roles)
    for (const field of Object.keys(first).filter((name) => name !== 'agents'))
      expect(Reflect.get(moved, field), field).toBe(Reflect.get(first, field))
    expect(JSON.stringify(moved.accounts)).not.toMatch(REAL_NAMES)
  })

  it('the same agents are masked once', () => {
    const roles = createRoleBook()
    const frame = secretFrame()
    expect(maskFrame({ ...frame }, roles).agents).toBe(maskFrame({ ...frame }, roles).agents)
  })

  it('the saved world document keeps real names while the screen shows roles', () => {
    const bridge = { send: (_message: FeedMessage): void => undefined }
    const source: FeedSource = {
      ready: () => Promise.resolve(),
      onFeedMessage: (listener) => {
        bridge.send = listener
        return () => undefined
      },
      focus: vi.fn(),
      send: vi.fn(),
      respond: vi.fn(),
      peek: vi.fn(),
      start: vi.fn()
    }
    vi.useFakeTimers()
    try {
      const frames: OfficeFrame[] = []
      const feed = createLiveFeed(source, { storage: null })
      feed.subscribe((frame) => frames.push(frame))
      const sessions = [secretSession({ key: 'claude:a', observation: undefined })]
      bridge.send({
        type: 'hello',
        v: 1,
        snapshot: { rev: 1, generatedAtMs: 1, sessions, sources: [] }
      })
      vi.advanceTimersByTime(300)
      const shown = maskFrame(frames.at(-1) ?? makeFrame(), createRoleBook())
      const saved = JSON.stringify(feed.getWorldDocumentStore?.()?.get().document)
      expect(saved).toContain('Rocket App')
      expect(saved).not.toMatch(/Company A|Project A-1/)
      expect(JSON.stringify(shown.floors)).toContain('Project A-1')
      expect(JSON.stringify(shown.floors)).not.toMatch(REAL_NAMES)
    } finally {
      vi.useRealTimers()
    }
  })
})
