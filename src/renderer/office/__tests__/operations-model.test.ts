import { expect, it } from 'vitest'
import { buildOperationsModel } from '../logic/operations-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from './fixtures'

const NOW = 1_000_000
const OWN_OBSERVATION = {
  sourceId: 'claude',
  observedAtMs: NOW,
  staleAfterMs: 60_000,
  coverage: 'own'
} as const

function operationsFrame() {
  const session = makeSession({
    key: 'claude:root',
    activity: 'editing',
    observation: OWN_OBSERVATION,
    subagents: [
      {
        id: 'fresh',
        type: 'worker',
        name: 'Scout',
        activity: 'reading',
        attention: 'none',
        observation: OWN_OBSERVATION
      },
      { id: 'unknown', type: 'worker', activity: 'running', attention: 'none' },
      {
        id: 'stale',
        type: 'worker',
        activity: 'running',
        attention: 'none',
        observation: { ...OWN_OBSERVATION, observedAtMs: NOW - 60_000 }
      },
      {
        id: 'question',
        type: 'worker',
        activity: 'reading',
        attention: 'question',
        observation: OWN_OBSERVATION
      }
    ]
  })
  return makeFrame({
    sessions: [session],
    sources: [{ id: 'claude', ok: true, detail: 'live' }],
    floors: [
      makeFloor({
        floorId: 'f1',
        rooms: [
          makeRoom({ id: 'office', sessionKey: session.key }),
          makeRoom({ id: 'team', kind: 'team' }),
          makeRoom({ id: 'empty' })
        ]
      })
    ],
    agents: [
      makeAgent({ agentKey: session.key, roomId: 'office', activity: 'idle' }),
      ...session.subagents.map((member) =>
        makeAgent({
          agentKey: `${session.key}#${member.id}`,
          roomId: 'team',
          isSubagent: true,
          activity: 'idle'
        })
      ),
      makeAgent({ agentKey: `${session.key}#fresh`, roomId: 'team', isSubagent: true }),
      makeAgent({ agentKey: 'claude:ghost', roomId: 'team', activity: 'running' })
    ]
  })
}

it('counts unique workers in their actual rooms from live evidence', () => {
  const [office] = buildOperationsModel({ frame: operationsFrame(), nowMs: NOW })

  expect(office.workers).toHaveLength(5)
  expect(office.projectLabels).toEqual(['Project'])
  expect(
    office.workAreas.map((area) => ({
      roomId: area.room.id,
      workers: area.workers.length,
      working: area.freshWorkingCount,
      attention: area.attentionCount
    }))
  ).toEqual([
    { roomId: 'office', workers: 1, working: 1, attention: 0 },
    { roomId: 'team', workers: 4, working: 1, attention: 1 },
    { roomId: 'empty', workers: 0, working: 0, attention: 0 }
  ])
  expect(office.summary.workingAgentKeys).toEqual(['claude:root', 'claude:root#fresh'])
})

it('does not borrow parent freshness for a child without its own evidence', () => {
  const [office] = buildOperationsModel({ frame: operationsFrame(), nowMs: NOW })
  const unknown = office.workers.find((worker) => worker.key === 'claude:root#unknown')
  const stale = office.workers.find((worker) => worker.key === 'claude:root#stale')
  const fresh = office.workers.find((worker) => worker.key === 'claude:root#fresh')

  expect(unknown).toMatchObject({
    evidence: { status: 'unknown' },
    detail: 'Activity unavailable · no own observation'
  })
  expect(stale).toMatchObject({
    evidence: { status: 'stale' },
    detail: 'Stale observation · activity unconfirmed'
  })
  expect(fresh).toMatchObject({
    label: 'Scout',
    roomId: 'team',
    isPresent: true,
    evidence: { status: 'fresh' }
  })
})

it('keeps assigned workers without rendered bodies in their session work area', () => {
  const frame = makeFrame({
    floors: [
      makeFloor({ floorId: 'f1', rooms: [makeRoom({ id: 'office', sessionKey: 'claude:root' })] })
    ],
    sessions: [
      makeSession({
        key: 'claude:root',
        activity: 'editing',
        observation: OWN_OBSERVATION,
        subagents: [
          {
            id: 'child',
            type: 'worker',
            activity: 'reading',
            attention: 'none',
            observation: OWN_OBSERVATION
          }
        ]
      })
    ]
  })
  const [office] = buildOperationsModel({ frame, nowMs: NOW })

  expect(office.workers.map((worker) => [worker.key, worker.roomId, worker.isPresent])).toEqual([
    ['claude:root', 'office', false],
    ['claude:root#child', 'office', false]
  ])
  expect(office.workAreas[0].freshWorkingCount).toBe(2)
  expect(office.summary.presentAgentKeys).toEqual([])
})

it.each([
  { connected: false, isSourceOk: true, status: 'disconnected' },
  { connected: true, isSourceOk: false, status: 'unknown' }
])('withholds working counts with $status evidence', ({ connected, isSourceOk, status }) => {
  const frame = operationsFrame()
  frame.connected = connected
  frame.sources = [{ id: 'claude', ok: isSourceOk, detail: 'test source' }]
  const [office] = buildOperationsModel({ frame, nowMs: NOW })

  expect(office.workers).toHaveLength(5)
  expect(office.workers.every((worker) => worker.evidence.status === status)).toBe(true)
  expect(
    office.workAreas.every((area) => area.freshWorkingCount === 0 && area.attentionCount === 0)
  ).toBe(true)
})

it('returns no offices for an empty frame', () => {
  expect(buildOperationsModel({ frame: makeFrame(), nowMs: NOW })).toEqual([])
})
