import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfficeInteractions } from './office-interactions'
import type { OfficeSnapshot, SessionRef, SubagentRef } from '../shared/office/types'
import type { PaneTerminal } from './orca-terminals'

const session = (overrides: Partial<SessionRef> = {}): SessionRef => ({
  key: 'claude:s1',
  provider: 'claude',
  sessionId: 's1',
  pid: 1,
  name: 'app',
  cwd: '/repo/app',
  projectKey: 'p_app',
  projectLabel: 'app',
  projectRoot: '/repo/app',
  companyKey: 'c_test',
  companyLabel: 'Test Co',
  worktree: null,
  host: 'orca',
  orcaPaneKey: 'tab1:leaf1',
  activity: 'editing',
  attention: 'none',
  currentTool: null,
  subagents: [],
  startedAtMs: 1,
  updatedAtMs: 1,
  ...overrides
})
const pane = (overrides: Partial<PaneTerminal> = {}): PaneTerminal => ({
  handle: 'term_a',
  worktreePath: '/repo/app',
  agent: 'claude',
  incarnationId: 'inc_1',
  ...overrides
})
const teammate = (overrides: Partial<SubagentRef> = {}): SubagentRef => ({
  id: 'x',
  type: 'ravi',
  activity: 'thinking',
  kind: 'teammate',
  name: 'ravi',
  pid: 5,
  startedAtMs: 50,
  orcaPaneKey: 'tab2:leaf2',
  ...overrides
})
const inProcess: SubagentRef = { id: 'x', type: 'Explore', activity: 'reading' }
const UNKNOWN = { success: false, reason: 'unknown-session' }

// One agent key must mean one thing to focus, talk and peek, or nothing at all.
// Claude Code between turns: its input line between two rules.
const IDLE_SCREEN = ['⏺ Done.', '─'.repeat(40), '❯', '─'.repeat(40)]

