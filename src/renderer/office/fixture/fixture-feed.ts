import type { OfficeFeed, OfficeFrame } from '../scene-model'
import { PROJECTS } from './fixture-projects'
import { companyKeyFor, sessionFor } from './fixture-sessions'
import type { SessionRef } from '../../../shared/office/types'
import { createLiveFeed, type FeedSource } from '../../office-live/live-feed'
import { officeThemes } from '../logic/office-themes'
import { VIOLET_COURT_ID } from '../themes/violet-court/roster'
import { fixtureLayout } from './fixture-layout'
import { browserStorage } from '../../office-live/browser-storage'

export const FIXTURE_TICK_MS = 2000

function fixtureSessions(tick: number, nowMs: number): SessionRef[] {
  return PROJECTS.flatMap((project) =>
    project.sessions.map((session, index) => sessionFor(project, session, index, { tick, nowMs }))
  )
}

// One still frame with every agent at its desk, for tests; the running preview goes through
// the sim in `createFixtureFeed`.
export function buildFixtureFrame(tick: number, nowMs: number): OfficeFrame {
  const sessions = fixtureSessions(tick, nowMs)
  const { floors, agents } = fixtureLayout(sessions)
  return { floors, agents, sessions, connected: true, sources: [] }
}

// Two companies on different themes from the first paint; a reviewer's own choices are kept.
function seedThemes(): void {
  const { companies, projects } = officeThemes.getAssignments()
  if (Object.keys(companies).length + Object.keys(projects).length > 0) return
  officeThemes.setCompanyTheme(companyKeyFor(PROJECTS[0]), VIOLET_COURT_ID)
}

// The scripted sessions arrive the way the bridge sends them, so the preview runs the same
// sim as the app: agents walk in, walk out and go to the lounge.
function scriptedSource(tickMs: number): FeedSource {
  return {
    ready: async () => {},
    onFeedMessage(listener) {
      let tick = 0
      const sessions = (): SessionRef[] => {
        const nowMs = Date.now()
        return fixtureSessions(tick, nowMs).map((session) => ({
          ...session,
          observation: {
            sourceId: 'preview-fixture',
            observedAtMs: nowMs,
            staleAfterMs: 60000,
            coverage: 'own'
          },
          subagents: session.subagents.map((member) => ({
            ...member,
            attention: 'none',
            observation: {
              sourceId: 'preview-fixture',
              observedAtMs: nowMs,
              staleAfterMs: 60000,
              coverage: 'own'
            }
          }))
        }))
      }
      listener({
        type: 'hello',
        v: 1,
        snapshot: {
          rev: 0,
          generatedAtMs: Date.now(),
          sessions: sessions(),
          sources: [
            {
              id: 'preview-fixture',
              ok: true,
              detail: 'Sample data',
              checkedAtMs: Date.now(),
              staleAfterMs: 60000
            }
          ]
        }
      })
      const timer = setInterval(() => {
        tick += 1
        listener({
          type: 'patch',
          v: 1,
          seq: tick,
          upserts: sessions(),
          removed: [],
          sources: [
            {
              id: 'preview-fixture',
              ok: true,
              detail: 'Sample data',
              checkedAtMs: Date.now(),
              staleAfterMs: 60000
            }
          ]
        })
      }, tickMs)
      return () => clearInterval(timer)
    },
    // Codex agents answer the way an unproven pane does, so the preview shows that message too.
    focus: async (agentKey) =>
      agentKey.startsWith('codex:')
        ? { success: false, target: 'app', reason: 'terminal-not-found' }
        : { success: true, target: 'pane' },
    // The browser preview has no agents to talk to; actions succeed so the UI can be exercised.
    send: async () => ({ success: true }),
    respond: async () => ({ success: true }),
    peek: async (agentKey) => ({
      success: true,
      capturedAtMs: Date.now(),
      targetAgentKey: agentKey,
      fingerprint: 'preview-screen',
      lines: [
        '$ npm test',
        '',
        ' ✓ 42 tests passed',
        '',
        'Do you want to proceed?',
        '❯ 1. Yes',
        '  2. No'
      ]
    }),
    start: async () => ({ success: true })
  }
}

export function createFixtureFeed(options: { tickMs?: number } = {}): OfficeFeed {
  seedThemes()
  return createLiveFeed(scriptedSource(options.tickMs ?? FIXTURE_TICK_MS), {
    storage: browserStorage()
  })
}
