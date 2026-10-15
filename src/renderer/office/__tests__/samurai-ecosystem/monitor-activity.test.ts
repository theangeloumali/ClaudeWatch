import { describe, expect, it } from 'vitest'
import { buildWorkstationDisplays } from '../../logic/workstation-displays'
import { WORKSTATIONS } from '../../themes/workstations'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from '../fixtures'

const lead = makeAgent({
  agentKey: 'claude:lead',
  roomId: 'r1',
  slotId: 'desk_main',
  activity: 'editing'
})
const guest = makeAgent({
  agentKey: 'claude:lead#guest',
  roomId: 'r1',
  slotId: 'guest_1',
  isSubagent: true,
  activity: 'reading'
})
const floor = makeFloor({
  floorId: 'f1',
  rooms: [
    makeRoom({
      id: 'r1',
      sessionKey: lead.agentKey,
      seats: [
        { slotId: 'desk_main', x: 0, z: 0, heading: 0 },
        { slotId: 'guest_1', x: 3, z: 0, heading: Math.PI / 2 }
      ]
    })
  ]
})
const frame = makeFrame({
  floors: [floor],
  agents: [lead, guest],
  sessions: [makeSession({ key: lead.agentKey, currentTool: { name: 'Edit', category: 'edit' } })]
})
const displays = (snapshot = frame) =>
  buildWorkstationDisplays({
    frame: snapshot,
    floor,
    workstationForRoom: () => WORKSTATIONS.corporate
  })

describe('truthful monitor activity', () => {
  it('shows the lead tool without attributing it to a guest', () => {
    expect(displays().map(({ title, detail }) => [title, detail])).toEqual([
      ['Editing', 'Edit'],
      ['Reading', 'Reported activity']
    ])
  })

  it('prioritizes attention over a stale tool', () => {
    const attentionFrame = { ...frame, agents: [{ ...lead, attention: 'permission' as const }] }
    expect(displays(attentionFrame)[0]).toMatchObject({
      title: 'Needs permission',
      detail: 'Reported activity'
    })
  })

  it('labels disconnected or unhealthy sources without retaining tool text', () => {
    expect(displays({ ...frame, connected: false })[0]).toMatchObject({
      title: 'Activity unavailable',
      detail: 'No live report'
    })
    expect(
      displays({ ...frame, sources: [{ id: 'claude', ok: false, detail: 'offline' }] })[0].detail
    ).toBe('No live report')
  })

  it('clears displays when a session leaves or workers move into a lounge', () => {
    expect(displays({ ...frame, agents: [] })).toEqual([])
    expect(displays({ ...frame, agents: [{ ...lead, place: 'lounge' }] })).toEqual([])
    expect(displays({ ...frame, sessions: [] })[0].title).toBe('Activity unavailable')
  })

  it('places activity on the reserved furniture, not the walking model', () => {
    const walking = displays({
      ...frame,
      agents: [{ ...lead, x: 999, z: 999, heading: Math.PI }]
    })[0]
    expect(walking.x).toBe(0)
    expect(walking.rotationY).toBe(Math.PI)
    expect(walking.agentKey).toBe(lead.agentKey)
  })

  it('leaves unsupported legacy hardware untouched', () => {
    expect(buildWorkstationDisplays({ frame, floor, workstationForRoom: () => undefined })).toEqual(
      []
    )
  })
})
