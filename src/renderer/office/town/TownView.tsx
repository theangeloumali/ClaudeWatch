import { Fragment, useMemo } from 'react'
import type { ThemeZoneGroup } from '../logic/office-themes'
import { boundsOfZone } from '../logic/zone-framing'
import { BatchedScene } from '../scene/BatchedScene'
import { CitySceneryCutaway } from '../scene/CitySceneryCutaway'
import type { FloorGeometry } from '../scene-model'
import { RisingSteam } from '../themes/ambient-parts'
import type { PlacedLot } from '../themes/lot-kit'
import { LotFill } from '../themes/LotFill'
import { dressCityDistrict } from '../themes/city-district-parts'
import { thinnedLots } from '../themes/lot-thinning'
import { getTheme } from '../themes/registry'
import { GROUND_Y, lotBase } from '../themes/surroundings'
import type { OfficeTheme } from '../themes/types'
import { fallbackDress } from './fallback-dress'
import { placeGardenPiece } from './garden-pieces'
import { townSteamStacks } from './town-ambient'
import { dressLot, type TownDress } from './town-dress'
import type { TownLot } from './town-lots'
import type { TownPlan } from './town-plan'
import { themeIdsByZone } from './town-trips'
import type { Town } from './use-town-plan'

// A theme's own town, or one made from its palette until it has drawn one.
export function dressOf(theme: OfficeTheme): TownDress {
  return theme.town ?? fallbackDress(theme.palette)
}

// Where the floor theme's tower stands. The world layer draws this lot, in every zoom band.
export function townLandmark(plan: TownPlan): TownLot | undefined {
  return plan.lots.find((lot) => lot.zone === 'civic' && lot.isLandmark)
}

interface TownProps {
  town: Town
  floor: FloorGeometry
  // Dresses every lot and plot that no company owns.
  floorTheme: OfficeTheme
  zoneGroups: readonly ThemeZoneGroup[]
  viewMode?: 'city' | 'office'
  focusedFloor?: FloorGeometry
}

type ThemeFinder = (lot: { id: string; zoneId: string | null }) => string

// The theme of whoever owns a lot or a plot of the belt: its company's, else the floor's.
function themeFinder({ town, floorTheme, zoneGroups }: TownProps): ThemeFinder {
  const themeIdByCompany = themeIdsByZone(zoneGroups)
  return (lot) => {
    const companyId = town.owners.get(lot.id) ?? lot.zoneId
    return (companyId === null ? undefined : themeIdByCompany.get(companyId)) ?? floorTheme.id
  }
}

// Says when the town's lots must be placed again: the claim stepped, the detail level thinned
// them, or a lot changed geometry or theme.
function townRevision(props: TownProps, themeIdOf: ThemeFinder): string {
  const { plan } = props.town
  const owned = plan.lots.flatMap((lot) => {
    const themeId = themeIdOf(lot)
    return themeId === props.floorTheme.id ? [] : [`${lot.id}=${themeId}`]
  })
  return JSON.stringify([
    boundsOfZone(plan.claim),
    boundsOfZone(plan.extent),
    plan.lots,
    plan.officeSites,
    props.floorTheme.id,
    owned
  ])
}

// The lot theme lookup and its revision, shared by the buildings and the ambient layer.
function useLotThemes(props: TownProps): { themeIdOf: ThemeFinder; lotsRevision: string } {
  const { town, floorTheme, zoneGroups } = props
  const themeIdOf = useMemo(() => themeFinder(props), [town, floorTheme, zoneGroups])
  const lotsRevision = useMemo(() => townRevision(props, themeIdOf), [themeIdOf])
  return { themeIdOf, lotsRevision }
}

interface DressedLot {
  themeId: string
  placed: PlacedLot
}

let dressedCache: { revision: string; lots: DressedLot[] } | null = null

// Every lot but the landmark's, in its theme. TownView and TownAmbient share one dressing per
// revision: the movers keep to exactly what was drawn, and nothing is dressed twice.
function dressedTown(plan: TownPlan, themeIdOf: ThemeFinder, revision: string): DressedLot[] {
  if (dressedCache?.revision !== revision) {
    const landmark = plan.officeSites ? undefined : townLandmark(plan)
    const lots = plan.lots
      .filter((lot) => lot !== landmark)
      .map((lot) => {
        const themeId = themeIdOf(lot)
        const dress = dressOf(getTheme(themeId))
        return {
          themeId,
          placed: plan.officeSites ? dressCityDistrict(lot, dress) : dressLot(lot, GROUND_Y, dress)
        }
      })
    dressedCache = { revision, lots }
  }
  return dressedCache.lots
}

