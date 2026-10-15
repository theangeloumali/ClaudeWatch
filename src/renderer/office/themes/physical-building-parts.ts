import type { FloorGeometry } from '../scene-model'
import { floorElevation, PHYSICAL_STOREY_HEIGHT } from '../scene/all-floor-model'
import { ROOM_DOOR_WIDTH } from '../logic/room-layout'
import { draw, hashOf } from './lot-math'
import { box, cylinder, lit, type PartSpec } from './parts'
import type { OfficeTheme } from './types'

const EXTERIOR_SILHOUETTE_DRAW = 2
const EXTERIOR_PROPORTION_DRAW = 3
const EXTERIOR_HANDEDNESS_DRAW = 4
const EXTERIOR_DETAIL_DRAW = 5
const EXTERIOR_RECIPES = [
  {
    silhouette: 'stepped',
    bayWidth: 5.4,
    sillHeight: 0.75,
    glassHeight: 3.7,
    frameWidth: 0.12,
    facadeDepth: 0.2,
    entranceWidth: 2.8,
    canopyWidth: 4.8,
    canopyDepth: 1.2
  },
  {
    silhouette: 'split-lantern',
    bayWidth: 3.6,
    sillHeight: 1.2,
    glassHeight: 3,
    frameWidth: 0.14,
    facadeDepth: 0.16,
    entranceWidth: 2.4,
    canopyWidth: 4.2,
    canopyDepth: 1.45
  },
  {
    silhouette: 'offset-canopy',
    bayWidth: 6,
    sillHeight: 0.95,
    glassHeight: 3.35,
    frameWidth: 0.12,
    facadeDepth: 0.32,
    entranceWidth: 3.2,
    canopyWidth: 5.2,
    canopyDepth: 2.2
  },
  {
    silhouette: 'service-ribs',
    bayWidth: 2.4,
    sillHeight: 1.65,
    glassHeight: 2.65,
    frameWidth: 0.24,
    facadeDepth: 0.38,
    entranceWidth: 2.2,
    canopyWidth: 3.6,
    canopyDepth: 0.85
  }
] as const

// dry-new: town lot variants do not share an identity across an office's roof, facade and entrance.
export interface BuildingExteriorProfile {
  readonly entranceFloorId: string
  readonly silhouette: (typeof EXTERIOR_RECIPES)[number]['silhouette']
  readonly bayWidth: number
  readonly sillHeight: number
  readonly glassHeight: number
  readonly frameWidth: number
  readonly facadeDepth: number
  readonly entranceWidth: number
  readonly canopyWidth: number
  readonly canopyDepth: number
  readonly canopyShift: number
  readonly crownHeight: number
  readonly handedness: number
  readonly detailShare: number
  readonly frameColor: string
  readonly bandColor: string
  readonly glassColor: string
}

export function buildingExteriorProfile({
  floor,
  theme
}: {
  floor: FloorGeometry
  theme: OfficeTheme
}): BuildingExteriorProfile {
  const seed = hashOf(floor.buildingId ?? floor.floorId)
  const recipe =
    EXTERIOR_RECIPES[Math.floor(draw(seed, EXTERIOR_SILHOUETTE_DRAW) * EXTERIOR_RECIPES.length)] ??
    EXTERIOR_RECIPES[0]
  const proportion = 0.9 + draw(seed, EXTERIOR_PROPORTION_DRAW) * 0.2
  const handedness = draw(seed, EXTERIOR_HANDEDNESS_DRAW) < 0.5 ? -1 : 1
  const detailShare = draw(seed, EXTERIOR_DETAIL_DRAW)
  const narrowSpan = Math.max(1, Math.min(floor.width, floor.depth))
  const aspect = Math.max(0.85, Math.min(1.15, floor.width / Math.max(1, floor.depth)))
  const isTimber = theme.id === 'neo-edo-steam' || theme.id === 'quiet-grove'
  return {
    ...recipe,
    entranceFloorId: floor.floorId,
    bayWidth: recipe.bayWidth * proportion * aspect,
    entranceWidth: Math.max(
      ROOM_DOOR_WIDTH,
      Math.min(recipe.entranceWidth * proportion, narrowSpan * 0.5)
    ),
    canopyWidth: Math.min(recipe.canopyWidth, narrowSpan * 0.85),
    canopyShift: recipe.silhouette === 'offset-canopy' ? handedness * 0.3 : 0,
    crownHeight: proportion * (1 + detailShare * 0.4),
    handedness,
    detailShare,
    frameColor: isTimber
      ? theme.palette.wood
      : theme.id === 'brass-workshop'
        ? theme.palette.copper
        : theme.palette.lacquer,
    bandColor: ['neo-edo-steam', 'samurai-empire', 'violet-court'].includes(theme.id)
      ? theme.palette.paper
      : theme.palette.stone,
    glassColor: ['quiet-grove', 'brass-workshop', 'orbital-garrison'].includes(theme.id)
      ? theme.palette.paper
      : theme.palette.brass
  }
}

