import { describe, expect, it, vi } from 'vitest'
import type { AgentView } from '../../../shared/office/types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import { deskOf } from '../layout'
import { CityWorld, observed } from './city-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 60_000 })

const GAMER = 'claude:idle'
const NEWCOMER = 'claude:new'
// Past the lounge delay and the walk to the corner.
const SETTLE_MS = LOUNGE_DELAY_MS + 30_000
// live-feed's longest step: the sim runs ten ticks in it, more than a whole fade.
const STALLED_STEP_MS = 1000

const viewOf = (views: AgentView[], key: string): AgentView | undefined =>
  views.find((view) => view.agentKey === key)

const deskGap = (city: CityWorld, view: AgentView): number => {
  const desk = deskOf(city.world.layout().floors, view)?.desk
  return desk ? Math.hypot(view.x - desk.x, view.z - desk.z) : Infinity
}

function gamerInLounge(): { city: CityWorld; gaming: AgentView } {
  const city = new CityWorld((nowMs) => [observed(GAMER, 'p_a', nowMs)])
  let gaming: AgentView | undefined
  city.run(SETTLE_MS, (views) => void (gaming = viewOf(views, GAMER)))
  if (gaming?.place !== 'lounge') throw new Error('the gamer never reached its corner')
  return { city, gaming }
}

// One step can start and end a whole fade, so the renderer needs a count no step can skip.
describe('the reseat marker survives a step that spans a whole fade', () => {
  it('counts a flapped leaver seated at its desk, away from the corner it faded in', () => {
    const { city, gaming } = gamerInLounge()
    expect(deskGap(city, gaming)).toBeGreaterThan(1)
    city.patch([], [GAMER])
    city.patch([{ ...observed(GAMER, 'p_a', city.clock), activity: 'thinking' }])
    city.clock += STALLED_STEP_MS
    const seated = viewOf(city.world.step(STALLED_STEP_MS), GAMER)

    expect({ isSeated: city.isSeated(seated), fade: seated?.fade }).toEqual({
      isSeated: true,
      fade: undefined
    })
    expect(seated?.reseats).toBe((gaming.reseats ?? 0) + 1)
  })

  // An agent that leaves for good takes its count with it, so a key that returns starts fresh.
  it('starts a returning session key with no count once its old agent has gone', () => {
    const { city, gaming } = gamerInLounge()
    city.patch([], [GAMER])
    city.patch([{ ...observed(GAMER, 'p_a', city.clock), activity: 'thinking' }])
    city.clock += STALLED_STEP_MS
    const reseated = viewOf(city.world.step(STALLED_STEP_MS), GAMER)
    expect(reseated?.reseats).toBe((gaming.reseats ?? 0) + 1)
    city.patch([], [GAMER])
    city.clock += STALLED_STEP_MS
    expect(viewOf(city.world.step(STALLED_STEP_MS), GAMER)).toBeUndefined()
    city.patch([observed(GAMER, 'p_a', city.clock)])
    city.clock += STALLED_STEP_MS
    const returned = viewOf(city.world.step(STALLED_STEP_MS), GAMER)

    expect({ isSeated: city.isSeated(returned), reseats: returned?.reseats }).toEqual({
      isSeated: true,
      reseats: undefined
    })
  })

  it('leaves the count alone for a newcomer that fades in at its own desk', () => {
    const city = new CityWorld((nowMs) => [observed(GAMER, 'p_a', nowMs)])
    city.patch([observed(NEWCOMER, 'p_a', city.clock)])
    const arriving = viewOf(city.world.step(0), NEWCOMER)
    expect(arriving?.fade).toBeDefined()
    city.clock += STALLED_STEP_MS
    const seated = viewOf(city.world.step(STALLED_STEP_MS), NEWCOMER)

    expect({ isSeated: city.isSeated(seated), reseats: seated?.reseats }).toEqual({
      isSeated: true,
      reseats: undefined
    })
  })
})
