import { useMemo } from 'react'
import { firstClear, spotAt } from '../lounge-layout'
import { box, Parts, type PartSpec } from '../parts'
import type { LoungeProps } from '../types'
import { SAMURAI_LOUNGE_SEAT, SAMURAI_TEA_STATION } from './furniture'
import { SAMURAI_MATERIALS as material } from './palette'

export function SamuraiLounge({ lounge }: LoungeProps) {
  const decor = useMemo(() => {
    if (lounge.width < 0.86 || lounge.depth < 0.72) return []
    const spot = firstClear(
      lounge,
      [-1, 1].flatMap((across) => [-1, 1].map((along) => spotAt(lounge, across, along, 0.56, 0.42)))
    )
    return spot
      ? SAMURAI_TEA_STATION.map(
          (part): PartSpec => ({
            ...part,
            at: [part.at[0] + spot.x, part.at[1], part.at[2] + spot.z]
          })
        )
      : []
  }, [lounge])
  return (
    <>
      <Parts
        parts={[
          box([lounge.x, 0.014, lounge.z], [lounge.width, 0.025, lounge.depth], material.mineral)
        ]}
      />
      {lounge.seats.map((seat) => (
        <group
          key={seat.slotId}
          name="lounge-seat"
          position={[seat.x, 0, seat.z]}
          rotation={[0, seat.heading, 0]}
        >
          <Parts parts={SAMURAI_LOUNGE_SEAT} />
        </group>
      ))}
      <group name="lounge-decor">
        <Parts parts={decor} />
      </group>
    </>
  )
}