// The buildings of the zoned town and the planted belt round the campus, each merged once.
// The belt has its own batch so that ordinary growth of the plate never rebuilds the town.
export function TownView(props: TownProps) {
  const { town, floor } = props
  const inspectionFloor = props.focusedFloor ?? floor
  const isInspecting = props.viewMode === 'office'
  const isCity = Boolean(town.plan.officeSites)
  const { themeIdOf, lotsRevision } = useLotThemes(props)
  const beltRevision = useMemo(
    () =>
      JSON.stringify(
        town.green.map((plot) => [plot, isCity ? 0 : lotBase(plot, floor), themeIdOf(plot)])
      ),
    [town.green, floor, themeIdOf, isCity]
  )
  // The same elements while a revision stands: an agent's step re-renders the scene, and React
  // must find nothing to do here.
  const lots = useMemo(() => {
    const placed = dressedTown(town.plan, themeIdOf, lotsRevision).map((each) => each.placed)
    if (isCity)
      return (
        <CitySceneryCutaway
          placed={placed}
          floor={inspectionFloor}
          revision={lotsRevision}
          isInspecting={isInspecting}
        />
      )
    return (
      <BatchedScene revision={lotsRevision} isStatic>
        <LotFill placed={placed} />
      </BatchedScene>
    )
    // `lotsRevision` stands for the plan and for every lot's theme.
  }, [lotsRevision, isCity, inspectionFloor, isInspecting])
  const belt = useMemo(() => {
    const placed = town.green.map((plot) =>
      placeGardenPiece(plot, isCity ? 0 : lotBase(plot, floor), dressOf(getTheme(themeIdOf(plot))))
    )
    return (
      <BatchedScene revision={beltRevision} isStatic>
        <LotFill placed={placed} />
      </BatchedScene>
    )
    // `beltRevision` stands for the plots, where they stand and what dresses them.
  }, [beltRevision])
  return (
    <>
      {lots}
      {belt}
    </>
  )
}

interface TownAmbientProps extends TownProps {
  // The share of its lots a theme may put a mover on; at 0 nothing is mounted.
  share: number
  isReducedMotion: boolean
}

// Each theme's moving things on the lots that theme dresses, and the steam off its chimneys.
// Followed frame by frame, so it is kept apart from the buildings, which are placed once.
export function TownAmbient(props: TownAmbientProps) {
  const { town, floor, share, isReducedMotion } = props
  const { themeIdOf, lotsRevision } = useLotThemes(props)
  return useMemo(() => {
    if (share <= 0) return null
    const byTheme = Map.groupBy(
      dressedTown(town.plan, themeIdOf, lotsRevision),
      (each) => each.themeId
    )
    // A theme with no Ambient part has opted out of moving things, its steam included.
    const moving = [...byTheme].flatMap(([themeId, dressed]) => {
      const theme = getTheme(themeId)
      const { Ambient } = theme.kit.zone
      if (!Ambient) return []
      const placedOf = new Map(dressed.map(({ placed }) => [placed.lot, placed]))
      const lots = thinnedLots([...placedOf.keys()], share, floor)
      const placed = lots.flatMap((lot) => placedOf.get(lot) ?? [])
      return [{ theme, Ambient, lots, placed, stacks: townSteamStacks(placed, dressOf(theme)) }]
    })
    if (moving.length === 0) return null
    return (
      <BatchedScene revision={JSON.stringify([lotsRevision, share, isReducedMotion])}>
        {moving.map(({ theme, Ambient, lots, placed, stacks }) => (
          <Fragment key={theme.id}>
            <Ambient floor={floor} lots={lots} placed={placed} isReducedMotion={isReducedMotion} />
            {stacks.length > 0 && (
              <RisingSteam
                stacks={stacks}
                color={theme.palette.steam}
                isReducedMotion={isReducedMotion}
              />
            )}
          </Fragment>
        ))}
      </BatchedScene>
    )
    // `lotsRevision` stands for the plan and for every lot's theme.
  }, [lotsRevision, floor, share, isReducedMotion])
}
