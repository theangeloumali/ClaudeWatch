import { describe, expect, it } from 'vitest'
import type { AgentView } from '../../../shared/office/types'
import { DoorInvariants } from './door-invariants'

const view = (agentKey: string, x: number, fade?: number): AgentView => ({
  agentKey,
  floorId: 'hq',
  roomId: 'room',
  slotId: 'desk_main',
  x,
  z: 0,
  heading: 0,
  activity: 'idle',
  attention: 'none',
  provider: 'claude',
  isSubagent: false,
  label: agentKey,
  ...(fade === undefined ? {} : { fade })
})

describe('door invariants: every agent is a body but a newcomer fading in or a leaver', () => {
  it('flags an agent fading out to its desk where another body stands', () => {
    const invariants = new DoorInvariants(() => true)
    invariants.check([view('seated', 0), view('recalled', 2)], 0)
    invariants.check([view('seated', 0), view('recalled', 0.5, 0.2)], 100)
    expect(invariants.report().overlap?.detail).toMatch(/seated and recalled/)
  })

  it('lets a leaver fade out where a body comes to stand', () => {
    const invariants = new DoorInvariants(() => true)
    invariants.check([view('seated', 0), view('leaver', 2)], 0)
    invariants.check([view('seated', 0), { ...view('leaver', 0.5, 0.2), place: 'leaving' }], 100)
    expect(invariants.report().overlap).toBeNull()
  })

  it('lets a newcomer fade in on a desk until it is seated there', () => {
    const invariants = new DoorInvariants(() => true)
    invariants.check([view('seated', 0), view('newcomer', 0.5, 0)], 0)
    invariants.check([view('seated', 0), view('newcomer', 0.5, 0.8)], 100)
    expect(invariants.report().overlap).toBeNull()
    invariants.check([view('seated', 0), view('newcomer', 0.5)], 200)
    expect(invariants.report().overlap?.detail).toMatch(/seated and newcomer/)
  })
})
