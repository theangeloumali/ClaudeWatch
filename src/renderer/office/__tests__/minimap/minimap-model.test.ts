import { describe, expect, it } from 'vitest'
import { buildMinimapModel } from '../../logic/minimap-model'
import { boundsOfZone } from '../../logic/zone-framing'
import { floorEnvelope } from '../../scene/all-floor-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from '../fixtures'
import {
  LEAD_KEY,
  makeMinimapFrame,
  MEMBER_KEY,
  NORTH_FLOOR_ID,
  PEER_KEY,
  ROOM_ID,
  SOUTH_FLOOR_ID,
  UPPER_FLOOR_ID
} from './minimap-fixtures'

function modelFor(overrides: Partial<Parameters<typeof buildMinimapModel>[0]> = {}) {
  return buildMinimapModel({
    frame: makeMinimapFrame(),
    focusedFloorId: NORTH_FLOOR_ID,
    focusedRoomId: null,
    selectedAgentKey: null,
    viewMode: 'city',
    isPreview: false,
    ...overrides
  })
}

describe('minimap geometry contract', () => {
  it('composes the city envelope without a camera projection or floor-local offsets', () => {
    const frame = makeMinimapFrame()
    const envelope = floorEnvelope(frame.floors)
    if (!envelope) throw new Error('The stacked-floor fixture needs an envelope')
    const model = modelFor({ frame })
    expect(model.bounds).toEqual(boundsOfZone(envelope))
    expect(model.floors.map((floor) => floor.floorId)).toEqual(
      frame.floors.map((floor) => floor.floorId)
    )
    expect(model.rooms).toEqual([])
  })

  it('keeps stacked floors separately selectable despite identical footprints', () => {
    const model = modelFor({ focusedFloorId: UPPER_FLOOR_ID })
    expect(model.floors[0].bounds).toEqual(model.floors[1].bounds)
    expect(model.floors.filter((floor) => floor.isSelected).map((floor) => floor.floorId)).toEqual([
      UPPER_FLOOR_ID
    ])
  })

  it('uses only the focused office bounds and exact room IDs', () => {
    const frame = makeMinimapFrame()
    const model = modelFor({ frame, viewMode: 'office', focusedRoomId: ROOM_ID })
    expect(model.bounds).toEqual(boundsOfZone(frame.floors[0]))
    expect(model.floors).toHaveLength(1)
    expect(model.floors[0]).toMatchObject({ floorId: NORTH_FLOOR_ID, isSelected: true })
    expect(model.rooms).toEqual([
      expect.objectContaining({
        id: ROOM_ID,
        label: 'Research bay',
        bounds: boundsOfZone(frame.floors[0].rooms[0]),
        isSelected: true
      })
    ])
  })

  it.each([
    { x: Number.NaN },
    { z: Number.POSITIVE_INFINITY },
    { width: 0 },
    { width: -2 },
    { depth: -1 },
    { depth: Number.POSITIVE_INFINITY },
    { x: Number.MAX_VALUE, width: Number.MAX_VALUE }
  ])('excludes unusable floor bounds %# before computing the envelope', (geometry) => {
    const validFloor = makeMinimapFrame().floors[0]
    const frame = makeFrame({
      floors: [validFloor, makeFloor({ floorId: 'invalid', ...geometry })]
    })
    const model = modelFor({ frame })
    expect(model.bounds).toEqual(boundsOfZone(validFloor))
    expect(model.floors.map((floor) => floor.floorId)).toEqual([NORTH_FLOOR_ID])
  })

  it.each([{ floors: [] }, { floors: [makeFloor({ floorId: 'invalid', width: 0 })] }])(
    'returns an explicit empty model for unusable geometry %#',
    ({ floors }) => {
      expect(modelFor({ frame: { ...makeMinimapFrame(), floors } })).toMatchObject({
        bounds: null,
        floors: [],
        rooms: [],
        workers: [],
        player: null
      })
    }
  )

  it('does not substitute a different office when the focused floor is missing', () => {
    expect(modelFor({ viewMode: 'office', focusedFloorId: 'missing' })).toMatchObject({
      bounds: null,
      floors: [],
      rooms: [],
      workers: [],
      player: null
    })
  })

  it('skips invalid rooms without losing the valid room or mutating the frame', () => {
    const frame = makeMinimapFrame()
    frame.floors[0].rooms.push(makeRoom({ id: 'invalid-room', width: Number.NaN }))
    const before = structuredClone(frame)
    const model = modelFor({ frame, viewMode: 'office' })
    expect(model.rooms.map((room) => room.id)).toEqual([ROOM_ID])
    expect(frame).toEqual(before)
  })
})

