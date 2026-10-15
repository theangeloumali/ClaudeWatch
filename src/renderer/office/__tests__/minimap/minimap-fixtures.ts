import { agentKey } from '../../../../shared/office/agent-key'
import type { OfficeFrame } from '../../scene-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from '../fixtures'

export const NORTH_FLOOR_ID = 'floor:north:1'
export const UPPER_FLOOR_ID = 'floor:north:2'
export const SOUTH_FLOOR_ID = 'floor:south:1'
export const ROOM_ID = 'zone:north:research'
export const LEAD_KEY = 'claude:lead'
export const MEMBER_KEY = agentKey(LEAD_KEY, 'review#detail')
export const PEER_KEY = 'opencode:peer'

// dry-new: existing builders need one stacked-floor fixture shared by minimap tests.
export function makeMinimapFrame(): OfficeFrame {
  const room = makeRoom({
    id: ROOM_ID,
    sessionKey: LEAD_KEY,
    label: 'Research bay',
    x: 104,
    z: -44,
    width: 6,
    depth: 4
  })
  const north = makeFloor({
    floorId: NORTH_FLOOR_ID,
    buildingId: 'building:north',
    floorNumber: 1,
    label: 'North studio · Floor 1',
    x: 100,
    z: -40,
    width: 20,
    depth: 20,
    rooms: [room],
    zones: [
      makeZone({
        id: 'company:north',
        kind: 'company',
        children: [makeZone({ ...room, kind: 'office' })]
      })
    ]
  })
  return makeFrame({
    floors: [
      north,
      makeFloor({
        ...north,
        floorId: UPPER_FLOOR_ID,
        floorNumber: 2,
        elevation: 5.5,
        label: 'North studio · Floor 2',
        rooms: [],
        zones: []
      }),
      makeFloor({
        floorId: SOUTH_FLOOR_ID,
        buildingId: 'building:south',
        label: 'South studio',
        x: 140,
        z: 20,
        width: 20,
        depth: 20
      })
    ],
    sessions: [
      makeSession({
        key: LEAD_KEY,
        name: 'Maya',
        subagents: [{ id: 'review#detail', name: 'Iris', type: 'Explore', activity: 'idle' }]
      }),
      makeSession({ key: PEER_KEY, provider: 'opencode', name: 'Ravi' })
    ],
    agents: [
      makeAgent({
        agentKey: LEAD_KEY,
        floorId: NORTH_FLOOR_ID,
        physicalFloorId: NORTH_FLOOR_ID,
        roomId: ROOM_ID,
        label: 'Maya',
        x: 102,
        z: -42
      }),
      makeAgent({
        agentKey: MEMBER_KEY,
        floorId: NORTH_FLOOR_ID,
        physicalFloorId: UPPER_FLOOR_ID,
        roomId: ROOM_ID,
        label: 'Iris',
        isSubagent: true,
        x: 105,
        z: -41
      }),
      makeAgent({
        agentKey: PEER_KEY,
        floorId: SOUTH_FLOOR_ID,
        physicalFloorId: SOUTH_FLOOR_ID,
        label: 'Ravi',
        x: 142,
        z: 18
      })
    ]
  })
}
