import { useMemo } from 'react'
import type { LoungeGeometry } from '../scene-model'
import { gameCornerParts } from './game-corner'
import { Parts } from './parts'
import type { ThemePalette } from './types'

// Drawn by the shared parts, so every theme's corners batch with the rest of its floor.
export function GameCorner({ lounge, palette }: { lounge: LoungeGeometry; palette: ThemePalette }) {
  const parts = useMemo(() => gameCornerParts(lounge, palette), [lounge, palette])
  return (
    <group name="game-corner">
      <Parts parts={parts} />
    </group>
  )
}
