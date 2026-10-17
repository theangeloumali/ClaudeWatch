import type { TownDress } from '../../town/town-dress'
import { CORPORATE_MATERIALS as MATERIALS, CORPORATE_PALETTE as PALETTE } from './palette'
import { CORPORATE_DESIGNS } from './town-designs'
import { CORPORATE_CITIZENS, CORPORATE_VEHICLES } from './town-movers'
import { CORPORATE_PROPS } from './town-props'

export const CORPORATE_TOWN: TownDress = {
  designs: CORPORATE_DESIGNS,
  props: CORPORATE_PROPS,
  looks: {
    civic: { accent: MATERIALS.civic, ground: MATERIALS.concrete },
    market: { accent: MATERIALS.retail, ground: PALETTE.wood },
    entertainment: { accent: MATERIALS.culture, ground: PALETTE.copper },
    residential: { accent: MATERIALS.residential, ground: PALETTE.floor },
    workshop: { accent: MATERIALS.workshop, ground: PALETTE.stone },
    park: { accent: MATERIALS.park, ground: PALETTE.blossom }
  },
  roads: {
    carriageway: MATERIALS.road,
    sidewalk: MATERIALS.sidewalk,
    promenade: PALETTE.paper
  },
  citizens: CORPORATE_CITIZENS,
  vehicles: CORPORATE_VEHICLES,
  garden: 'planted civic square'
}
