import { describe, expect, it } from 'vitest'
import { agentKey } from '../../../../shared/office/agent-key'
import { isActivityAvailable, LEAVING_LABEL } from '../../logic/activity-summary'
import { buildNameCards } from '../../logic/name-cards'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from '../fixtures'
import { makeActivityFrame } from './activity-fixtures'

describe('departed worker name-card truth', () => {
  it.each(['editing', 'thinking'] as const)(
    'does not confirm a departed root still showing %s when its provider is available',
    (activity) => {
      const frame = makeActivityFrame([{ activity, attention: 'none' }])
      const departedRootKey = frame.sessions[0].key
      const departedFrame = makeFrame({
        ...frame,
        sessions: [],
        agents: [{ ...frame.agents[0], agentKey: departedRootKey, place: 'leaving' }]
      })

      expect(isActivityAvailable(departedFrame, ['claude'])).toBe(true)
      const cards = buildNameCards(departedFrame, 'f1', null)

      expect(cards).toHaveLength(1)
      expect(cards[0]).toMatchObject({
        agentKey: departedRootKey,
        isAvailable: false,
        detail: LEAVING_LABEL,
        sessionKey: null
      })
      expect(cards[0].status).not.toBe('working')
    }
  )

  it.each(['room-0', 'shared-team'])(
    'does not confirm a removed child in %s from its active parent',
    (roomId) => {
      const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
      const parent = frame.sessions[0]
      const removedChildKey = agentKey(parent.key, 'reader')
      const departedChildFrame = makeFrame({
        ...frame,
        agents: [
          { ...frame.agents[0], agentKey: parent.key },
          makeAgent({
            agentKey: removedChildKey,
            roomId,
            isSubagent: true,
            label: 'Explore',
            activity: 'reading',
            place: 'leaving'
          })
        ]
      })

      expect(parent.subagents).toEqual([])
      expect(isActivityAvailable(departedChildFrame, ['claude'])).toBe(true)
      const cards = buildNameCards(departedChildFrame, 'f1', null)
      const removedChild = cards.find((card) => card.agentKey === removedChildKey)

      expect(removedChild).toMatchObject({
        kind: 'pill',
        isAvailable: false,
        detail: LEAVING_LABEL,
        sessionKey: null
      })
      expect(removedChild?.status).not.toBe('working')
      expect(removedChild?.detail).not.toMatch(/Reading|Editing|Edit\b/)
      expect(cards.find((card) => card.agentKey === parent.key)).toMatchObject({
        isAvailable: true,
        detail: 'Editing · Edit',
        status: 'working',
        sessionKey: parent.key
      })
    }
  )

  it('preserves a current root and its own reading child without sharing the parent tool', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    const parent = makeSession({
      ...frame.sessions[0],
      subagents: [{ id: 'reader', type: 'Explore', activity: 'reading' }]
    })
    const readerKey = agentKey(parent.key, 'reader')
    const currentFrame = makeFrame({
      ...frame,
      sessions: [parent],
      agents: [
        { ...frame.agents[0], agentKey: parent.key },
        makeAgent({
          agentKey: readerKey,
          roomId: 'shared-team',
          isSubagent: true,
          label: 'Explore',
          activity: 'reading'
        })
      ]
    })

    const cards = buildNameCards(currentFrame, 'f1', null)

    expect(cards.find((card) => card.agentKey === parent.key)).toMatchObject({
      isAvailable: true,
      detail: 'Editing · Edit',
      status: 'working',
      sessionKey: parent.key
    })
    expect(cards.find((card) => card.agentKey === readerKey)).toMatchObject({
      kind: 'pill',
      isAvailable: true,
      detail: 'Reading',
      status: 'working',
      sessionKey: null
    })
  })

  it('does not borrow session authority or tool activity from a reassigned old room', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    const departedRootKey = frame.sessions[0].key
    const replacement = makeSession({
      key: 'claude:replacement',
      name: 'Replacement worker',
      activity: 'running',
      currentTool: { name: 'Bash', category: 'run' }
    })
    const reassignedFrame = makeFrame({
      ...frame,
      sessions: [replacement],
      floors: [
        makeFloor({
          floorId: 'f1',
          rooms: [makeRoom({ id: 'room-0', sessionKey: replacement.key })]
        })
      ],
      agents: [{ ...frame.agents[0], agentKey: departedRootKey }]
    })

    const cards = buildNameCards(reassignedFrame, 'f1', null)

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      agentKey: departedRootKey,
      isAvailable: false,
      detail: 'Activity unavailable',
      sessionKey: null
    })
    expect(cards[0].status).not.toBe('working')
    expect(cards[0].title).not.toBe(replacement.name)
    expect(cards[0].detail).not.toContain('Bash')
  })
})
