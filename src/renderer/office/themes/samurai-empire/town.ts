import type { TownDress } from '../../town/town-dress'
import { SAMURAI_MATERIALS as material } from './palette'
import { SAMURAI_DESIGNS } from './town-designs'
import { SAMURAI_CITIZENS, SAMURAI_VEHICLES } from './town-movers'
import { SAMURAI_PROPS } from './town-props'

export const SAMURAI_TOWN: TownDress = {
  designs: SAMURAI_DESIGNS,
  props: SAMURAI_PROPS,
  looks: {
    civic: { accent: material.cyan, ground: material.mineral },
    market: { accent: material.magenta, ground: material.slate },
    entertainment: { accent: material.magenta, ground: material.indigo },
    residential: { accent: material.amber, ground: material.mineral },
    workshop: { accent: material.cyan, ground: material.slate },
    park: { accent: material.amber, ground: material.moss }
  },
  roads: { carriageway: material.charcoal, sidewalk: material.slate, promenade: material.mineral },
  citizens: SAMURAI_CITIZENS,
  vehicles: SAMURAI_VEHICLES,
  garden: 'mineral canal garden'
}
