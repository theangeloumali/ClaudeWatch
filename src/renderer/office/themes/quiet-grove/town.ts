import { GROVE_CITIZENS } from '../../citizens/figures'
import type { TownDress } from '../../town/town-dress'
import type { TownDistrict } from '../../town/town-zones'
import { zonedProps } from '../heritage'
import { GROVE_LOT_KIT } from './grove-lots'
import { GROVE } from './palette'
import { GROVE_CIVIC_DESIGNS } from './town-civic'
import { GROVE_HERITAGE } from './town-heritage'
import { GROVE_LEISURE_DESIGNS } from './town-leisure'
import { GROVE_QUARTER_DESIGNS } from './town-quarters'
import { GROVE_VEHICLES } from './town-vehicles'

// Where each of the grove's wall-side props belongs in town.
const PROP_ZONES: Record<string, readonly TownDistrict[] | undefined> = {
  'log-pile': ['workshop', 'residential'],
  'stone-lantern': ['civic', 'market', 'entertainment', 'park'],
  boulders: ['park', 'civic'],
  'glow-caps': ['park', 'entertainment'],
  'plank-bench': ['market', 'entertainment', 'residential', 'park'],
  sapling: ['residential', 'park', 'civic'],
  'water-trough': ['workshop', 'market'],
  'moss-bed': ['residential', 'market']
}

// A village in a clearing. Roofs and pads are the grove's own colours, one pair to a zone:
// stone for the moot, clay for trade, pond for the green, straw for homes, bark for the yards.
export const GROVE_TOWN: TownDress = {
  designs: [
    ...GROVE_HERITAGE,
    ...GROVE_CIVIC_DESIGNS,
    ...GROVE_LEISURE_DESIGNS,
    ...GROVE_QUARTER_DESIGNS
  ],
  props: zonedProps(GROVE_LOT_KIT.props, PROP_ZONES),
  looks: {
    civic: { accent: GROVE.stone, ground: '#6B6E66' },
    market: { accent: GROVE.clay, ground: '#7A5A44' },
    entertainment: { accent: GROVE.pond, ground: '#3F6660' },
    residential: { accent: '#CDBB85', ground: '#6E6A45' },
    workshop: { accent: GROVE.bark, ground: '#4A3B30' },
    park: { accent: GROVE.fern, ground: '#3F6A3A' }
  },
  // Packed earth, a gravel path and a pale stone walk: nothing here is paved.
  roads: { carriageway: '#3B3128', sidewalk: '#8A8172', promenade: '#D8D2BF' },
  citizens: GROVE_CITIZENS,
  vehicles: GROVE_VEHICLES,
  garden: 'pond'
}
