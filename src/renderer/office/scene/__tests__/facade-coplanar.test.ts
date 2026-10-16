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
import type { PartSpec } from '../../themes/parts'
import { floorElevation, PHYSICAL_STOREY_HEIGHT } from '../all-floor-model'
import { windowParts } from '../building-window-parts'
import { perimeterStructureParts, STRUCTURAL_SIDES } from '../operational-parts'

// flicker-1: boxes whose faces share a plane, point the same way and overlap tie in the depth
// buffer; when their colours differ the tie crawls as the camera moves.
const PLANE_EPSILON_M = 1e-6
const RECIPES = ['stepped', 'split-lantern', 'offset-canopy', 'service-ribs'] as const
type Triple = [number, number, number]

interface WorldBox {
  label: string
  color: string
  min: Triple
  max: Triple
}

const corporate = getTheme('corporate-city')

function boxOf(label: string, color: string, centre: Triple, size: Triple): WorldBox {
  return {
    label,
    color,
    min: [centre[0] - size[0] / 2, centre[1] - size[1] / 2, centre[2] - size[2] / 2],
    max: [centre[0] + size[0] / 2, centre[1] + size[1] / 2, centre[2] + size[2] / 2]
  }
}

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

function partBoxes(prefix: string, parts: readonly PartSpec[], origin: Triple): WorldBox[] {
  return parts.flatMap((part, index) =>
    part.shape === 'box' && !part.rotation
      ? [
          boxOf(
            `${prefix}:h${part.size[1].toFixed(2)}#${index}`,
            part.color,
            [origin[0] + part.at[0], origin[1] + part.at[1], origin[2] + part.at[2]],
            part.size
          )
        ]
      : []
  )
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

function overlap(a: WorldBox, b: WorldBox, axis: number): number {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis])
}

// A shared face rectangle is hidden when a third box covers it from the facing side.
function isBuried(
  boxes: readonly WorldBox[],
  pair: readonly WorldBox[],
  axis: number,
  side: 'min' | 'max',
  plane: number,
  rect: { min: Triple; max: Triple }
): boolean {
  const others = [0, 1, 2].filter((other) => other !== axis)
  return boxes.some((cover) => {
    if (pair.includes(cover)) return false
    const covers = others.every(
      (other) =>
        cover.min[other] <= rect.min[other] + PLANE_EPSILON_M &&
        cover.max[other] >= rect.max[other] - PLANE_EPSILON_M
    )
    return side === 'max'
      ? covers &&
          cover.min[axis] <= plane + PLANE_EPSILON_M &&
          cover.max[axis] > plane + PLANE_EPSILON_M
      : covers &&
          cover.max[axis] >= plane - PLANE_EPSILON_M &&
          cover.min[axis] < plane - PLANE_EPSILON_M
  })
}

// Same plane, same outward normal, positive shared area, different colours, and visible. The
// camera never looks up (MAX_POLAR is 70°), so bottom faces are skipped.
function coplanarConflicts(boxes: readonly WorldBox[]): string[] {
  const conflicts: string[] = []
  for (let i = 0; i < boxes.length; i += 1)
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.color === b.color) continue
      for (let axis = 0; axis < 3; axis += 1) {
        const others = [0, 1, 2].filter((other) => other !== axis)
        if (!others.every((other) => overlap(a, b, other) > PLANE_EPSILON_M)) continue
        for (const side of ['min', 'max'] as const) {
          if (axis === 1 && side === 'min') continue
          const plane = a[side][axis]
          if (Math.abs(plane - b[side][axis]) >= PLANE_EPSILON_M) continue
          const rect = {
            min: [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])) as Triple,
            max: [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) as Triple
          }
          if (isBuried(boxes, [a, b], axis, side, plane, rect)) continue
          conflicts.push(`${a.label} ~ ${b.label} @ ${side}-${'xyz'[axis]}=${plane.toFixed(3)}`)
        }
      }
    }
  return conflicts
}

function kindsOf(conflicts: readonly string[]): string {
  const kinds = new Set(
    conflicts.map((line) =>
      line
        .replace(/#\d+/g, '')
        .replace(/:(north|south|east|west)/g, '')
        .replace(/=.*$/, '')
    )
  )
  return [...kinds].sort().join('\n')
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
