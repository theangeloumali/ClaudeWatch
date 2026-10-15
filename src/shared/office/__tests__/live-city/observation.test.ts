import { describe, expect, it } from 'vitest'
import { observeAgent, observeSession } from '../../observation'
import { buildFloorActivitySummaries } from '../../floor-aggregates'
import { makeAgent, makeFloor, makeRoom, makeSession } from './fixtures'
import type { AgentObservation } from '../../types'

const observation: AgentObservation = {
  sourceId: 'registry',
  observedAtMs: 1000,
  staleAfterMs: 500,
  coverage: 'own'
}
const session = makeSession({
  key: 'claude:a',
  activity: 'editing',
  updatedAtMs: 1,
  observation,
  subagents: [{ id: 'member', type: 'Explore', activity: 'reading' }]
})
const context = {
  sources: [{ id: 'registry', ok: true, detail: 'available' }],
  connected: true,
  nowMs: 1100
}

describe('record evidence', () => {
  it('uses successful record observation rather than activity-change time', () => {
    expect(observeSession({ session: { ...session, activity: 'idle' }, ...context }).status).toBe(
      'fresh'
    )
    expect(observeSession({ session, ...context, nowMs: 1500 }).status).toBe('stale')
  })

  it('does not inherit lead evidence, attention, or tool to a member', () => {
    expect(
      observeAgent({ agentKey: 'claude:a#member', sessions: [session], ...context })
    ).toMatchObject({
      status: 'unknown',
      activity: 'reading',
      currentTool: null
    })
    expect(
      observeAgent({ agentKey: 'claude:a#member', sessions: [session], ...context }).attention
    ).toBeUndefined()
  })

  it('uses a member own record even when its lead has conflicting evidence', () => {
    const ownMember = {
      ...session.subagents[0],
      observation,
      attention: 'none' as const,
      currentTool: { name: 'Read', category: 'read' as const }
    }
    const lead = {
      ...session,
      attention: 'permission' as const,
      currentTool: { name: 'Edit', category: 'edit' as const },
      subagents: [ownMember]
    }
    expect(
      observeAgent({ agentKey: 'claude:a#member', sessions: [lead], ...context })
    ).toMatchObject({
      status: 'fresh',
      attention: 'none',
      currentTool: { name: 'Read', category: 'read' }
    })
  })

  it('keeps missing, unknown, invalid future, and failed-source records unknown', () => {
    for (const evidence of [
      undefined,
      { ...observation, coverage: 'unknown' as const },
      { ...observation, observedAtMs: 2000 }
    ]) {
      expect(
        observeSession({ session: { ...session, observation: evidence }, ...context }).status
      ).toBe('unknown')
    }
    expect(
      observeSession({
        session,
        ...context,
        sources: [{ id: 'registry', ok: false, detail: 'unavailable' }]
      }).status
    ).toBe('unknown')
    expect(observeSession({ session, ...context, connected: false }).status).toBe('disconnected')
  })
})

describe('floor activity summaries', () => {
  const floors = [
    makeFloor({ floorId: 'f1', rooms: [makeRoom({ id: 'r1', sessionKey: session.key })] }),
    makeFloor({ floorId: 'f2' })
  ]

  it('excludes removed avatars and keeps uncovered members unknown', () => {
    const agents = [
      makeAgent({ agentKey: 'claude:a' }),
      makeAgent({ agentKey: 'claude:a#member', isSubagent: true }),
      makeAgent({ agentKey: 'claude:departed' })
    ]
    const summaries = buildFloorActivitySummaries({
      floors,
      agents,
      sessions: [session],
      ...context
    })
    expect(summaries[0]).toMatchObject({
      assignedAgentKeys: ['claude:a', 'claude:a#member'],
      presentAgentKeys: ['claude:a', 'claude:a#member'],
      workingAgentKeys: ['claude:a'],
      unknownAgentKeys: ['claude:a#member']
    })
  })

  it('separates assignment from physical presence without shuffling ties', () => {
    const agents = [
      makeAgent({ agentKey: 'claude:a' }),
      { ...makeAgent({ agentKey: 'claude:a#member' }), physicalFloorId: 'f2' }
    ]
    const summaries = buildFloorActivitySummaries({
      floors: [...floors].reverse(),
      agents,
      sessions: [session],
      ...context
    })
    expect(summaries.map((summary) => summary.floorId)).toEqual(['f1', 'f2'])
    expect(summaries[0].assignedAgentKeys).toEqual(['claude:a', 'claude:a#member'])
    expect(summaries[0].presentAgentKeys).toEqual(['claude:a'])
    expect(summaries[1].presentAgentKeys).toEqual(['claude:a#member'])
  })

  it('counts a member on its own assigned storey instead of always on the lead floor', () => {
    const agents = [
      makeAgent({ agentKey: session.key }),
      makeAgent({ agentKey: `${session.key}#member`, floorId: 'f2' })
    ]
    const summaries = buildFloorActivitySummaries({
      floors,
      agents,
      sessions: [session],
      ...context
    })
    expect(summaries[0].assignedAgentKeys).toEqual([session.key])
    expect(summaries[1].assignedAgentKeys).toEqual([`${session.key}#member`])
  })

  it('does not call attention-blocked, stale, or disconnected work active', () => {
    const agents = [makeAgent({ agentKey: session.key })]
    const summarize = (attention: typeof session.attention, nowMs = 1100, connected = true) =>
      buildFloorActivitySummaries({
        floors,
        agents,
        sessions: [{ ...session, attention }],
        ...context,
        nowMs,
        connected
      })[0]
    for (const attention of ['permission', 'question', 'error'] as const) {
      expect(summarize(attention).workingAgentKeys).toEqual([])
      expect(summarize(attention).attentionAgentKeys).toEqual([session.key])
    }
    expect(summarize('none', 2000).staleAgentKeys).toEqual([session.key])
    expect(summarize('none', 2000).workingAgentKeys).toEqual([])
    expect(summarize('none', 1100, false).unknownAgentKeys).toEqual([
      session.key,
      'claude:a#member'
    ])
  })
})
