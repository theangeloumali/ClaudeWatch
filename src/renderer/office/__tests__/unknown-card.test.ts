import { describe, expect, it } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import { ACTIVITY_UNAVAILABLE_LABEL } from '../logic/activity-summary'
import { buildNameCards } from '../logic/name-cards'
import { makeAgent, makeFrame, makeSession } from './fixtures'

const NOW_MS = Date.now()

// MISSED-1: where the bridge sends own records, a card shows activity only from its own.
describe('a live agent card', () => {
  const observed: SessionRef = makeSession({
    key: 'claude:observed',
    activity: 'idle',
    observation: { sourceId: 'claude', coverage: 'own', observedAtMs: NOW_MS, staleAfterMs: 60_000 }
  })
  const unobserved: SessionRef = makeSession({ key: 'claude:unobserved', activity: 'idle' })
  const frame = makeFrame({
    feedReceivedAtMs: NOW_MS,
    sources: [{ id: 'claude', ok: true, detail: '' }],
    sessions: [observed, unobserved],
    agents: [
      makeAgent({ agentKey: observed.key, roomId: 'room-0', activity: 'idle' }),
      makeAgent({ agentKey: unobserved.key, roomId: 'room-1', activity: 'idle' })
    ]
  })
  const cardOf = (key: string) => buildNameCards(frame, null, null).find((c) => c.agentKey === key)

  it('reads Activity unavailable without its own observation, not Idle', () => {
    expect(cardOf(unobserved.key)).toMatchObject({
      detail: ACTIVITY_UNAVAILABLE_LABEL,
      isAvailable: false
    })
  })

  it('still reads Idle with a fresh own observation', () => {
    expect(cardOf(observed.key)).toMatchObject({ detail: 'Idle', isAvailable: true })
  })

  // A live feed whose bridge stamps nothing is still a live feed: presence is not activity.
  it('reads Activity unavailable on a live feed that stamps no record at all', () => {
    const quiet = makeFrame({
      feedReceivedAtMs: NOW_MS,
      sources: [{ id: 'claude', ok: true, detail: '' }],
      sessions: [unobserved],
      agents: [makeAgent({ agentKey: unobserved.key, roomId: 'room-1', activity: 'idle' })]
    })
    expect(buildNameCards(quiet, null, null)[0]).toMatchObject({
      detail: ACTIVITY_UNAVAILABLE_LABEL,
      isAvailable: false
    })
  })
})
