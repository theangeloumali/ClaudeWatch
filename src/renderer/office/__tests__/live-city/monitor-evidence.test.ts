import { expect, it, vi } from 'vitest'
import { buildWorkstationDisplays } from '../../logic/workstation-displays'
import { getTheme } from '../../themes/registry'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from '../fixtures'

it('never reports a smoothed worker pose as fresh work on a physical screen', () => {
  vi.spyOn(Date, 'now').mockReturnValue(10000)
  const record = makeSession({
    key: 'one',
    activity: 'idle',
    attention: 'none',
    currentTool: null,
    observation: { sourceId: 'test', observedAtMs: 10000, staleAfterMs: 1000, coverage: 'own' }
  })
  const room = makeRoom({ id: 'r1', sessionKey: record.key })
  const floor = makeFloor({ floorId: 'f1', rooms: [room] })
  const actor = makeAgent({
    agentKey: record.key,
    roomId: room.id,
    floorId: floor.floorId,
    slotId: room.seats[0].slotId,
    activity: 'editing'
  })
  const frame = makeFrame({
    sessions: [record],
    agents: [actor],
    floors: [floor],
    sources: [{ id: 'test', ok: true, detail: 'healthy' }]
  })
  try {
    const first = buildWorkstationDisplays({
      floor,
      frame,
      workstationForRoom: () => getTheme('corporate-city').workstation
    })
    expect(first[0].title).toMatch(/idle/i)
    record.observation!.observedAtMs = 1
    const stale = buildWorkstationDisplays({
      floor,
      frame,
      workstationForRoom: () => getTheme('corporate-city').workstation
    })
    expect(stale[0].title).toBe('Activity unavailable')
  } finally {
    vi.restoreAllMocks()
  }
})
