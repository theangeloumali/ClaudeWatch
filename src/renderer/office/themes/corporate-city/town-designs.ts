import type { ZoneDesign } from '../../town/town-dress'
import {
  apartmentSlab,
  artGallery,
  communityHall,
  cornerCafe,
  courtyardServices,
  cultureCentre,
  headquarters,
  innovationHub,
  retailArcade,
  serviceCourt,
  serviceHall,
  serviceStudio,
  steppedApartments
} from './town-buildings'
import { linearGarden, plantedSquare } from './town-props'

export const CORPORATE_DESIGNS: readonly ZoneDesign[] = [
  {
    name: 'municipal service hall',
    zones: ['civic'],
    height: { min: 2, max: 8 },
    build: serviceHall
  },
  {
    name: 'courtyard services',
    zones: ['civic'],
    height: { min: 2, max: 9 },
    build: courtyardServices
  },
  { name: 'corner cafe', zones: ['market'], height: { min: 2, max: 5 }, build: cornerCafe },
  { name: 'retail arcade', zones: ['market'], height: { min: 2, max: 7 }, build: retailArcade },
  {
    name: 'neighborhood gallery',
    zones: ['entertainment'],
    height: { min: 2, max: 8 },
    build: artGallery
  },
  {
    name: 'community hall',
    zones: ['entertainment'],
    height: { min: 2, max: 6 },
    build: communityHall
  },
  {
    name: 'balcony apartments',
    zones: ['residential'],
    height: { min: 2, max: 12 },
    build: apartmentSlab
  },
  {
    name: 'stepped apartments',
    zones: ['residential'],
    height: { min: 2, max: 10 },
    build: steppedApartments
  },
  { name: 'service studio', zones: ['workshop'], height: { min: 2, max: 6 }, build: serviceStudio },
  { name: 'service court', zones: ['workshop'], height: { min: 2, max: 8 }, build: serviceCourt },
  {
    name: 'planted civic square',
    zones: ['park'],
    height: { min: 1, max: 4 },
    build: plantedSquare
  },
  {
    name: 'linear pocket garden',
    zones: ['park'],
    height: { min: 1, max: 3 },
    build: linearGarden
  },
  {
    name: 'modern headquarters',
    zones: ['civic'],
    height: { min: 6, max: 24 },
    build: headquarters,
    isLandmark: true
  },
  {
    name: 'culture centre',
    zones: ['entertainment'],
    height: { min: 5, max: 16 },
    build: cultureCentre,
    isLandmark: true
  },
  {
    name: 'innovation hub',
    zones: ['workshop'],
    height: { min: 5, max: 18 },
    build: innovationHub,
    isLandmark: true
  }
]
