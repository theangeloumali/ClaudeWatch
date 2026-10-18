import { useMemo } from 'react'
import { Parts } from '../parts'
import type { TowerProps } from '../types'
import { SAMURAI_MATERIALS as material } from './palette'
import { terracedDataKeep } from './town-designs'

export function SamuraiTower({ floors, plot }: TowerProps) {
  const parts = useMemo(
    () =>
      terracedDataKeep({
        width: Math.min(plot?.width ?? 6.8, 6.8),
        depth: Math.min(plot?.depth ?? 6.2, 6.2),
        height: Math.min(plot?.maxHeight ?? 12, Math.max(4, Math.min(floors.length, 6) * 1.6 + 4)),
        seed: 0,
        accent: material.cyan
      }),
    [floors, plot]
  )
  return <Parts parts={parts} />
}
