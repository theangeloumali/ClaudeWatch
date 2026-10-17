import { BRASS_CITIZENS } from '../citizens/figures-edo-brass'
import type { TownDress, ZoneProp } from '../town/town-dress'
import { BRASS_PROPS } from './BrassProps'
import { BRASS_TOWN_DESIGNS } from './brass-town-buildings'
import { BRASS_VEHICLES } from './brass-town-vehicles'
import { legacyTownProp } from './edo-town-legacy'
import { BRASS } from './palettes'
import { box, cone, cylinder, sphere } from './parts'

const GARDEN_PROPS: readonly ZoneProp[] = [
  {
    name: 'iron bench',
    zones: ['park', 'residential'],
    size: [1.2, 0.8, 0.5],
    parts: [
      box([0, 0.44, 0], [1.2, 0.12, 0.5], BRASS.wood),
      ...[-0.45, 0.45].map((across) => box([across, 0.19, 0], [0.12, 0.38, 0.4], BRASS.ink)),
      box([0, 0.66, -0.2], [1.2, 0.28, 0.1], BRASS.brass)
    ]
  },
  {
    name: 'copper planter tree',
    zones: ['park', 'residential'],
    size: [0.9, 1.5, 0.9],
    parts: [
      cylinder([0, 0.15, 0], [0.6, 0.3, 0.6], BRASS.copper),
      box([0, 0.65, 0], [0.1, 0.7, 0.1], BRASS.wood),
      sphere([0, 1.1, 0], [0.9, 0.8, 0.9], '#617966')
    ]
  },
  {
    name: 'guild pennant',
    zones: ['civic', 'market', 'entertainment'],
    size: [0.7, 1.6, 0.25],
    parts: [
      cylinder([-0.25, 0.8, 0], [0.08, 1.6, 0.08], BRASS.ink),
      box([0.06, 1.13, 0], [0.5, 0.7, 0.06], BRASS.copper),
      cone([-0.25, 1.55, 0], [0.2, 0.1, 0.2], BRASS.brass)
    ]
  }
]

export const BRASS_TOWN: TownDress = {
  designs: BRASS_TOWN_DESIGNS,
  props: [
    ...BRASS_PROPS.map((prop) =>
      legacyTownProp(
        prop,
        prop.name === 'gas lamp'
          ? ['civic', 'market', 'entertainment', 'residential', 'park']
          : ['workshop', 'market']
      )
    ),
    ...GARDEN_PROPS
  ],
  looks: {
    civic: { accent: BRASS.brass, ground: '#CCB78E' },
    market: { accent: BRASS.copper, ground: '#C99A74' },
    entertainment: { accent: '#8C5964', ground: '#C7A3AC' },
    residential: { accent: '#715540', ground: '#B7A18B' },
    workshop: { accent: BRASS.stone, ground: '#9EA3AD' },
    park: { accent: '#617966', ground: '#A8BCA3' }
  },
  roads: { carriageway: BRASS.ink, sidewalk: '#92908A', promenade: BRASS.paper },
  citizens: BRASS_CITIZENS,
  vehicles: BRASS_VEHICLES,
  garden: 'iron-fenced fountain square'
}
