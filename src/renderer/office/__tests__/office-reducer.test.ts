import { describe, expect, it } from 'vitest'
import { INITIAL_OFFICE_STATE, officeReducer, type OfficeState } from '../logic/office-reducer'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from './fixtures'

const frame = makeFrame({
  floors: [
    makeFloor({ floorId: 'f1', rooms: [makeRoom({ id: 'r1', sessionKey: 'claude:a' })] }),
    makeFloor({
      floorId: 'f2',
      rooms: [
        makeRoom({ id: 'r2', sessionKey: 'claude:b' }),
        makeRoom({ id: 'r3', sessionKey: 'codex:c' })
      ]
    })
  ],
  sessions: [
    makeSession({ key: 'claude:a' }),
    makeSession({ key: 'claude:b', attention: 'permission', updatedAtMs: 10 }),
    makeSession({ key: 'codex:c', attention: 'question', updatedAtMs: 20 })
  ],
  agents: [
    makeAgent({ agentKey: 'a', floorId: 'f1', roomId: 'r1' }),
    makeAgent({ agentKey: 'b', floorId: 'f2', roomId: 'r2', attention: 'permission' }),
    makeAgent({ agentKey: 'b-sub', floorId: 'f2', roomId: 'r2', isSubagent: true }),
    makeAgent({ agentKey: 'c', floorId: 'f2', roomId: 'r3', attention: 'question' })
  ]
})

function withFrame(): OfficeState {
  return officeReducer(INITIAL_OFFICE_STATE, { type: 'frame-received', frame })
}

describe('officeReducer', () => {
  it('focuses the floor at the head of the attention queue on first frame', () => {
    expect(withFrame().focusedFloorId).toBe('f2')
  })

  it('opens a queued session: focuses its floor, selects its main agent and flies', () => {
    const state = officeReducer(
      { ...withFrame(), focusedFloorId: 'f1' },
      { type: 'session-opened', sessionKey: 'codex:c' }
    )
    expect(state.focusedFloorId).toBe('f2')
    expect(state.selectedAgentKey).toBe('c')
    expect(state.cameraRequest).toMatchObject({ kind: 'fly', agentKey: 'c' })
  })

  it('walks the queue with Next', () => {
    const first = officeReducer(withFrame(), { type: 'next-attention' })
    expect(first.selectedAgentKey).toBe('b')
    const second = officeReducer(first, { type: 'next-attention' })
    expect(second.selectedAgentKey).toBe('c')
  })

  it('flies to a zone by id, and number keys to companies in floor order', () => {
    const zoned = officeReducer(INITIAL_OFFICE_STATE, {
      type: 'frame-received',
      frame: makeFrame({
        floors: [
          makeFloor({
            floorId: 'one',
            zones: [
              makeZone({ id: 'c-1', kind: 'company' }),
              makeZone({ id: 'c-2', kind: 'company' })
            ]
          })
        ]
      })
    })
    expect(officeReducer(zoned, { type: 'zone-flown', zoneId: 'p-9' }).cameraRequest).toMatchObject(
      {
        kind: 'zone',
        zoneId: 'p-9'
      }
    )
    expect(
      officeReducer(zoned, { type: 'company-numbered', number: 2 }).cameraRequest
    ).toMatchObject({
      kind: 'zone',
      zoneId: 'c-2'
    })
    expect(officeReducer(zoned, { type: 'company-numbered', number: 5 }).cameraRequest).toBeNull()
  })

  it('clears a selection whose agent left the frame', () => {
    const selected = officeReducer(withFrame(), { type: 'agent-selected', agentKey: 'b' })
    const emptied = officeReducer(selected, { type: 'frame-received', frame: makeFrame() })
    expect(emptied.selectedAgentKey).toBeNull()
    expect(emptied.focusedFloorId).toBeNull()
  })

  it('highlights a floor without taking back a manually owned City camera', () => {
    const city = officeReducer(withFrame(), { type: 'view-set', view: 'city' })
    const manual = officeReducer(city, { type: 'camera-zoomed', direction: 'out' })
    const focused = officeReducer(manual, { type: 'floor-focused', floorId: 'f1' })
    expect(focused.focusedFloorId).toBe('f1')
    expect(focused.viewMode).toBe('city')
    expect(focused.isCameraManuallyOwned).toBe(true)
    expect(focused.cameraRequest).toBe(manual.cameraRequest)
    expect(focused.frame).toBe(frame)
  })

  it('lets Reset re-arm the overview after a manual floor highlight', () => {
    const manual = officeReducer(withFrame(), { type: 'camera-manually-moved' })
    const focused = officeReducer(manual, { type: 'floor-focused', floorId: 'f1' })
    const reset = officeReducer(focused, { type: 'camera-reset' })
    expect(focused.cameraRequest).toBeNull()
    expect(reset.focusedFloorId).toBe('f1')
    expect(reset.isCameraManuallyOwned).toBe(false)
    expect(reset.cameraRequest).toMatchObject({ kind: 'reset' })
  })

  it('only flies to the selected agent when one is selected', () => {
    expect(officeReducer(withFrame(), { type: 'fly-to-selected' }).cameraRequest).toBeNull()
    const selected = officeReducer(withFrame(), { type: 'agent-selected', agentKey: 'c' })
    expect(officeReducer(selected, { type: 'fly-to-selected' }).cameraRequest).toMatchObject({
      kind: 'fly',
      agentKey: 'c'
    })
  })

  it('turns a zoom key into a camera request', () => {
    expect(
      officeReducer(withFrame(), { type: 'camera-zoomed', direction: 'out' }).cameraRequest
    ).toMatchObject({
      kind: 'zoom',
      direction: 'out'
    })
  })

  it('asks the camera to fit the floor, again each time it is pressed', () => {
    const first = officeReducer(withFrame(), { type: 'camera-fit' })
    expect(first.cameraRequest).toMatchObject({ kind: 'fit' })
    expect(officeReducer(first, { type: 'camera-fit' }).cameraRequest?.nonce).not.toBe(
      first.cameraRequest?.nonce
    )
  })

  it('toggles walls, list view and metrics', () => {
    let state = officeReducer(withFrame(), { type: 'walls-set', mode: 'down' })
    state = officeReducer(state, { type: 'list-toggled' })
    state = officeReducer(state, { type: 'metrics-toggled' })
    expect(state).toMatchObject({ wallsMode: 'down', isListView: true, isMetricsVisible: true })
  })
})

describe('walking', () => {
  it('starts off, and the switch turns it on and off', () => {
    expect(INITIAL_OFFICE_STATE.isWalking).toBe(false)
    const walking = officeReducer(INITIAL_OFFICE_STATE, { type: 'walk-toggled' })
    expect(walking.isWalking).toBe(true)
    expect(officeReducer(walking, { type: 'walk-toggled' }).isWalking).toBe(false)
  })

  it('marks the office the player was sent to without flying the camera there', () => {
    const state = officeReducer(INITIAL_OFFICE_STATE, { type: 'zone-walked', zoneId: 'company:a' })
    expect(state.focusedZoneId).toBe('company:a')
    expect(state.cameraRequest).toBeNull()
  })
})
