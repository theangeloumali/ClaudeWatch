import type { TownLot } from '../town/town-lots'
import { dressLot, type TownDress, type ZonePlot } from '../town/town-dress'
import { fitTownParts } from './edo-town-legacy'
import type { PlacedLot } from './lot-kit'
import { draw } from './lot-math'
import type { PartSpec } from './parts'

const PARCEL_MARGIN_METRES = 0.3
const INTERNAL_ACCESS_METRES = 2
const FRONT_GARDEN_DEPTH_METRES = 1.2
const LONG_PARCEL_RATIO = 1.8
const MIN_PAIRED_LENGTH_METRES = 16
const MIN_STRUCTURAL_SHARE = 0.22

// The shared parcel remains the simulation obstacle; cells only fit architecture inside it.
export function dressCityDistrict(lot: TownLot, dress: TownDress): PlacedLot {
  if (lot.isFarRing) return dressLot(lot, 0, dress)
  return dressCityParcel(lot, dress)
}

function dressCityParcel(lot: TownLot, dress: TownDress): PlacedLot {
  const isSideways = lot.facing === 'east' || lot.facing === 'west'
  const frontage = isSideways ? lot.depth : lot.width
  const reach = isSideways ? lot.width : lot.depth
  const gardenDepth = frontage >= 8 && reach >= 8 ? FRONT_GARDEN_DEPTH_METRES : 0
  const width = frontage - PARCEL_MARGIN_METRES * 2
  const depth = reach - PARCEL_MARGIN_METRES * 2 - gardenDepth
  const isFrontageRow = width >= depth * LONG_PARCEL_RATIO
  const hasPair =
    Math.max(width, depth) >= MIN_PAIRED_LENGTH_METRES &&
    Math.max(width, depth) >= Math.min(width, depth) * LONG_PARCEL_RATIO
  const count = hasPair ? 2 : 1
  const cellWidth = hasPair && isFrontageRow ? (width - INTERNAL_ACCESS_METRES) / count : width
  const cellDepth = hasPair && !isFrontageRow ? (depth - INTERNAL_ACCESS_METRES) / count : depth
  const cells = Array.from({ length: count }, (_, index) =>
    dressCityCell({
      lot: {
        ...lot,
        zone: lot.zone === 'park' ? 'residential' : lot.zone,
        kind: 'building',
        width: isSideways ? cellDepth : cellWidth,
        depth: isSideways ? cellWidth : cellDepth,
        seed: (lot.seed + index) >>> 0
      },
      dress
    })
  )
  const parts = cells.flatMap((cell, index) => {
    const offset =
      (index - (count - 1) / 2) * ((isFrontageRow ? cellWidth : cellDepth) + INTERNAL_ACCESS_METRES)
    return cell.parts.map((part) => ({
      ...part,
      at: [
        part.at[0] + (isFrontageRow ? offset : 0),
        part.at[1],
        part.at[2] + (isFrontageRow ? 0 : offset) - gardenDepth / 2
      ] satisfies PartSpec['at']
    }))
  })
  if (gardenDepth > 0) {
    const props = dress.props.filter((prop) => prop.zones.includes('park'))
    const prop = props[lot.seed % Math.max(1, props.length)]
    if (prop)
      parts.push(
        ...fitTownParts(prop.parts, {
          width: Math.min(2, width * 0.2),
          depth: gardenDepth * 0.8,
          height: 2.4,
          seed: lot.seed,
          accent: dress.looks.park.accent
        }).map((part) => ({
          ...part,
          at: [
            part.at[0] - width * 0.35,
            part.at[1],
            part.at[2] + reach / 2 - PARCEL_MARGIN_METRES - gardenDepth / 2
          ] satisfies PartSpec['at']
        }))
      )
  }
  return { ...cells[0], lot, parts }
}

function dressCityCell({ lot, dress }: { lot: TownLot; dress: TownDress }): PlacedLot {
  const isSideways = lot.facing === 'east' || lot.facing === 'west'
  const pool = dress.designs.filter((design) => design.zones.includes(lot.zone))
  const homes = dress.designs.filter((design) => design.zones.includes('residential'))
  const prepare = (design: TownDress['designs'][number]) => {
    const height = Math.min(
      lot.maxHeight,
      design.height.min +
        (design.height.max - design.height.min) * (0.65 + draw(lot.seed, 5) * 0.35)
    )
    const plot: ZonePlot = {
      width: isSideways ? lot.depth : lot.width,
      depth: isSideways ? lot.width : lot.depth,
      height,
      seed: lot.seed,
      accent: dress.looks[lot.zone].accent
    }
    const parts = fitCityArchitecture(design.build(plot), plot)
    const mass = structuralParts(parts, plot).reduce(
      (area, part) => area + part.size[0] * part.size[2],
      0
    )
    return {
      design: {
        ...design,
        zones: [lot.zone],
        height: { min: height, max: height },
        build: () => parts
      },
      hasMass: mass >= plot.width * plot.depth * MIN_STRUCTURAL_SHARE
    }
  }
  const candidates = (pool.length ? pool : homes).map(prepare)
  const substantial = candidates.filter((candidate) => candidate.hasMass)
  const fallback = substantial.length
    ? substantial
    : homes.map(prepare).filter((candidate) => candidate.hasMass)
  const designs = (fallback.length ? fallback : candidates).map((candidate) => candidate.design)
  return dressLot(lot, 0, { ...dress, designs })
}

// dry-new: silhouette containment alone leaves oversized pads and undersized building bodies.
function fitCityArchitecture(parts: readonly PartSpec[], plot: ZonePlot): PartSpec[] {
  const architecture = parts.filter(
    (part) =>
      !(
        part.at[1] - part.size[1] / 2 <= plot.height * 0.02 &&
        part.size[1] <= plot.height * 0.1 &&
        part.size[0] >= plot.width * 0.6 &&
        part.size[2] >= plot.depth * 0.6
      )
  )
  const bodies = structuralParts(architecture, plot)
  if (!bodies.length) return fitTownParts(architecture, plot)
  const width =
    Math.max(...bodies.map((part) => part.at[0] + part.size[0] / 2)) -
    Math.min(...bodies.map((part) => part.at[0] - part.size[0] / 2))
  const depth =
    Math.max(...bodies.map((part) => part.at[2] + part.size[2] / 2)) -
    Math.min(...bodies.map((part) => part.at[2] - part.size[2] / 2))
  const acrossScale = Math.min(1.25, (plot.width * 0.92) / width)
  const reachScale = Math.min(1.55, (plot.depth * 0.88) / depth)
  // Final containment includes rotated eaves, chimneys and other decorative overhangs.
  return fitTownParts(
    architecture.map((part) => ({
      ...part,
      at: [part.at[0] * acrossScale, part.at[1], part.at[2] * reachScale],
      size: [part.size[0] * acrossScale, part.size[1], part.size[2] * reachScale]
    })),
    plot
  )
}

function structuralParts(parts: readonly PartSpec[], plot: ZonePlot): readonly PartSpec[] {
  return parts.filter(
    (part) =>
      (part.shape === 'box' || part.shape === 'cylinder') &&
      !part.glow &&
      !part.rotation?.[0] &&
      !part.rotation?.[2] &&
      part.size[1] >= 1 &&
      part.size[0] >= plot.width * 0.12 &&
      part.size[2] >= plot.depth * 0.12 &&
      part.at[1] - part.size[1] / 2 <= plot.height * 0.35
  )
}
