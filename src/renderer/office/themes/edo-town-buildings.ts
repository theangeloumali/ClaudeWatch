import { FACADE_LAYER_STEP_M } from '../scene/building-window-parts'
import type { ZoneDesign, ZonePlot } from '../town/town-dress'
import { EDO_BUILDINGS } from './EdoSurroundings'
import { legacyBuilding, legacyTownDesign, townBuilding } from './edo-town-legacy'
import { EDO } from './palettes'
import { box, cone, cylinder, lit, sphere, type PartSpec } from './parts'

const roofOf = (part: PartSpec): boolean =>
  (part.color === EDO.ink && part.shape === 'box' && part.size[1] <= 0.4 && part.at[1] > 0.8) ||
  (part.color === EDO.copper && part.shape === 'cone')

const old = (name: string) => legacyBuilding(EDO_BUILDINGS, name)

function keep(plot: ZonePlot): PartSpec[] {
  const plinth = plot.height * 0.14
  const tower = old('pagoda').parts({
    ...plot,
    width: plot.width * 0.8,
    depth: plot.depth * 0.8,
    height: plot.height * 0.8
  })
  return [
    box([0, plinth / 2, 0], [plot.width * 0.94, plinth, plot.depth * 0.9], EDO.stone),
    box([0, plinth * 0.44, plot.depth * 0.46], [plot.width * 0.18, plinth * 0.88, 0.06], EDO.ink),
    ...tower.map((part) => ({
      ...part,
      at: [part.at[0], part.at[1] + plinth, part.at[2]] satisfies [number, number, number],
      color: roofOf(part) ? plot.accent : part.color
    })),
    ...[-1, 1].map((side) =>
      box(
        [side * plot.width * 0.34, plinth * 0.9, plot.depth * 0.34],
        [plot.width * 0.16, plinth * 1.8, plot.depth * 0.18],
        EDO.paper
      )
    ),
    ...[-1, 1].map((side) =>
      box(
        [side * plot.width * 0.34, plinth * 1.84, plot.depth * 0.34],
        [plot.width * 0.2, plinth * 0.08, plot.depth * 0.22],
        plot.accent
      )
    )
  ]
}

function hall(plot: ZonePlot): PartSpec[] {
  const width = plot.width * 0.82
  const depth = plot.depth * 0.72
  const body = plot.height * 0.78
  return [
    box([0, body / 2, -plot.depth * 0.06], [width, body, depth], EDO.wood),
    box(
      [0, body * 0.58, depth / 2 - plot.depth * 0.06 + 0.02],
      [width * 0.72, body * 0.32, 0.05],
      EDO.paper
    ),
    box(
      [0, body * 0.3, depth / 2 - plot.depth * 0.06 + 0.055],
      [width * 0.18, body * 0.6, 0.04],
      EDO.lacquer
    ),
    box(
      [0, body + plot.height * 0.04, -plot.depth * 0.06],
      [plot.width * 0.96, plot.height * 0.08, plot.depth * 0.9],
      plot.accent
    ),
    box(
      [0, body + plot.height * 0.14, -plot.depth * 0.06],
      [width * 0.5, plot.height * 0.12, depth],
      plot.accent
    )
  ]
}

function shrineGateHall(plot: ZonePlot): PartSpec[] {
  return [
    ...hall({ ...plot, depth: plot.depth * 0.68 }),
    ...[-1, 1].map((side) =>
      box(
        [side * plot.width * 0.23, plot.height * 0.3, plot.depth * 0.34],
        [0.22, plot.height * 0.6, 0.22],
        EDO.lacquer
      )
    ),
    box(
      [0, plot.height * 0.62, plot.depth * 0.34],
      [plot.width * 0.7, plot.height * 0.08, 0.3],
      plot.accent
    )
  ]
}

