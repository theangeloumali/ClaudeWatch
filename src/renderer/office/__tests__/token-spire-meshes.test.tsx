import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { crownTopOf } from '../logic/building-place'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M, SPIRE_MAX_STAGES, spireHeight } from '../logic/token-spires'
import { floorElevation, PHYSICAL_STOREY_HEIGHT } from '../scene/all-floor-model'
import { coplanarConflicts, partBoxes } from '../scene/__tests__/coplanar.test-utils'
import type { FloorGeometry } from '../scene-model'
import {
  buildingCrown,
  buildingExteriorProfile,
  crownAnchor
} from '../themes/physical-building-parts'
import { box, Parts, type PartSpec } from '../themes/parts'
import { listThemes } from '../themes/registry'
import { mergedDraws } from '../themes/scene.test-utils'
import { moduleFrames, spireModules } from '../themes/spire-parts'
import { makeFloor } from './fixtures'

const SILHOUETTES = ['stepped', 'split-lantern', 'offset-canopy', 'service-ribs'] as const

// One building per crown recipe, so every silhouette's top is checked.
function towerWith(silhouette: string, storeys: number): FloorGeometry[] {
  const theme = listThemes()[0]
  for (let seed = 0; seed < 500; seed += 1) {
    const ground = makeFloor({ floorId: `t${seed}-0`, buildingId: `b${seed}`, x: 6, z: -4 })
    if (buildingExteriorProfile({ floor: ground, theme }).silhouette !== silhouette) continue
    return Array.from({ length: storeys }, (_, level) => ({
      ...ground,
      floorId: `t${seed}-${level}`,
      elevation: level * PHYSICAL_STOREY_HEIGHT
    }))
  }
  throw new Error(`no seed draws the ${silhouette} recipe`)
}

// The spire as TokenSpire places it: whole modules below, the top one part-grown, the first
// reaching down to the crown deck.
function placedSpire(floors: readonly FloorGeometry[], theme = listThemes()[0], heightM: number) {
  const top = floors.at(-1) ?? floors[0]
  const roof = crownTopOf(floors, theme)
  if (!roof) throw new Error('a tower has a roof')
  const baseY = roof.y + SPIRE_BASE_GAP_M
  const deck = crownAnchor(top)
  const frames = moduleFrames(heightM, baseY - deck.y)
  const modules = spireModules(theme).flatMap((part, stage) => {
    const frame = frames[stage]
    return frame
      ? [
          box(
            [roof.x, baseY + frame.y, roof.z],
            [part.size[0], frame.height, part.size[2]],
            part.color
          )
        ]
      : []
  })
  return { modules, deck, baseY }
}

describe('token spire meshes', () => {
  it.each(SILHOUETTES)('the spire base is not coplanar with the crown top (%s)', (silhouette) => {
    for (const theme of listThemes())
      for (const storeys of [1, 3]) {
        const floors = towerWith(silhouette, storeys)
        const top = floors.at(-1) ?? floors[0]
        const crown = buildingCrown({
          floor: top,
          theme,
          profile: buildingExteriorProfile({ floor: floors[0], theme })
        })
        for (let stage = 1; stage <= SPIRE_MAX_STAGES; stage += 1) {
          for (const share of [0.01, 0.5, 1]) {
            const heightM =
              spireHeight(stage - 1) + share * (spireHeight(stage) - spireHeight(stage - 1))
            const { modules } = placedSpire(floors, theme, heightM)
            const boxes = [
              ...partBoxes(`${theme.id}:crown`, crown, [0, 0, 0]),
              ...partBoxes(`${theme.id}:spire${stage}`, modules, [0, 0, 0])
            ]
            expect(coplanarConflicts(boxes)).toEqual([])
          }
        }
      }
  })

  it('the first module stands on the crown deck, so no spire floats over an open roof', () => {
    for (const silhouette of SILHOUETTES)
      for (let stage = 1; stage <= SPIRE_MAX_STAGES; stage += 1) {
        const floors = towerWith(silhouette, 2)
        const { modules, deck, baseY } = placedSpire(floors, undefined, spireHeight(stage))
        expect(modules).toHaveLength(stage)
        const lowest = Math.min(...modules.map((part) => part.at[1] - part.size[1] / 2))
        const highest = Math.max(...modules.map((part) => part.at[1] + part.size[1] / 2))
        expect(lowest).toBeCloseTo(deck.y)
        expect(deck.y).toBeGreaterThan(floorElevation(floors[1]) + PHYSICAL_STOREY_HEIGHT)
        expect(highest).toBeCloseTo(baseY + spireHeight(stage))
      }
    expect(placedSpire(towerWith('stepped', 1), undefined, 0).modules).toEqual([])
  })

  it('a spire shares its batch with the crown', () => {
    for (const theme of listThemes()) {
      const floors = towerWith('split-lantern', 3)
      const crown = buildingCrown({ floor: floors[2], theme })
      const { modules } = placedSpire(floors, theme, SPIRE_MAX_M)
      const crownOnly = mergedDraws(<Parts parts={crown} />)
      const withSpire = mergedDraws(
        <>
          <Parts parts={crown} />
          <group>
            <Parts parts={modules} />
          </group>
        </>
      )
      expect(withSpire.draws).toBe(crownOnly.draws)
    }
  })

  it('spire modules stack to the tallest spire, one box per stage, colours from the theme', () => {
    for (const theme of listThemes()) {
      const modules = spireModules(theme)
      expect(modules).toHaveLength(SPIRE_MAX_STAGES)
      expect(modules.every((part) => part.shape === 'box' && !part.glow)).toBe(true)
      const top = Math.max(...modules.map((part) => part.at[1] + part.size[1] / 2))
      expect(top).toBeCloseTo(SPIRE_MAX_M)
      const palette: readonly string[] = Object.values(theme.palette)
      expect(modules.every((part) => palette.includes(part.color))).toBe(true)
    }
  })
})

describe('buildingCrown', () => {
  // Spires and signs read the crown; adding its anchor changed none of its parts.
  it('keeps its parts byte-identical while exposing the sign anchor', () => {
    const crowns: PartSpec[][] = []
    for (const theme of listThemes())
      for (const silhouette of SILHOUETTES)
        for (const storeys of [1, 2]) {
          const floors = towerWith(silhouette, storeys)
          crowns.push(buildingCrown({ floor: floors[storeys - 1], theme }))
        }
    const digest = createHash('sha256').update(JSON.stringify(crowns)).digest('hex')
    expect(digest).toBe('b71d7d2fe9f0405a609e05cdd2cb296ff4efa0a99d291439f69b6c1ba1925455')
  })

  it('anchors a sign on the crown deck at the roof centre', () => {
    const floor = { ...makeFloor({ floorId: 'f', x: 3, z: -7 }), elevation: 11 }
    const anchor = crownAnchor(floor)
    expect(anchor.x).toBe(3)
    expect(anchor.z).toBe(-7)
    const slab = buildingCrown({ floor, theme: listThemes()[0] })[0]
    expect(anchor.y).toBeCloseTo(slab.at[1] + slab.size[1] / 2)
  })
})
