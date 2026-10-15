import type { AgentView } from '../../../../shared/office/types'
import type { OfficeFrame } from '../../scene-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from '../fixtures'

export const ACTIVITY_STATES = [
  'idle',
  'thinking',
  'reading',
  'editing',
  'running',
  'searching',
  'delegating'
] as const

export const ATTENTION_STATES = [
  'none',
  'permission',
  'question',
  'done',
  'error',
  'limited'
] as const

// dry-new: Compose canonical factories into one project with matching session/agent states.
export function makeActivityFrame(
  workers: readonly Pick<AgentView, 'activity' | 'attention'>[]
): OfficeFrame {
  const sessions = workers.map((worker, index) =>
    makeSession({
      key: `worker-${index}`,
      name: `worker ${index}`,
      activity: worker.activity,
      attention: worker.attention,
      currentTool: worker.activity === 'editing' ? { name: 'Edit', category: 'edit' } : null
    })
  )
  return makeFrame({
    sessions,
    floors: [
      makeFloor({
        floorId: 'f1',
        rooms: sessions.map((session, index) =>
          makeRoom({ id: `room-${index}`, sessionKey: session.key })
        ),
        zones: [
          makeZone({
            id: 'company',
            kind: 'company',
            label: 'Test Co',
            companyKey: 'c_test',
            children: [
              makeZone({
                id: 'project',
                kind: 'project',
                label: 'Project',
                projectKey: 'p_1',
                companyKey: 'c_test'
              })
            ]
          })
        ]
      })
    ],
    agents: workers.map((worker, index) =>
      makeAgent({
        agentKey: `worker-${index}`,
        roomId: `room-${index}`,
        label: `worker ${index}`,
        activity: worker.activity,
        attention: worker.attention
      })
    )
  })
}

export function activityCountPattern(count: number, label: string): RegExp {
  return new RegExp(`(?:\\b${count}\\s+(?:${label})\\b|\\b(?:${label})\\s*:?\\s*${count}\\b)`, 'i')
}
