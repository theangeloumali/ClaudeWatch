import { useMemo } from 'react'
import type { LoungeGeometry } from '../scene-model'
import { gameCornerParts } from './game-corner'
import { loungeAsDrawn } from './lounge-layout'
import { Parts } from './parts'
import type { ThemePalette } from './types'

// Handed the sim's lounge, drawn at its theme's size by the shared parts, so every theme's
// corners batch with the rest of its floor.
export function GameCorner({ lounge, palette }: { lounge: LoungeGeometry; palette: ThemePalette }) {
  const parts = useMemo(() => gameCornerParts(loungeAsDrawn(lounge), palette), [lounge, palette])
  return (
    <group name="game-corner">
      <Parts parts={parts} />
    </group>
  )
}
