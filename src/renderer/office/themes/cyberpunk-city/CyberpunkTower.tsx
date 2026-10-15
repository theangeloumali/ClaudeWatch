import { useMemo } from 'react'
import { Parts } from '../parts'
import type { TowerProps } from '../types'
import { relayTower } from './building-parts'
import { CYBERPUNK_PALETTE } from './palette'

export function CyberpunkTower({ plot }: TowerProps) {
  const parts = useMemo(
    () =>
      relayTower({
        width: Math.min(plot?.width ?? 6, 6),
        depth: Math.min(plot?.depth ?? 5, 5),
        height: Math.min(plot?.maxHeight ?? 15, 15),
        seed: 7,
        accent: CYBERPUNK_PALETTE.glow
      }),
    [plot?.width, plot?.depth, plot?.maxHeight]
  )
  return <Parts parts={parts} />
}