describe('minimap actor contract', () => {
  it('shows only current workers physically on the represented office at their world x/z', () => {
    const frame = makeMinimapFrame()
    frame.agents[2] = { ...frame.agents[2], physicalFloorId: NORTH_FLOOR_ID, x: 103, z: -43 }
    const model = modelFor({ frame, viewMode: 'office', selectedAgentKey: PEER_KEY })
    expect(model.workers).toHaveLength(2)
    expect(model.workers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentKey: LEAD_KEY, x: 102, z: -42, isSelected: false }),
        expect.objectContaining({ agentKey: PEER_KEY, x: 103, z: -43, isSelected: true })
      ])
    )
  })

  it.each([
    { physicalFloorId: UPPER_FLOOR_ID },
    { physicalFloorId: null },
    { physicalFloorId: 'missing' },
    { x: Number.NaN },
    { z: Number.POSITIVE_INFINITY }
  ])('does not turn an absent or invalid worker into a home-floor dot %#', (presence) => {
    const frame = makeMinimapFrame()
    frame.agents = [{ ...frame.agents[0], ...presence }]
    expect(modelFor({ frame, viewMode: 'office' }).workers).toEqual([])
  })

  it('retains the legacy home-floor fallback only when physicalFloorId is absent', () => {
    const frame = makeMinimapFrame()
    frame.agents = [makeAgent({ agentKey: LEAD_KEY, floorId: NORTH_FLOOR_ID, x: 102, z: -42 })]
    expect(modelFor({ frame, viewMode: 'office' }).workers).toEqual([
      expect.objectContaining({ agentKey: LEAD_KEY, x: 102, z: -42 })
    ])
  })

  it('accepts an exact member ID containing # on its actual stacked floor', () => {
    const model = modelFor({ viewMode: 'office', focusedFloorId: UPPER_FLOOR_ID })
    expect(model.workers).toEqual([
      expect.objectContaining({ agentKey: MEMBER_KEY, x: 105, z: -41 })
    ])
  })

  it.each(['claude:lea', `${LEAD_KEY}#gone`, `${LEAD_KEY}#review`, `${MEMBER_KEY}#extra`])(
    'rejects an unresolvable worker key %s rather than using a prefix',
    (agentKey) => {
      const frame = makeMinimapFrame()
      frame.agents = [{ ...frame.agents[0], agentKey }]
      expect(modelFor({ frame, viewMode: 'office' }).workers).toEqual([])
    }
  )

  it('rejects a key with both a session reading and a member reading', () => {
    const frame = makeMinimapFrame()
    frame.sessions.push(makeSession({ key: MEMBER_KEY }))
    expect(modelFor({ frame, viewMode: 'office', focusedFloorId: UPPER_FLOOR_ID }).workers).toEqual(
      []
    )
  })

  it('rejects repeated member identities instead of choosing one arbitrarily', () => {
    const frame = makeMinimapFrame()
    frame.sessions[0].subagents.push({ ...frame.sessions[0].subagents[0] })
    expect(modelFor({ frame, viewMode: 'office', focusedFloorId: UPPER_FLOOR_ID }).workers).toEqual(
      []
    )
  })

  it('drops departed ghosts and reads movement from the next supplied frame', () => {
    const frame = makeMinimapFrame()
    const moved = modelFor({
      frame: { ...frame, agents: [{ ...frame.agents[0], x: 109 }] },
      viewMode: 'office'
    })
    expect(moved.workers[0]).toMatchObject({ agentKey: LEAD_KEY, x: 109, z: -42 })
    expect(modelFor({ frame: { ...frame, sessions: [] } }).workers).toEqual([])
    expect(modelFor({ frame: { ...frame, agents: [] } }).workers).toEqual([])
  })

  it('uses supplied preview geometry and suppresses both live workers and the player', () => {
    const frame = makeMinimapFrame()
    const previewFloor = {
      ...frame.floors[0],
      x: 2000,
      rooms: [makeRoom({ id: 'preview:room', label: 'Unsaved bay', x: 2002, z: -44 })]
    }
    const model = modelFor({
      frame: { ...frame, floors: [previewFloor] },
      viewMode: 'office',
      isPreview: true,
      player: { x: 2001, z: -40, physicalFloorId: NORTH_FLOOR_ID }
    })
    expect(model.bounds).toEqual(boundsOfZone(previewFloor))
    expect(model.rooms.map((room) => room.id)).toEqual(['preview:room'])
    expect(model.workers).toEqual([])
    expect(model.player).toBeNull()
  })

  it.each([
    { physicalFloorId: UPPER_FLOOR_ID, x: 101, z: -40 },
    { physicalFloorId: null, x: 101, z: -40 },
    { physicalFloorId: 'missing', x: 101, z: -40 },
    { physicalFloorId: NORTH_FLOOR_ID, x: Number.NaN, z: -40 }
  ])('hides a player outside the represented office or with invalid coordinates %#', (player) => {
    expect(modelFor({ viewMode: 'office', player }).player).toBeNull()
  })

  it('uses only the supplied player snapshot on a represented surface', () => {
    const player = { x: 101, z: -40, physicalFloorId: NORTH_FLOOR_ID }
    expect(modelFor({ viewMode: 'office', player }).player).toMatchObject(player)
    expect(modelFor().player).toBeNull()
    expect(
      modelFor({ player: { x: 142, z: 18, physicalFloorId: SOUTH_FLOOR_ID } }).player
    ).not.toBeNull()
    expect(modelFor({ player: { ...player, physicalFloorId: 'missing' } }).player).toBeNull()
  })

  it('shows an exactly identified street worker only in City without moving it home', () => {
    const frame = makeMinimapFrame()
    frame.agents = [{ ...frame.agents[0], physicalFloorId: null, x: 120, z: -10 }]
    expect(modelFor({ frame }).workers).toEqual([
      expect.objectContaining({ agentKey: LEAD_KEY, physicalFloorId: null, x: 120, z: -10 })
    ])
    expect(modelFor({ frame, viewMode: 'office' }).workers).toEqual([])
  })

  it.each([
    { physicalFloorId: 'missing', x: 102, z: -42 },
    { physicalFloorId: NORTH_FLOOR_ID, x: 142, z: 18 },
    { physicalFloorId: null, x: Number.MAX_VALUE, z: 0 }
  ])('does not draw a worker outside its represented physical surface %#', (presence) => {
    const frame = makeMinimapFrame()
    frame.agents = [{ ...frame.agents[0], ...presence }]
    expect(modelFor({ frame }).workers).toEqual([])
  })

  it('accepts a City street player only between known footprints, not inside another surface', () => {
    const street = { physicalFloorId: null, x: 120, z: -10 }
    expect(modelFor({ player: street }).player).toEqual(street)
    expect(modelFor({ player: { ...street, x: 102, z: -42 } }).player).toBeNull()
    expect(modelFor({ player: { ...street, x: Number.MAX_VALUE } }).player).toBeNull()
    expect(
      modelFor({ player: { physicalFloorId: SOUTH_FLOOR_ID, x: 102, z: -42 } }).player
    ).toBeNull()
  })

  it('deduplicates current actor views without retaining a ghost between calls', () => {
    const frame = makeMinimapFrame()
    frame.agents = [frame.agents[0], { ...frame.agents[0] }]
    expect(modelFor({ frame }).workers).toHaveLength(1)
    expect(modelFor({ frame: { ...frame, agents: [] } }).workers).toEqual([])
  })

  it('returns an empty model when individually valid floors overflow the city envelope', () => {
    const floors = [-1e308, 1e308].map((x, index) =>
      makeFloor({ floorId: `extreme:${index}`, x, width: 1e307 })
    )
    expect(modelFor({ frame: makeFrame({ floors }) })).toMatchObject({
      bounds: null,
      floors: [],
      rooms: [],
      workers: [],
      player: null
    })
  })
})