// dry-new: decorative town towers cannot cap a real office without adding fictional floors.
export function buildingCrown({
  floor,
  theme,
  profile = buildingExteriorProfile({ floor, theme })
}: {
  floor: FloorGeometry
  theme: OfficeTheme
  profile?: BuildingExteriorProfile
}): PartSpec[] {
  const { palette } = theme
  const roofY = floorElevation(floor) + PHYSICAL_STOREY_HEIGHT
  const at = (x: number, y: number, z: number): [number, number, number] => [
    floor.x + x,
    roofY + y,
    floor.z + z
  ]
  const parts = [
    box(
      at(0, 0.08, 0),
      [floor.width + 0.4, 0.16, floor.depth + 0.4],
      theme.id === 'cyberpunk-city' ? palette.ink : palette.paper
    )
  ]
  for (const side of [-1, 1]) {
    parts.push(
      box(at(0, 0.28, (side * floor.depth) / 2), [floor.width + 0.4, 0.4, 0.3], palette.lacquer)
    )
    parts.push(
      box(at((side * floor.width) / 2, 0.28, 0), [0.3, 0.4, floor.depth + 0.4], palette.lacquer)
    )
  }
  const height = profile.crownHeight
  const offset = profile.handedness * floor.width * 0.12
  if (profile.silhouette === 'stepped') {
    for (let tier = 0; tier < 3; tier++)
      parts.push(
        box(
          at((offset * tier) / 2, 0.3 + (height * tier) / 3, -floor.depth * tier * 0.06),
          [floor.width * (0.82 - tier * 0.2), height / 3, floor.depth * (0.78 - tier * 0.18)],
          palette.stone
        )
      )
  } else if (profile.silhouette === 'split-lantern') {
    for (const side of [-1, 1]) {
      parts.push(
        box(
          at(side * floor.width * 0.24, 0.25 + height / 2, 0),
          [floor.width * 0.26, height, floor.depth * 0.62],
          palette.brass
        )
      )
      parts.push(
        box(
          at(side * floor.width * 0.24, 0.3 + height, 0),
          [floor.width * 0.3, 0.18, floor.depth * 0.68],
          palette.lacquer
        )
      )
      parts.push(
        box(
          at(side * floor.width * 0.24, 0.25 + height / 2, floor.depth * 0.315),
          [floor.width * 0.22, height * 0.4, 0.12],
          palette.paper
        )
      )
    }
  } else if (profile.silhouette === 'offset-canopy') {
    parts.push(
      box(
        at(offset, 0.38, -floor.depth * 0.08),
        [floor.width * 0.66, 0.5, floor.depth * 0.74],
        palette.lacquer
      )
    )
    parts.push(
      box(
        at(-offset * 1.8, 0.35 + height / 2, -floor.depth * 0.26),
        [floor.width * 0.18, height, floor.depth * 0.22],
        palette.stone
      )
    )
  } else {
    parts.push(
      box(
        at(offset, 0.3 + height / 2, 0),
        [floor.width * 0.5, height, floor.depth * 0.64],
        palette.ink
      )
    )
    for (let rib = 0; rib < 5; rib++)
      parts.push(
        box(
          at(offset + (rib - 2) * floor.width * 0.085, 0.36 + height, 0),
          [Math.min(0.4, floor.width * 0.025), 0.28, floor.depth * 0.7],
          palette.brass
        )
      )
  }
  appendThemeCrown(parts, { floor, theme, profile, roofY })
  return parts
}

