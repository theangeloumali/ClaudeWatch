import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { buildingPlace, type BuildingPlace, type PlaceTop } from '../logic/building-place'
import { cityClock } from '../logic/city-clock'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M } from '../logic/token-spires'
import { Parts } from '../themes/parts'
import { spireMast, spireModules } from '../themes/spire-parts'
import type { OfficeTheme } from '../themes/types'

// How much of the tallest spire stands now: the live roof above the crown, eased and capped.
export function spireShare(
  place: BuildingPlace,
  crownTopY: number,
  nowMs: number,
  isPinned: boolean
): number {
  const top = place.topAt(nowMs, isPinned)
  if (!top) return 0
  return Math.max(0, top.y - crownTopY - SPIRE_BASE_GAP_M) / SPIRE_MAX_M
}

// Plain boxes inside the shell's batch (+0 draws); only a moving share uploads its matrices.
export function TokenSpire({
  buildingId,
  deck,
  roof,
  theme
}: {
  buildingId: string
  deck: PlaceTop
  roof: PlaceTop
  theme: OfficeTheme
}) {
  const baseY = roof.y + SPIRE_BASE_GAP_M
  const modules = useMemo(() => spireModules(theme), [theme])
  const mast = useMemo(() => spireMast(deck, baseY, theme), [deck, baseY, theme])
  const spire = useRef<Group>(null)
  const stack = useRef<Group>(null)
  useFrame(() => {
    if (!spire.current || !stack.current) return
    const share = spireShare(
      buildingPlace(buildingId),
      roof.y,
      cityClock.now(),
      cityClock.isPinned()
    )
    spire.current.visible = share > 0
    if (share > 0) stack.current.scale.y = share
  })
  return (
    <group ref={spire} name={`token-spire:${buildingId}`} visible={false}>
      <Parts parts={mast} />
      <group ref={stack} position={[roof.x, baseY, roof.z]}>
        <Parts parts={modules} />
      </group>
    </group>
  )
}
