import { GARRISON_CITIZENS } from '../../citizens/figures-court-garrison'
import type { TownDress } from '../../town/town-dress'
import { GARRISON_DESIGNS } from './town-designs'
import { GARRISON_LOOKS, GARRISON_ROADS } from './town-looks'
import { GARRISON_PROPS } from './town-props'
import { GARRISON_VEHICLES } from './town-vehicles'

// Orbital Garrison's share of the zoned town, as data: the shared town view draws it.
export const GARRISON_TOWN: TownDress = {
  designs: GARRISON_DESIGNS,
  props: GARRISON_PROPS,
  looks: GARRISON_LOOKS,
  roads: GARRISON_ROADS,
  citizens: GARRISON_CITIZENS,
  vehicles: GARRISON_VEHICLES,
  garden: 'parade-lawn'
}
