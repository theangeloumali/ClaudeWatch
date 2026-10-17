import { COURT_CITIZENS } from '../../citizens/figures-court-garrison'
import type { TownDress } from '../../town/town-dress'
import type { TownDistrict } from '../../town/town-zones'
import { zonedProps } from '../heritage'
import { COURT_LOT_KIT } from './court-lots'
import { COURT } from './palette'
import { COURT_CIVIC_DESIGNS } from './town-civic'
import { COURT_HERITAGE } from './town-heritage'
import { COURT_LEISURE_DESIGNS } from './town-leisure'
import { COURT_QUARTER_DESIGNS } from './town-quarters'
import { COURT_VEHICLES } from './town-vehicles'

// Where each of the court's wall-side props belongs in town.
const PROP_ZONES: Record<string, readonly TownDistrict[] | undefined> = {
  'lamp-post': ['civic', 'market', 'entertainment', 'residential'],
  'banner-stand': ['civic', 'entertainment'],
  topiary: ['park', 'residential'],
  statue: ['civic', 'park'],
  bench: ['park', 'market', 'residential'],
  urns: ['park', 'market', 'entertainment'],
  'lance-rack': ['workshop'],
  brazier: ['workshop', 'entertainment']
}

// A palace-and-academy city. Roofs and pads are the court's own colours, one pair to a zone:
// gold for the crown, crimson for trade, lilac for revels, blue for homes, pewter for the yards.
export const COURT_TOWN: TownDress = {
  designs: [
    ...COURT_HERITAGE,
    ...COURT_CIVIC_DESIGNS,
    ...COURT_LEISURE_DESIGNS,
    ...COURT_QUARTER_DESIGNS
  ],
  props: zonedProps(COURT_LOT_KIT.props, PROP_ZONES),
  looks: {
    civic: { accent: COURT.gold, ground: '#4D4638' },
    market: { accent: COURT.crimson, ground: '#55303A' },
    entertainment: { accent: COURT.lumen, ground: '#5B3A66' },
    residential: { accent: '#4F6FB5', ground: '#2E3B5C' },
    workshop: { accent: '#8E8A9C', ground: '#33343B' },
    // The court's lawns have always been violet.
    park: { accent: COURT.violet, ground: '#3F2C6B' }
  },
  roads: { carriageway: '#1C1922', sidewalk: '#6E6880', promenade: '#A9A2BC' },
  citizens: COURT_CITIZENS,
  vehicles: COURT_VEHICLES,
  garden: 'parterre'
}
