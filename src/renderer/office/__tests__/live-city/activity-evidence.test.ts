import { expect, it } from 'vitest'
import { buildOfficeActivity } from '../../logic/zone-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from '../fixtures'

it('uses reported own activity rather than a smoothed world pose for totals', () => {
  const nowMs = 10000
  const session = makeSession({
    key: 'claude:one',
    activity: 'idle',
    attention: 'none',
    observation: { sourceId: 'test', observedAtMs: nowMs, staleAfterMs: 1000, coverage: 'own' }
  })
  const frame = makeFrame({
    sessions: [session],
    agents: [makeAgent({ agentKey: session.key, activity: 'editing' })],
    floors: [
      makeFloor({ floorId: 'f1', rooms: [makeRoom({ id: 'r1', sessionKey: session.key })] })
    ],
    sources: [{ id: 'test', ok: true, detail: 'healthy' }]
  })
  expect(buildOfficeActivity(frame, nowMs).office).toMatchObject({
    working: 0,
    idleDone: 1,
    isAvailable: true
  })
  expect(buildOfficeActivity(frame, nowMs + 2000).office.isAvailable).toBe(false)
})