function appendThemeCrown(
  parts: PartSpec[],
  {
    floor,
    theme,
    profile,
    roofY
  }: {
    floor: FloorGeometry
    theme: OfficeTheme
    profile: BuildingExteriorProfile
    roofY: number
  }
): void {
  const { palette } = theme
  const height = profile.crownHeight + 0.7
  const at = (x: number, y: number, z: number): [number, number, number] => [
    floor.x + x,
    roofY + y,
    floor.z + z
  ]
  const isAuthoredEave = ['neo-edo-steam', 'samurai-empire', 'violet-court'].includes(theme.id)
  if (isAuthoredEave) {
    const tiers =
      profile.silhouette === 'stepped' ? 3 : profile.silhouette === 'service-ribs' ? 1 : 2
    for (let tier = 0; tier < tiers; tier++) {
      const taper = 0.88 - tier * 0.18
      const shift =
        profile.silhouette === 'offset-canopy' ? profile.handedness * floor.width * 0.05 : 0
      parts.push(
        box(
          at(shift, height + tier * 0.26, 0),
          [floor.width * taper + 0.6, 0.16, floor.depth * taper + 0.6],
          palette.lacquer
        )
      )
    }
    parts.push(
      box(
        at(0, height + tiers * 0.26, 0),
        [0.2, 0.3, floor.depth * (0.25 + profile.detailShare * 0.2)],
        palette.gold
      )
    )
  } else if (theme.id === 'quiet-grove') {
    const beds = profile.silhouette === 'split-lantern' ? 2 : 3
    for (let bed = 0; bed < beds; bed++) {
      const x = (bed - (beds - 1) / 2) * floor.width * 0.24
      parts.push(
        box(
          at(x, height, floor.depth * 0.18),
          [floor.width * 0.18, 0.28, floor.depth * 0.46],
          palette.wood
        )
      )
      parts.push(
        box(
          at(x, height + 0.2, floor.depth * 0.18),
          [floor.width * 0.17, 0.2, floor.depth * 0.44],
          palette.blossom
        )
      )
    }
  } else if (theme.id === 'brass-workshop') {
    for (const side of [-1, 1])
      parts.push(
        cylinder(
          at(side * floor.width * 0.28, height / 2, -floor.depth * 0.24),
          [Math.min(1, floor.width * 0.08), height, Math.min(1, floor.depth * 0.08)],
          palette.copper
        )
      )
  } else if (theme.id === 'orbital-garrison') {
    for (const side of [-1, 1])
      parts.push(
        box(
          at(side * floor.width * 0.3, 0.5, floor.depth * 0.22),
          [floor.width * 0.16, 0.8, floor.depth * 0.24],
          palette.paper
        )
      )
  } else if (theme.id === 'cyberpunk-city') {
    parts.push(
      lit(
        box(
          at(profile.handedness * floor.width * 0.1, 0.42, -floor.depth / 2 + 0.3),
          [floor.width * (0.45 + profile.detailShare * 0.25), 0.12, 0.14],
          palette.glow
        )
      )
    )
    parts.push(
      box(
        at(-profile.handedness * floor.width * 0.32, 0.5, floor.depth * 0.12),
        [floor.width * 0.1, 0.8, floor.depth * 0.42],
        palette.lacquer
      )
    )
  }
}

export function buildingEntrance({
  theme,
  profile
}: {
  theme: OfficeTheme
  profile: BuildingExteriorProfile
}): { facade: PartSpec[]; roof: PartSpec[] } {
  const { palette } = theme
  const halfDoor = profile.entranceWidth / 2
  const jambWidth = profile.silhouette === 'service-ribs' ? 0.32 : 0.18
  const facade = [-1, 1].map((side) =>
    box([side * (halfDoor + jambWidth / 2), 1.65, 0.16], [jambWidth, 3.3, 0.32], profile.frameColor)
  )
  facade.push(
    box([0, 3.45, 0.16], [profile.entranceWidth + jambWidth * 2, 0.3, 0.32], profile.frameColor)
  )
  facade.push(lit(box([0, 3.65, 0.35], [profile.entranceWidth * 0.7, 0.12, 0.08], palette.glow)))
  if (profile.silhouette === 'offset-canopy') {
    facade.push(
      box([profile.handedness * (halfDoor + 0.55), 2.05, 0.2], [0.5, 2.5, 0.22], palette.gold)
    )
  } else if (profile.silhouette === 'split-lantern') {
    for (const side of [-1, 1])
      facade.push(box([side * (halfDoor + 0.4), 2.4, 0.22], [0.28, 1.8, 0.24], profile.glassColor))
  } else if (profile.silhouette === 'stepped') {
    facade.push(
      box(
        [profile.handedness * 0.2, 4.1, 0.22],
        [profile.canopyWidth * 0.8, 0.3, 0.24],
        palette.gold
      )
    )
  } else {
    for (let rib = 0; rib < 3; rib++)
      facade.push(
        box(
          [profile.handedness * (halfDoor + 0.55), 1.6 + rib * 0.6, 0.2],
          [0.65, 0.18, 0.24],
          palette.copper
        )
      )
  }
  // Cantilevers have no doorway posts; even the authored eaves reach only 2.42 m outward.
  const roof = [
    box(
      [profile.canopyShift, 3.95, profile.canopyDepth / 2 + 0.12],
      [profile.canopyWidth, 0.24, profile.canopyDepth],
      profile.frameColor
    )
  ]
  if (['neo-edo-steam', 'samurai-empire', 'violet-court'].includes(theme.id))
    roof.push(
      box(
        [profile.canopyShift, 4.15, profile.canopyDepth / 2 + 0.12],
        [profile.canopyWidth + 0.2, 0.14, profile.canopyDepth + 0.2],
        palette.lacquer
      )
    )
  return { facade, roof }
}