describe('OfficeInteractions agent keys', () => {
  let snapshot: OfficeSnapshot
  const orca = {
    handleFor: vi.fn(),
    sendPrompt: vi.fn(),
    sendKey: vi.fn(),
    screen: vi.fn(),
    create: vi.fn(),
    focus: vi.fn()
  }
  const processStart = vi.fn()
  const raiseOrca = vi.fn()
  const openFolder = vi.fn()
  let interactions: OfficeInteractions

  const expectRefusedEverywhere = async (agentKey: string): Promise<void> => {
    expect(await interactions.focus(agentKey)).toEqual(UNKNOWN)
    expect(await interactions.send(agentKey, 'status?')).toEqual(UNKNOWN)
    expect(await interactions.peek(agentKey)).toEqual({ ...UNKNOWN, lines: [] })
    for (const touched of [orca.handleFor, orca.focus, orca.sendPrompt, orca.screen]) {
      expect(touched).not.toHaveBeenCalled()
    }
    expect(raiseOrca).not.toHaveBeenCalled()
    expect(openFolder).not.toHaveBeenCalled()
  }

  beforeEach(() => {
    vi.resetAllMocks()
    orca.handleFor.mockImplementation(async (paneKey: string) =>
      paneKey === 'tab2:leaf2' ? pane({ handle: 'term_mate', agent: 'claude-agent-teams' }) : pane()
    )
    orca.screen.mockResolvedValue(IDLE_SCREEN)
    orca.focus.mockResolvedValue(true)
    raiseOrca.mockResolvedValue(true)
    openFolder.mockResolvedValue({ success: true })
    processStart.mockImplementation(async (pid: number) => (pid === 5 ? 50 : 1))
    snapshot = { rev: 1, generatedAtMs: 1, sessions: [session()], sources: [] }
    interactions = new OfficeInteractions({
      snapshot: () => snapshot,
      orca,
      openTerminalRunning: vi.fn(),
      processStart,
      raiseOrca,
      openFolder
    })
  })

  it.each([
    ['an in-process agent listed before a teammate', [inProcess, teammate()]],
    ['a teammate listed before an in-process agent', [teammate(), inProcess]],
    ['two teammates', [teammate(), teammate({ pid: 6, orcaPaneKey: 'tab3:leaf3' })]]
  ])('refuses an id shared by %s, in every action', async (_case, subagents) => {
    snapshot.sessions = [session({ subagents })]
    await expectRefusedEverywhere('claude:s1#x')
  })

  it('refuses a key that reads both as a session and as another session’s member', async () => {
    snapshot.sessions = [
      session({ subagents: [teammate()] }),
      session({ key: 'claude:s1#x', sessionId: 's1#x', pid: 9, orcaPaneKey: 'tab9:leaf9' })
    ]
    await expectRefusedEverywhere('claude:s1#x')
  })

  it('refuses a key that two leads could both own', async () => {
    snapshot.sessions = [
      session({ subagents: [teammate({ id: 'a#b' })] }),
      session({ key: 'claude:s1#a', sessionId: 's1#a', subagents: [teammate({ id: 'b' })] })
    ]
    await expectRefusedEverywhere('claude:s1#a#b')
  })

  it('refuses two sessions that report one key', async () => {
    snapshot.sessions = [session(), session({ pid: 2 })]
    await expectRefusedEverywhere('claude:s1')
  })

  it('refuses an empty member id, even when a member reports one', async () => {
    snapshot.sessions = [session({ subagents: [teammate({ id: '' })] })]
    await expectRefusedEverywhere('claude:s1#')
  })

  it('reads one unambiguous teammate key the same way in focus, talk and peek', async () => {
    snapshot.sessions = [session({ subagents: [teammate()] })]
    expect(await interactions.focus('claude:s1#x')).toEqual({ success: true, target: 'pane' })
    expect(await interactions.send('claude:s1#x', 'status?')).toEqual({ success: true })
    expect((await interactions.peek('claude:s1#x')).success).toBe(true)
    expect(orca.focus).toHaveBeenCalledWith('term_mate')
    expect(orca.sendPrompt).toHaveBeenCalledWith('term_mate', 'status?')
    expect(orca.handleFor.mock.calls.every(([paneKey]) => paneKey === 'tab2:leaf2')).toBe(true)
  })

  it('issues a review only for a key that respond accepts: a session, never a teammate', async () => {
    snapshot.sessions = [session({ subagents: [teammate()] })]
    const beforeCaptureMs = Date.now()
    const peeked = await interactions.peek('claude:s1#x')
    expect(peeked).toEqual({
      success: true,
      lines: IDLE_SCREEN,
      capturedAtMs: expect.any(Number),
      targetAgentKey: 'claude:s1#x',
      terminal: {
        ownerAgentKey: 'claude:s1#x',
        paneKey: 'tab2:leaf2',
        pid: snapshot.sessions[0].subagents[0].pid,
        startedAtMs: snapshot.sessions[0].subagents[0].startedAtMs,
        incarnationId: expect.any(String)
      }
    })
    expect(peeked.capturedAtMs).toBeGreaterThanOrEqual(beforeCaptureMs)
    expect(peeked.capturedAtMs).toBeLessThanOrEqual(Date.now())
    expect((await interactions.peek('claude:s1')).fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  describe('proof that the process is still the one reported', () => {
    it.each([null, undefined, Number.NaN])(
      'fails closed for a session reported with start time %s whose process is gone',
      async (startedAtMs) => {
        // Not a number the contract allows, but the feed's fields are not checked on arrival.
        snapshot.sessions = [{ ...session(), startedAtMs: startedAtMs as number }]
        processStart.mockResolvedValue(null)
        expect(await interactions.send('claude:s1', 'hi')).toEqual(UNKNOWN)
        expect(await interactions.focus('claude:s1')).toMatchObject({
          success: false,
          reason: 'unknown-session'
        })
        expect(orca.handleFor).not.toHaveBeenCalled()
      }
    )

    it.each([null, undefined])(
      'fails closed for a teammate reported with start time %s whose process is gone',
      async (startedAtMs) => {
        snapshot.sessions = [
          session({ subagents: [{ ...teammate(), startedAtMs: startedAtMs as undefined }] })
        ]
        processStart.mockResolvedValue(null)
        expect(await interactions.send('claude:s1#x', 'hi')).toEqual(UNKNOWN)
        expect(orca.handleFor).not.toHaveBeenCalled()
      }
    )
  })

  describe('a teammate working in a folder of its own', () => {
    const mateKey = 'claude:s1#x'
    const inOwnWorktree = teammate({ cwd: '/repo/app-wt-mate/src' })

    it('is proven against its own folder, not its lead’s', async () => {
      snapshot.sessions = [session({ subagents: [inOwnWorktree] })]
      orca.handleFor.mockResolvedValue(
        pane({ handle: 'term_mate', worktreePath: '/repo/app-wt-mate', agent: 'claude' })
      )
      expect(await interactions.send(mateKey, 'status?')).toEqual({ success: true })
      expect(await interactions.focus(mateKey)).toEqual({ success: true, target: 'pane' })
    })

    it('is not proven by a pane in some other folder', async () => {
      snapshot.sessions = [session({ subagents: [inOwnWorktree] })]
      orca.handleFor.mockResolvedValue(pane({ worktreePath: '/repo/elsewhere' }))
      expect(await interactions.send(mateKey, 'status?')).toEqual({
        success: false,
        reason: 'terminal-not-found'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('opens its own folder when it runs outside Orca', async () => {
      snapshot.sessions = [
        session({
          host: 'terminal',
          orcaPaneKey: null,
          subagents: [{ ...inOwnWorktree, orcaPaneKey: null }]
        })
      ]
      expect(await interactions.focus(mateKey)).toEqual({ success: true, target: 'terminal' })
      expect(openFolder).toHaveBeenCalledWith('/repo/app-wt-mate/src', 5)
    })
  })
})
