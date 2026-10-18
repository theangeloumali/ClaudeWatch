import { describe, expect, it } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import type { FloorGeometry } from '../../scene-model'
import {
  buildingCrown,
  buildingEntrance,
  buildingExteriorProfile,
  type BuildingExteriorProfile
} from '../../themes/physical-building-parts'
import { getTheme, listThemes } from '../../themes/registry'
import { floorElevation, PHYSICAL_STOREY_HEIGHT } from '../all-floor-model'
import { windowParts } from '../building-window-parts'
import { perimeterStructureParts, STRUCTURAL_SIDES } from '../operational-parts'
import {
  boxOf,
  coplanarConflicts,
  kindsOf,
  partBoxes,
  PLANE_EPSILON_M,
  type Triple,
  type WorldBox
} from './coplanar.test-utils'

const RECIPES = ['stepped', 'split-lantern', 'offset-canopy', 'service-ribs'] as const
const corporate = getTheme('corporate-city')

function floorWithSilhouette(
  silhouette: string,
  elevation = 0
): { floor: FloorGeometry; profile: BuildingExteriorProfile } {
  for (let seed = 0; seed < 500; seed += 1) {
    const floor = {
      ...makeFloor({ floorId: `f-${seed}`, x: -35.8, z: -96, width: 42.6, depth: 38 }),
      elevation
    }
    const profile = buildingExteriorProfile({ floor, theme: corporate })
    if (profile.silhouette === silhouette) return { floor, profile }
  }
  throw new Error(`no seed draws the ${silhouette} recipe`)
}

// The boxes PhysicalBuildingShell draws for one storey: BuildingWindows and OperationalStructure.
function facadeBoxes(floor: FloorGeometry, profile: BuildingExteriorProfile): WorldBox[] {
  const colorOf = { band: profile.bandColor, frame: profile.frameColor, glass: profile.glassColor }
  const windows = windowParts(floor, undefined, profile).map((part, index) =>
    boxOf(
      `window:${part.side}:${part.kind}:h${part.size[1].toFixed(2)}#${index}`,
      colorOf[part.kind],
      part.position,
      part.size
    )
  )
  const origin: Triple = [floor.x, floorElevation(floor), floor.z]
  const structure = STRUCTURAL_SIDES.flatMap((side) =>
    partBoxes(
      `structure:${side}`,
      perimeterStructureParts({ floor, theme: corporate, profile, side, isOverview: false }),
      origin
    )
  )
  // slabFasciaParts is left out: it hangs below the plate, under the ground or the storey below.
  return [...windows, ...structure]
}

describe('facade, crown and entrance layers never share a visible face plane (flicker-1)', () => {
  it.each(RECIPES)('%s facade: no coplanar faces of different colours', (silhouette) => {
    const { floor, profile } = floorWithSilhouette(silhouette)
    const conflicts = coplanarConflicts(facadeBoxes(floor, profile))
    expect(conflicts.length, `tied face kinds:\n${kindsOf(conflicts)}`).toBe(0)
  })

  it.each(RECIPES)('%s crown and entrance: no ties in any theme', (silhouette) => {
    const { floor } = floorWithSilhouette(silhouette)
    const ties = listThemes().flatMap((theme) => {
      const profile = buildingExteriorProfile({ floor, theme })
      expect(profile.silhouette).toBe(silhouette)
      const crown = coplanarConflicts(
        partBoxes('crown', buildingCrown({ floor, theme, profile }), [0, 0, 0])
      )
      const entrance = buildingEntrance({ theme, profile })
      const doorway = coplanarConflicts(
        partBoxes('entrance', [...entrance.facade, ...entrance.roof], [0, 0, 0])
      )
      return [...crown, ...doorway].map((line) => `${theme.id}: ${line}`)
    })
    expect(ties.length, `tied face kinds:\n${kindsOf(ties)}`).toBe(0)
  })

  it.each(RECIPES)('%s: no vertical gap between consecutive storeys’ bands', (silhouette) => {
    const lower = floorWithSilhouette(silhouette, 0)
    const upper = floorWithSilhouette(silhouette, PHYSICAL_STOREY_HEIGHT)
    const northBands = ({ floor, profile }: typeof lower) =>
      windowParts(floor, undefined, profile).filter(
        (part) => part.kind === 'band' && part.side === 'north'
      )
    const lowerTop = Math.max(
      ...northBands(lower).map((part) => part.position[1] + part.size[1] / 2)
    )
    const upperBottom = Math.min(
      ...northBands(upper).map((part) => part.position[1] - part.size[1] / 2)
    )
    expect(Math.abs(upperBottom - lowerTop)).toBeLessThan(PLANE_EPSILON_M)
  })
})