function merchantStalls(plot: ZonePlot): PartSpec[] {
  const bay = plot.width / 3
  return [-1, 0, 1].flatMap((step) => [
    box(
      [step * bay, plot.height * 0.22, 0],
      [bay * 0.8, plot.height * 0.44, plot.depth * 0.6],
      EDO.wood
    ),
    ...[-1, 1].map((side) =>
      box(
        [step * bay + side * bay * 0.34, plot.height * 0.4, plot.depth * 0.32],
        [0.12, plot.height * 0.8, 0.12],
        EDO.lacquer
      )
    ),
    box(
      [step * bay, plot.height * 0.84, 0],
      [bay * 0.94, plot.height * 0.12, plot.depth * 0.9],
      plot.accent
    ),
    lit(sphere([step * bay, plot.height * 0.65, plot.depth * 0.37], [0.25, 0.35, 0.25], EDO.glow))
  ])
}

function rowHouse(plot: ZonePlot): PartSpec[] {
  const half = plot.width / 2
  return [-1, 1].flatMap((side) =>
    hall({ ...plot, width: half * 0.96 }).map((part) => ({
      ...part,
      at: [part.at[0] + (side * half) / 2, part.at[1], part.at[2]]
    }))
  )
}

function cottage(plot: ZonePlot): PartSpec[] {
  return [
    ...hall({ ...plot, height: plot.height * 0.76 }),
    ...[0, 1, 2].map((tier) =>
      box(
        [0, plot.height * (0.65 + tier * 0.1), -plot.depth * 0.06],
        [plot.width * (0.8 - tier * 0.23), plot.height * 0.1, plot.depth * 0.8],
        plot.accent
      )
    )
  ]
}

function lanternTheatre(plot: ZonePlot): PartSpec[] {
  const body = hall({ ...plot, height: plot.height * 0.76 })
  return [
    ...body,
    box(
      [0, plot.height * 0.54, plot.depth * 0.38],
      [plot.width * 0.55, plot.height * 0.22, 0.08],
      EDO.lacquer
    ),
    box(
      [0, plot.height * 0.8, 0],
      [plot.width * 0.62, plot.height * 0.12, plot.depth * 0.64],
      plot.accent
    ),
    ...[-1, 0, 1].map((step) =>
      lit(
        sphere(
          [step * plot.width * 0.24, plot.height * 0.45, plot.depth * 0.42],
          [0.4, 0.6, 0.4],
          EDO.glow
        )
      )
    ),
    cone([0, plot.height * 0.93, 0], [0.3, plot.height * 0.14, 0.3], EDO.gold)
  ]
}

// The foundry's ink stack, which stands above the brass ring round it.
const chimney = (parts: readonly PartSpec[]): PartSpec[] => parts.slice(-3, -2)

function foundry(plot: ZonePlot): PartSpec[] {
  return [
    ...hall({ ...plot, height: plot.height * 0.54 }),
    cylinder(
      [plot.width * 0.28, plot.height * 0.46, -plot.depth * 0.25],
      [0.7, plot.height * 0.92, 0.7],
      EDO.ink
    ),
    cylinder(
      [plot.width * 0.28, plot.height * 0.9, -plot.depth * 0.25],
      [0.9, 0.15, 0.9],
      EDO.brass
    ),
    lit(
      box(
        [-plot.width * 0.2, plot.height * 0.2, plot.depth * 0.32],
        [0.6, plot.height * 0.17, 0.08],
        EDO.glow
      )
    )
  ]
}

function smithy(plot: ZonePlot): PartSpec[] {
  return [
    ...merchantStalls({ ...plot, height: plot.height * 0.8 }),
    // Its depth scales with the lot, so its front never meets the stall front at 0.3 of it.
    box(
      [0, plot.height * 0.24, plot.depth * 0.26],
      [0.75, plot.height * 0.14, plot.depth * 0.1],
      EDO.ink
    ),
    cylinder(
      [-plot.width * 0.28, plot.height * 0.42, -plot.depth * 0.26],
      [0.4, plot.height * 0.84, 0.4],
      EDO.brass
    )
  ]
}

