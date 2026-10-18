import { useMemo } from 'react'
import type { ZoomBand } from '../logic/camera-bands'
import { LotFill } from '../themes/LotFill'
import { GROUND_Y } from '../themes/surroundings'
import type { OfficeTheme, TowerFloor } from '../themes/types'
import { dressLot } from '../town/town-dress'
import type { TownPlan } from '../town/town-plan'
import { dressOf, townLandmark } from '../town/TownView'
import { BatchedScene } from './BatchedScene'

// The floor theme's landmark on the town's civic landmark lot: the tower in the building view,
// and a civic building of the theme's own until then. Its own small batch, so a change of zoom
// band never rebuilds the town.
export function TowerView({
  plan,
  theme,
  floors,
  band
}: {
  plan: TownPlan
  theme: OfficeTheme
  floors: readonly TowerFloor[]
  band: ZoomBand
}) {
  const { Tower } = theme.world
  const hasTower = band === 'building'
  const lot = townLandmark(plan)
  const revision = JSON.stringify([theme.id, hasTower, lot?.id, lot?.maxHeight, floors])
  return useMemo(
    () =>
      lot ? (
        <BatchedScene revision={revision} isStatic>
          {hasTower ? (
            <group position={[lot.x, GROUND_Y, lot.z]}>
              <Tower floors={floors} plot={lot} />
            </group>
          ) : (
            <LotFill placed={[dressLot(lot, GROUND_Y, dressOf(theme))]} />
          )}
        </BatchedScene>
      ) : null,
    // `revision` stands for the lot, the storeys and whether the tower shows.
    [revision, theme, Tower]
  )
}
