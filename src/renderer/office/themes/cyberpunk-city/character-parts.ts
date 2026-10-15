import { HUMAN_PIVOT } from '../corporate-city/human-parts'
import { HUMAN_HAIR_COLORS, HUMAN_SKIN_TONES } from '../corporate-city/palette'
import { box, cylinder, sphere, turned, type PartSpec } from '../parts'
import type { ThemePalette } from '../types'
import { roleEquipment } from './role-equipment'

export type CharacterKind =
  | 'samurai'
  | 'courier'
  | 'technician'
  | 'guard'
  | 'human'
  | 'scoutrobo'
  | 'medic'
  | 'analyst'
  | 'pilot'
  | 'mechanic'
export type CharacterJoint = keyof typeof HUMAN_PIVOT
export interface CharacterParts {
  joints: Record<CharacterJoint, PartSpec[]>
  eyes: readonly [PartSpec, PartSpec]
  book: readonly PartSpec[]
}
export interface CharacterOptions {
  kind: CharacterKind
  palette: ThemePalette
  variant: number
}

// dry-new: original roles share anatomical pivots, not corporate shirts or uniform box skins.
export function characterParts({ kind, palette, variant }: CharacterOptions): CharacterParts {
  const isRobot = kind === 'scoutrobo'
  const skin = isRobot ? palette.brass : HUMAN_SKIN_TONES[variant % HUMAN_SKIN_TONES.length]
  const hair = HUMAN_HAIR_COLORS[variant % HUMAN_HAIR_COLORS.length]
  const shoulderWidth = kind === 'guard' ? 0.32 : kind === 'scoutrobo' ? 0.22 : 0.27
  const upperArm = () => [cylinder([0, -0.095, 0], [0.09, 0.19, 0.095], palette.lacquer)]
  const forearm = () => [
    cylinder([0, -0.086, 0], [0.067, 0.172, 0.073], skin),
    box([0, -0.045, 0], [0.078, 0.075, 0.082], palette.lacquer),
    box([0, -0.195, 0.014], [0.065, 0.06, 0.05], skin)
  ]
  const thigh = () => [cylinder([0, -0.125, 0], [0.11, 0.25, 0.115], palette.ink)]
  const shin = () => [
    cylinder([0, -0.125, 0], [0.085, 0.25, 0.09], palette.ink),
    box([0, -0.267, 0.029], [0.11, 0.065, 0.165], palette.brass)
  ]
  const joints: CharacterParts['joints'] = {
    body: [
      cylinder([0, 0.18, 0], [shoulderWidth, 0.3, 0.16], palette.lacquer),
      box([0, 0.025, 0], [0.22, 0.105, 0.145], palette.ink),
      cylinder([0, 0.364, 0], [0.075, 0.065, 0.075], skin),
      box([0, 0.02, 0.079], [0.23, 0.03, 0.025], palette.brass),
      box([0, 0.215, 0.083], [0.012, 0.22, 0.016], palette.paper),
      turned(box([-0.048, 0.305, 0.083], [0.09, 0.04, 0.018], palette.brass), [0, 0, -0.42]),
      turned(box([0.048, 0.305, 0.083], [0.09, 0.04, 0.018], palette.brass), [0, 0, 0.42])
    ],
    head: [
      sphere([0, 0.04, 0], [0.14, 0.178, 0.145], skin),
      box([0, 0.034, 0.08], [0.022, 0.032, 0.022], skin),
      box([0, 0.002, 0.07], [0.035, 0.009, 0.011], palette.ink),
      cylinder([0, 0.101, -0.007], [0.154, 0.075, 0.147], isRobot ? palette.ink : hair),
      box([0, 0.065, -0.065], [0.13, 0.11, 0.03], isRobot ? palette.brass : hair),
      box([-0.075, 0.03, 0], [0.017, 0.038, 0.032], skin),
      box([0.075, 0.03, 0], [0.017, 0.038, 0.032], skin)
    ],
    leftArm: upperArm(),
    rightArm: upperArm(),
    leftElbow: forearm(),
    rightElbow: forearm(),
    leftHip: thigh(),
    rightHip: thigh(),
    leftKnee: shin(),
    rightKnee: shin()
  }
  roleEquipment({ kind, palette, joints })
  return {
    joints,
    eyes: [
      box([-0.03, 0.046, 0.072], [0.02, 0.014, 0.014], isRobot ? palette.glow : palette.ink),
      box([0.03, 0.046, 0.072], [0.02, 0.014, 0.014], isRobot ? palette.glow : palette.ink)
    ],
    book: [
      box([0, 0.02, 0], [0.13, 0.17, 0.021], palette.ink),
      box([0, 0.02, 0.013], [0.11, 0.14, 0.008], palette.paper)
    ]
  }
}
