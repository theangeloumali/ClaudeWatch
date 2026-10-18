import { FACADE_LAYER_STEP_M } from '../../scene/building-window-parts'
import type { ZoneDesign, ZonePlot } from '../../town/town-dress'
import { heritageDesigns, paintedIn, type Restyle } from '../heritage'
import { box, SIDES, type PartSpec } from '../parts'
import { COURT_BUILDINGS } from './court-buildings'
import { COURT } from './palette'

// Counters between the columns, each with a row of books.
function scholarStalls({ width, depth }: ZonePlot): PartSpec[] {
  return SIDES.flatMap((side) => [
    box([side * width * 0.28, 0.45, 0], [width * 0.2, 0.5, depth * 0.24], COURT.slate),
    box([side * width * 0.28, 0.74, 0], [width * 0.16, 0.08, depth * 0.12], COURT.crimson),
    box([side * width * 0.28, 0.82, 0], [width * 0.1, 0.08, depth * 0.1], COURT.ivory)
  ])
}

// A cloth roof over the back of the gantry: the front stays open so the frame is seen.
const hangarCanopy = ({ width, depth, height, accent }: ZonePlot): PartSpec[] => [
  box(
    [0, height - 0.015 - FACADE_LAYER_STEP_M, -depth * 0.2],
    [width * 0.96, 0.03, depth * 0.4],
    accent
  )
]

const RESTYLES: Record<string, Restyle | undefined> = {
  parterre: { zones: ['park'], isRoof: paintedIn(COURT.violet) },
  colonnade: {
    name: 'scholars-colonnade',
    zones: ['market'],
    isRoof: paintedIn(COURT.ink),
    extra: scholarStalls
  },
  // Taller than the gantry was built: a frame the height of a tower is what marks the yard.
  'frame-hangar': {
    zones: ['workshop'],
    extra: hangarCanopy,
    height: { min: 2.6, max: 10 },
    isLandmark: true
  },
  academy: { zones: ['residential'], isRoof: paintedIn(COURT.ink) },
  'bell-tower': { zones: ['civic'], isRoof: paintedIn(COURT.violet) },
  keep: { zones: ['civic'], isRoof: paintedIn(COURT.violet), isLandmark: true }
}

export const COURT_HERITAGE: readonly ZoneDesign[] = heritageDesigns(COURT_BUILDINGS, RESTYLES)
