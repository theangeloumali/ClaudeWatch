import { useMemo } from 'react'
import { boundsOfZone } from '../logic/zone-framing'
import { BatchedScene } from '../scene/BatchedScene'
import { CitySceneryCutaway } from '../scene/CitySceneryCutaway'
import type { FloorGeometry } from '../scene-model'
import { RisingSteam } from '../themes/ambient-parts'
import type { PlacedLot } from '../themes/lot-kit'
import { thinnedLots } from '../themes/lot-thinning'
import type { OfficeTheme } from '../themes/types'
import { fallbackDress } from './fallback-dress'
import { dressTown } from './open-lots'
import { townSteamStacks } from './town-ambient'
import type { TownDress } from './town-dress'
import type { Town } from './use-town-plan'

// A theme's own town, or one made from its palette until it has drawn one.
export function dressOf(theme: OfficeTheme): TownDress {
  return theme.town ?? fallbackDress(theme.palette)
}

interface TownProps {
  town: Town
  floor: FloorGeometry
  // Dresses every lot: the city knows no company that owns one.
  floorTheme: OfficeTheme
  viewMode?: 'city' | 'office'
  focusedFloor?: FloorGeometry
}

// Says when the town's lots must be placed again: the claim stepped, the size opened or built
// lots, a lot changed geometry, or the floor changed theme.
function townRevision({ town, floorTheme }: TownProps): string {
  const { plan } = town
  return JSON.stringify([
    boundsOfZone(plan.claim),
    boundsOfZone(plan.extent),
    plan.size,
    plan.lots,
    plan.officeSites,
    floorTheme.id
  ])
}

let dressedCache: { revision: string; lots: PlacedLot[] } | null = null

// Every lot in the floor's theme. TownView and TownAmbient share one dressing per revision: the
// movers keep to exactly what was drawn, and nothing is dressed twice.
function dressedTown({ town, floorTheme }: TownProps, revision: string): PlacedLot[] {
  if (dressedCache?.revision !== revision)
    dressedCache = { revision, lots: dressTown(town.plan, dressOf(floorTheme)) }
  return dressedCache.lots
}

// The buildings of the city, merged once per revision.
export function TownView(props: TownProps) {
  const { town, floorTheme, floor } = props
  const inspectionFloor = props.focusedFloor ?? floor
  const isInspecting = props.viewMode === 'office'
  const lotsRevision = useMemo(() => townRevision(props), [town, floorTheme])
  // The same elements while a revision stands: an agent's step re-renders the scene, and React
  // must find nothing to do here.
  return useMemo(
    () => (
      <CitySceneryCutaway
        placed={dressedTown(props, lotsRevision)}
        floor={inspectionFloor}
        revision={lotsRevision}
        isInspecting={isInspecting}
      />
    ),
    // `lotsRevision` stands for the plan and the floor's theme.
    [lotsRevision, inspectionFloor, isInspecting]
  )
}

interface TownAmbientProps extends TownProps {
  // The share of its lots the theme may put a mover on; at 0 nothing is mounted.
  share: number
  isReducedMotion: boolean
}

// The theme's moving things on the lots, and the steam off its chimneys. Followed frame by
// frame, so it is kept apart from the buildings, which are placed once.
export function TownAmbient(props: TownAmbientProps) {
  const { town, floor, floorTheme, share, isReducedMotion } = props
  const lotsRevision = useMemo(() => townRevision(props), [town, floorTheme])
  return useMemo(() => {
    // A theme with no Ambient part has opted out of moving things, its steam included.
    const { Ambient } = floorTheme.kit.zone
    if (share <= 0 || !Ambient) return null
    const placedOf = new Map(dressedTown(props, lotsRevision).map((each) => [each.lot, each]))
    const lots = thinnedLots([...placedOf.keys()], share, floor)
    const placed = lots.flatMap((lot) => placedOf.get(lot) ?? [])
    const stacks = townSteamStacks(placed, dressOf(floorTheme))
    return (
      <BatchedScene revision={JSON.stringify([lotsRevision, share, isReducedMotion])}>
        <Ambient floor={floor} lots={lots} placed={placed} isReducedMotion={isReducedMotion} />
        {stacks.length > 0 && (
          <RisingSteam
            stacks={stacks}
            color={floorTheme.palette.steam}
            isReducedMotion={isReducedMotion}
          />
        )}
      </BatchedScene>
    )
    // `lotsRevision` stands for the plan and the floor's theme.
  }, [lotsRevision, floor, share, isReducedMotion])
}
