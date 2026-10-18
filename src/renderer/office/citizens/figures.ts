import { brassWorkshop, neoEdoSteam } from '../themes/builtins'
import { CORPORATE_CITIZENS } from '../themes/corporate-city/town-movers'
import { CYBERPUNK_CITIZENS } from '../themes/cyberpunk-city/town-movers'
import { SAMURAI_TOWN } from '../themes/samurai-empire/town'
import { ORBITAL_GARRISON_ID } from '../themes/orbital-garrison/roster'
import { GROVE } from '../themes/quiet-grove/palette'
import { QUIET_GROVE_ID } from '../themes/quiet-grove/roster'
import { VIOLET_COURT_ID } from '../themes/violet-court/roster'
import { ball, box, cone, person, quadruped, tube, type CitizenFigure } from './figure-parts'
import { COURT_CITIZENS, GARRISON_CITIZENS } from './figures-court-garrison'
import { BRASS_CITIZENS, EDO_CITIZENS } from './figures-edo-brass'

export { citizenGeometry, type CitizenFigure } from './figure-parts'

// Quiet Grove: walkers on the trails, and the animals that were there first.
export const GROVE_CITIZENS: readonly CitizenFigure[] = [
  {
    name: 'Trail Hiker',
    parts: () => [
      ...person({ robe: GROVE.timber, coat: GROVE.clay, hair: GROVE.soil }),
      tube(GROVE.timber, [0.19, 0.19, 0.02], [0, 1.0, 0]),
      tube(GROVE.timber, [0.09, 0.1, 0.08], [0, 1.05, 0]),
      box(GROVE.moss, [0.22, 0.32, 0.13], [0, 0.68, -0.2]),
      tube(GROVE.paper, [0.06, 0.06, 0.24], [0, 0.88, -0.2]),
      box(GROVE.timber, [0.025, 1.0, 0.025], [0.2, 0.5, 0.1])
    ]
  },
  {
    name: 'Basket Forager',
    parts: () => [
      ...person({ robe: GROVE.moss, coat: GROVE.paper, hair: GROVE.bark }),
      cone(GROVE.timber, 0.25, 0.11, [0, 1.06, 0]),
      tube(GROVE.bark, [0.12, 0.09, 0.15], [0.21, 0.45, 0.1]),
      ball(GROVE.clay, 0.08, [0.21, 0.54, 0.1]),
      box(GROVE.bark, [0.015, 0.2, 0.015], [0.21, 0.62, 0.1])
    ]
  },
  {
    name: 'Grove Deer',
    parts: () => [
      ...quadruped({ coat: GROVE.timber, length: 0.58, girth: 0.22, leg: 0.44, head: 0.1 }),
      box(GROVE.timber, [0.09, 0.3, 0.09], [0, 0.78, 0.27]),
      ball(GROVE.timber, 0.095, [0, 0.96, 0.31]),
      box(GROVE.bark, [0.07, 0.06, 0.12], [0, 0.94, 0.42]),
      ...[-1, 1].flatMap((side) => [
        box(GROVE.paper, [0.02, 0.2, 0.02], [side * 0.06, 1.12, 0.27]),
        box(GROVE.paper, [0.1, 0.02, 0.02], [side * 0.1, 1.16, 0.27])
      ]),
      box(GROVE.paper, [0.06, 0.08, 0.04], [0, 0.64, -0.3])
    ]
  },
  {
    name: 'Russet Fox',
    parts: () => [
      ...quadruped({ coat: GROVE.clay, length: 0.42, girth: 0.15, leg: 0.15, head: 0.095 }),
      cone(GROVE.clay, 0.035, 0.09, [-0.05, 0.44, 0.24]),
      cone(GROVE.clay, 0.035, 0.09, [0.05, 0.44, 0.24]),
      box(GROVE.soil, [0.04, 0.04, 0.1], [0, 0.33, 0.36]),
      box(GROVE.clay, [0.09, 0.09, 0.26], [0, 0.26, -0.32]),
      box(GROVE.paper, [0.08, 0.08, 0.1], [0, 0.27, -0.48])
    ]
  }
]

const FIGURES: Record<string, readonly CitizenFigure[] | undefined> = {
  [neoEdoSteam.id]: EDO_CITIZENS,
  [brassWorkshop.id]: BRASS_CITIZENS,
  [VIOLET_COURT_ID]: COURT_CITIZENS,
  [ORBITAL_GARRISON_ID]: GARRISON_CITIZENS,
  [QUIET_GROVE_ID]: GROVE_CITIZENS,
  'corporate-city': CORPORATE_CITIZENS,
  'cyberpunk-city': CYBERPUNK_CITIZENS,
  'samurai-empire': SAMURAI_TOWN.citizens
}

// The people and animals on a theme's streets. A theme with none of its own gets the default town's.
export function citizenFigures(themeId: string): readonly CitizenFigure[] {
  return FIGURES[themeId] ?? EDO_CITIZENS
}