function pondBridge(plot: ZonePlot): PartSpec[] {
  return [
    box([0, 0.04, 0], [plot.width * 0.9, 0.08, plot.depth * 0.8], EDO.copper),
    box(
      [0, plot.height * 0.12, 0],
      [plot.width * 0.25, plot.height * 0.08, plot.depth * 0.9],
      EDO.wood
    ),
    ...[-1, 1].flatMap((side) => [
      box(
        [side * plot.width * 0.14, plot.height * 0.23, 0],
        [0.12 - 2 * FACADE_LAYER_STEP_M, plot.height * 0.1, plot.depth * 0.9],
        plot.accent
      ),
      ...[-1, 1].map((end) =>
        box(
          [side * plot.width * 0.14, plot.height * 0.12, end * plot.depth * 0.36],
          [0.12, plot.height * 0.24, 0.12],
          EDO.lacquer
        )
      )
    ])
  ]
}

function pineStand(plot: ZonePlot): PartSpec[] {
  return [-1, 0, 1].flatMap((step) => [
    box(
      [step * plot.width * 0.28, plot.height * 0.28, step === 0 ? -plot.depth * 0.22 : 0],
      [0.25, plot.height * 0.56, 0.25],
      EDO.wood
    ),
    ...[0, 1, 2].map((tier) =>
      cone(
        [
          step * plot.width * 0.28,
          plot.height * (0.45 + tier * 0.18),
          step === 0 ? -plot.depth * 0.22 : 0
        ],
        [plot.width * (0.24 - tier * 0.05), plot.height * 0.32, plot.depth * (0.3 - tier * 0.06)],
        plot.accent
      )
    )
  ])
}

export const EDO_TOWN_DESIGNS: readonly ZoneDesign[] = [
  legacyTownDesign({ source: old('pagoda'), zones: ['civic'], max: 20, roof: roofOf }),
  legacyTownDesign({ source: old('watchtower'), zones: ['civic'], max: 24, roof: roofOf }),
  townBuilding('shrine gate hall', 'civic', 7, shrineGateHall),
  townBuilding('the keep', 'civic', 24, keep, 6, true),
  legacyTownDesign({ source: old('tea stall'), zones: ['market'], max: 4, roof: roofOf }),
  legacyTownDesign({
    source: old('storehouse'),
    name: 'storehouse shopfront',
    zones: ['market'],
    max: 7,
    roof: roofOf
  }),
  townBuilding('merchant stalls', 'market', 4, merchantStalls),
  {
    ...legacyTownDesign({
      source: old('bathhouse'),
      zones: ['entertainment'],
      max: 9,
      roof: roofOf
    }),
    // The old bathhouse ends with its chimney and the cap on it.
    vents: (parts) => parts.slice(-1)
  },
  townBuilding('lantern theatre', 'entertainment', 12, lanternTheatre, 5, true),
  townBuilding('teahouse', 'entertainment', 6, hall),
  legacyTownDesign({ source: old('townhouse'), zones: ['residential'], max: 9, roof: roofOf }),
  townBuilding('row house', 'residential', 9, rowHouse),
  townBuilding('gabled cottage', 'residential', 5, cottage),
  legacyTownDesign({ source: old('storehouse'), zones: ['workshop'], max: 7, roof: roofOf }),
  { ...townBuilding('foundry with chimney', 'workshop', 12, foundry, 5, true), vents: chimney },
  townBuilding('smithy', 'workshop', 6, smithy),
  legacyTownDesign({
    source: old('shrine garden'),
    zones: ['park'],
    max: 5,
    roof: (part) => part.shape === 'box' && part.color === EDO.lacquer && part.size[0] > 2
  }),
  townBuilding('pond with a bridge', 'park', 3, pondBridge),
  townBuilding('stand of pines', 'park', 5, pineStand)
]
