import { useMemo } from 'react'
import type { LoungeGeometry } from '../scene-model'
import { gameCornerParts, overviewCornerParts } from './game-corner'
import { loungeAsDrawn } from './lounge-layout'
import { Parts } from './parts'
import type { ThemePalette } from './types'

// The overview keeps one body per seat, so a city of corners stays inside its triangle ceiling.
const PARTS_FOR = { full: gameCornerParts, overview: overviewCornerParts }
type CornerDetail = keyof typeof PARTS_FOR

// Handed the sim's lounge, drawn at its theme's size by the shared parts, so every theme's
// corners batch with the rest of its floor.
export function GameCorner({
  lounge,
  palette,
  detail = 'full'
}: {
  lounge: LoungeGeometry
  palette: ThemePalette
  detail?: CornerDetail
}) {
  const parts = useMemo(
    () => PARTS_FOR[detail](loungeAsDrawn(lounge), palette),
    [lounge, palette, detail]
  )
  return (
    <group name="game-corner">
      <Parts parts={parts} />
    </group>
  )
}
