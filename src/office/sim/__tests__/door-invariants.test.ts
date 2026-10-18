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

  it('lets a relayout carry a seated agent onto a leaver fading where it stood', () => {
    const invariants = new DoorInvariants(() => true)
    const leaver = (fade?: number): AgentView => ({ ...view('leaver', 0, fade), place: 'leaving' })
    invariants.check([view('seated', 3), view('leaver', 0)], 0)
    invariants.check([view('seated', 0.5), leaver(0.2)], 100)
    invariants.check([view('seated', 0.5), leaver(0.4)], 200)
    expect(invariants.report().overlap).toBeNull()
  })

  it('flags a walker that walks into a leaver', () => {
    const invariants = new DoorInvariants(() => false)
    const leaver = (fade: number): AgentView => ({ ...view('leaver', 0, fade), place: 'leaving' })
    invariants.check([view('leaver', 0), view('walker', 1.4)], 0)
    invariants.check([leaver(0.2), view('walker', 1.3)], 100)
    invariants.check([leaver(0.4), view('walker', 1.2)], 200)
    expect(invariants.report().overlap?.detail).toMatch(/leaver and walker/)
  })

  // The sim drops a returning leaver's body until its fade ends (M2).
  it('lets a walker pass a leaver whose session came back while it fades', () => {
    const invariants = new DoorInvariants(() => false)
    const leaver = (fade: number): AgentView => ({ ...view('back', 0, fade), place: 'leaving' })
    invariants.check([view('back', 0), view('walker', 1.4)], 0)
    invariants.check([leaver(0.2), view('walker', 1.3)], 100)
    invariants.check([view('back', 0, 0.4), view('walker', 0.5)], 200)
    expect(invariants.report().overlap).toBeNull()
  })

  it('lets a walker pass an agent whose fade restarted, as a newcomer', () => {
    const invariants = new DoorInvariants(() => false)
    invariants.check([view('again', 0), view('walker', 1.4)], 0)
    invariants.check([view('again', 0, 0.4), view('walker', 1.3)], 100)
    invariants.check([view('again', 0, 0), view('walker', 0.5)], 200)
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

// The stall timer lets a walker stand 12 s before it repaths: that must be caught (I1).
it('flags a walker held in place as long as the stall timer lets it stand', () => {
  const invariants = new DoorInvariants(() => false)
  for (let atMs = 0; atMs <= 12_000; atMs += 100) invariants.check([view('walker', 0)], atMs)
  expect(invariants.report().blocked?.detail).toMatch(/walker held near/)
})
