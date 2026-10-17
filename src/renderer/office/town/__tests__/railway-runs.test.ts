import { expect, it } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import { distributedTown } from '../distributed-town'
import { railwayPlan } from '../railway-plan'
import { trainRuns, type CarKind } from '../railway-runs'
import { townOf } from '../use-town-plan'

const floors = [0, 1, 2, 3].map((index) =>
  makeFloor({ floorId: `f${index}`, x: (index % 2) * 64 + 32, z: Math.floor(index / 2) * 56 + 28 })
)

// Each kind is one instanced mesh, so its cars across every train fill slots 0, 1, 2… once each.
// Light runs no trains.
it.each(['full', 'balanced'] as const)(
  "gives every car at %s its own slot in its kind's mesh",
  (level) => {
    const railway = railwayPlan(distributedTown(townOf(floors[0], null), floors).plan)
    if (!railway) throw new Error('no railway')
    const slotsOf = new Map<CarKind, number[]>()
    for (const car of trainRuns(railway, level).flatMap((run) => run.cars))
      slotsOf.set(car.kind, [...(slotsOf.get(car.kind) ?? []), car.slot])
    for (const slots of slotsOf.values()) expect(slots).toEqual(slots.map((_slot, index) => index))
  }
)
