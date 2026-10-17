import { EDO_CITIZENS } from '../citizens/figures-edo-brass'
import type { TownDress, ZoneProp } from '../town/town-dress'
import type { TownDistrict } from '../town/town-zones'
import { EDO_PROPS } from './EdoProps'
import { EDO_TOWN_DESIGNS } from './edo-town-buildings'
import { legacyTownProp } from './edo-town-legacy'
import { EDO_VEHICLES } from './edo-town-vehicles'
import { EDO } from './palettes'
import { box } from './parts'

const PROP_ZONES: readonly (readonly TownDistrict[])[] = [
  ['civic', 'market', 'entertainment', 'park'],
  ['market', 'workshop'],
  ['market', 'workshop'],
  ['park', 'residential'],
  ['park', 'residential'],
  ['civic', 'market', 'entertainment'],
  ['market', 'workshop'],
  ['market', 'entertainment']
]

const bench: ZoneProp = {
  name: 'cedar bench',
  zones: ['park', 'residential'],
  size: [1.2, 0.8, 0.5],
  parts: [
    box([0, 0.44, 0], [1.2, 0.12, 0.5], EDO.wood),
    ...[-0.45, 0.45].map((across) => box([across, 0.19, 0], [0.12, 0.38, 0.4], EDO.ink)),
    box([0, 0.66, -0.2], [1.2, 0.28, 0.1], EDO.wood)
  ]
}

export const EDO_TOWN: TownDress = {
  designs: EDO_TOWN_DESIGNS,
  props: [...EDO_PROPS.map((prop, index) => legacyTownProp(prop, PROP_ZONES[index])), bench],
  looks: {
    civic: { accent: EDO.gold, ground: '#D2BE83' },
    market: { accent: EDO.lacquer, ground: '#C9987E' },
    entertainment: { accent: '#86536F', ground: '#C5A0BA' },
    residential: { accent: '#795039', ground: '#BAA28D' },
    workshop: { accent: '#575963', ground: '#A2A2A6' },
    park: { accent: '#58784A', ground: '#A9BA87' }
  },
  roads: { carriageway: EDO.ink, sidewalk: EDO.stone, promenade: EDO.paper },
  citizens: EDO_CITIZENS,
  vehicles: EDO_VEHICLES,
  garden: 'pond with a bridge'
}
