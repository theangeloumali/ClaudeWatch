import type { TownDress, ZoneDesign, ZoneProp } from '../../town/town-dress'
import { box, lit } from '../parts'
import {
  pocketGarden,
  relayTower,
  repairGarage,
  stackedHousing,
  transitInterchange
} from './building-parts'
import { arcadeHall, foodCourt, nightMarket, signalStudio } from './market-buildings'
import { CYBERPUNK_MATERIALS as material } from './palette'
import { CYBERPUNK_CITIZENS, CYBERPUNK_VEHICLES } from './town-movers'

const DESIGNS: readonly ZoneDesign[] = [
  {
    name: 'relay tower',
    zones: ['civic'],
    height: { min: 4, max: 18 },
    build: relayTower,
    isLandmark: true
  },
  {
    name: 'transit interchange',
    zones: ['civic', 'market'],
    height: { min: 1.2, max: 4 },
    build: transitInterchange
  },
  { name: 'night market', zones: ['market'], height: { min: 1, max: 3 }, build: nightMarket },
  {
    name: 'repair garage',
    zones: ['workshop'],
    height: { min: 1.2, max: 4.5 },
    build: repairGarage
  },
  {
    name: 'food court',
    zones: ['market', 'entertainment'],
    height: { min: 1, max: 3.5 },
    build: foodCourt
  },
  {
    name: 'arcade hall',
    zones: ['entertainment'],
    height: { min: 1.6, max: 6 },
    build: arcadeHall
  },
  {
    name: 'stacked apartments',
    zones: ['residential'],
    height: { min: 2, max: 12 },
    build: stackedHousing
  },
  {
    name: 'signal studio',
    zones: ['workshop', 'civic'],
    height: { min: 1.5, max: 6 },
    build: signalStudio
  },
  {
    name: 'pocket canopy garden',
    zones: ['park'],
    height: { min: 0.7, max: 2 },
    build: pocketGarden
  }
]
const PROPS: readonly ZoneProp[] = [
  {
    name: 'street canopy planter',
    zones: ['park', 'residential', 'civic'],
    size: [0.7, 1.7, 0.7],
    parts: [
      box([0, 0.22, 0], [0.62, 0.44, 0.62], material.steel),
      box([0, 0.91, 0], [0.065, 0.95, 0.065], material.asphalt),
      box([0, 1.46, 0], [0.7, 0.48, 0.7], material.foliage)
    ]
  },
  {
    name: 'industrial street lamp',
    zones: ['civic', 'market', 'workshop', 'entertainment'],
    size: [0.48, 1.9, 0.36],
    parts: [
      box([0, 0.93, 0], [0.065, 1.86, 0.065], material.steel),
      lit(box([0.13, 1.86, 0], [0.22, 0.055, 0.36], material.amber))
    ]
  },
  {
    name: 'street rest bench',
    zones: ['park', 'market', 'residential'],
    size: [0.9, 0.62, 0.4],
    parts: [
      box([0, 0.32, 0], [0.9, 0.08, 0.38], material.amber),
      box([0, 0.48, -0.17], [0.9, 0.28, 0.06], material.steel),
      ...[-0.34, 0.34].map((across) => box([across, 0.15, 0], [0.055, 0.3, 0.3], material.asphalt))
    ]
  },
  {
    name: 'signal pedestal',
    zones: ['civic', 'workshop', 'entertainment'],
    size: [0.4, 0.9, 0.4],
    parts: [
      box([0, 0.4, 0], [0.4, 0.8, 0.4], material.graphite),
      lit(box([0, 0.72, 0.192], [0.25, 0.24, 0.016], material.cyan)),
      box([0, 0.87, 0], [0.36, 0.06, 0.36], material.equipment)
    ]
  }
]

export const CYBERPUNK_TOWN: TownDress = {
  designs: DESIGNS,
  props: PROPS,
  looks: {
    civic: { accent: material.cyan, ground: material.concrete },
    market: { accent: material.amber, ground: material.steel },
    entertainment: { accent: material.pink, ground: material.asphalt },
    residential: { accent: material.glass, ground: material.concrete },
    workshop: { accent: material.amber, ground: material.steel },
    park: { accent: material.foliage, ground: material.concrete }
  },
  roads: { carriageway: material.asphalt, sidewalk: material.steel, promenade: material.concrete },
  citizens: CYBERPUNK_CITIZENS,
  vehicles: CYBERPUNK_VEHICLES,
  garden: 'pocket canopy garden'
}
