import { describe, expect, it } from 'vitest'
import { agentKey } from '../../../shared/office/agent-key'
import { LEAVING_LABEL } from '../logic/activity-summary'
import { buildNameCards } from '../logic/name-cards'
import { makeAgent, makeFrame } from './fixtures'
import { makeActivityFrame } from './activity-overview/activity-fixtures'

// seating-5: a worker walking out is carded as leaving, from the sim's own state.
describe('a departing worker card', () => {
  it('reads Leaving for a guest walking out, never unknown or busy', () => {
    const frame = makeActivityFrame([{ activity: 'running', attention: 'none' }])
    const parent = frame.sessions[0]
    const leavingKey = agentKey(parent.key, 'finished')
    const departing = makeFrame({
      ...frame,
      agents: [
        { ...frame.agents[0], agentKey: parent.key },
        makeAgent({
          agentKey: leavingKey,
          roomId: 'room-0',
          isSubagent: true,
          label: 'lena',
          activity: 'running',
          place: 'leaving'
        })
      ]
    })
    const card = buildNameCards(departing, 'f1', null).find((c) => c.agentKey === leavingKey)
    expect(card).toMatchObject({ detail: LEAVING_LABEL, isAvailable: false })
    expect(card?.status).not.toBe('working')
  })

  it('reads Leaving for a lead whose session ended', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    const departed = makeFrame({
      ...frame,
      sessions: [],
      agents: [{ ...frame.agents[0], agentKey: frame.sessions[0].key, place: 'leaving' }]
    })
    const [card] = buildNameCards(departed, 'f1', null)
    expect(card).toMatchObject({ detail: LEAVING_LABEL, isAvailable: false, sessionKey: null })
    expect(card.status).not.toBe('working')
  })
})
