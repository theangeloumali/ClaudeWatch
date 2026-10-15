import { draw, hashOf } from '../lot-math'
import { box, cylinder, sphere, turned } from '../parts'
import type { Vector } from '../primitives'
import {
  CORPORATE_MATERIALS,
  CORPORATE_PALETTE,
  HUMAN_CLOTHING_COLORS,
  HUMAN_HAIR_COLORS,
  HUMAN_SKIN_TONES
} from './palette'

// dry-new: the existing uniform builders have rigid limbs and oversized visor heads.
export const HUMAN_PIVOT = {
  body: [0, 0.55, 0],
  head: [0, 0.405, 0],
  leftArm: [-0.165, 0.305, 0],
  rightArm: [0.165, 0.305, 0],
  leftElbow: [0, -0.19, 0],
  rightElbow: [0, -0.19, 0],
  leftHip: [-0.085, 0, 0],
  rightHip: [0.085, 0, 0],
  leftKnee: [0, -0.25, 0],
  rightKnee: [0, -0.25, 0]
} satisfies Record<string, Vector>

export function selectHumanAppearance(agentKey: string) {
  const seed = hashOf(agentKey)
  const variant = Math.floor(draw(seed, 0) * 6)
  return {
    variant,
    skin: HUMAN_SKIN_TONES[Math.floor(draw(seed, 1) * 6)] ?? HUMAN_SKIN_TONES[0],
    hair: HUMAN_HAIR_COLORS[Math.floor(draw(seed, 2) * 6)] ?? HUMAN_HAIR_COLORS[0],
    shirt: HUMAN_CLOTHING_COLORS[Math.floor(draw(seed, 3) * 6)] ?? HUMAN_CLOTHING_COLORS[0],
    shoulderWidth: 0.26 + (variant % 3) * 0.012
  }
}

type HumanAppearance = Omit<ReturnType<typeof selectHumanAppearance>, 'shirt'> & { shirt: string }
export const HUMAN_PELVIS = box([0, 0.025, 0], [0.22, 0.105, 0.145], CORPORATE_PALETTE.ink)
export const HUMAN_LOWER_LEG_LENGTH = 0.3

const HAIR_DETAILS = [
  { at: [-0.035, 0.099, 0.032], size: [0.075, 0.026, 0.075], back: 0.045 },
  { at: [0, 0.112, -0.078], size: [0.068, 0.066, 0.068], back: 0.12 },
  { at: [0, -0.018, -0.091], size: [0.055, 0.17, 0.052], back: 0.065 },
  { at: [0.038, 0.097, 0.024], size: [0.085, 0.036, 0.075], back: 0.055 },
  { at: [0, 0.107, -0.014], size: [0.14, 0.058, 0.125], back: 0.17 },
  { at: [-0.035, 0.101, -0.002], size: [0.078, 0.045, 0.12], back: 0.09 }
] as const satisfies readonly { at: Readonly<Vector>; size: Readonly<Vector>; back: number }[]

function headParts(appearance: HumanAppearance) {
  const hair = HAIR_DETAILS[appearance.variant] ?? HAIR_DETAILS[0]
  const headWidth = 0.136 + appearance.variant * 0.001
  return [
    sphere([0, 0.04, 0], [headWidth, 0.178, 0.14], appearance.skin),
    box([0, 0.033, 0.078], [0.024, 0.033, 0.024], appearance.skin),
    box([-0.072, 0.03, 0], [0.024, 0.042, 0.031], appearance.skin),
    box([0.072, 0.03, 0], [0.024, 0.042, 0.031], appearance.skin),
    box([0, 0.005, 0.067], [0.035, 0.008, 0.014], CORPORATE_PALETTE.ink),
    box([-0.031, 0.063, 0.065], [0.031, 0.008, 0.017], appearance.hair),
    box([0.031, 0.063, 0.065], [0.031, 0.008, 0.017], appearance.hair),
    sphere([0, 0.102, -0.008], [headWidth + 0.016, 0.075, 0.145], appearance.hair),
    box([0, 0.076 - hair.back / 2, -0.059], [headWidth, hair.back, 0.036], appearance.hair),
    sphere([...hair.at], [...hair.size], appearance.hair)
  ]
}

export function humanParts(appearance: HumanAppearance, badgeColor: string) {
  const upperArm = () => [cylinder([0, -0.095, 0], [0.087, 0.19, 0.09], appearance.shirt)]
  const forearm = () => [
    cylinder([0, -0.083, 0], [0.068, 0.166, 0.071], appearance.skin),
    box([0, -0.018, 0], [0.078, 0.035, 0.081], appearance.shirt),
    box([0, -0.199, 0.009], [0.063, 0.074, 0.036], appearance.skin)
  ]
  const thigh = () => [box([0, -0.125, 0], [0.102, 0.25, 0.115], CORPORATE_PALETTE.ink)]
  const shin = () => [
    box([0, -0.12, 0], [0.089, 0.24, 0.101], CORPORATE_PALETTE.ink),
    box(
      [0, -HUMAN_LOWER_LEG_LENGTH + 0.0275, 0.035],
      [0.108, 0.055, 0.178],
      CORPORATE_MATERIALS.shoe
    )
  ]
  return {
    joints: {
      body: [
        cylinder([0, 0.18, 0], [appearance.shoulderWidth, 0.3, 0.16], appearance.shirt),
        HUMAN_PELVIS,
        box([0, 0.23, 0.081], [0.016, 0.17, 0.012], CORPORATE_PALETTE.paper),
        cylinder([0, 0.364, 0], [0.078, 0.065, 0.075], appearance.skin),
        turned(
          box([-0.026, 0.316, 0.076], [0.049, 0.036, 0.016], CORPORATE_PALETTE.paper),
          [0, 0, -0.38]
        ),
        turned(
          box([0.026, 0.316, 0.076], [0.049, 0.036, 0.016], CORPORATE_PALETTE.paper),
          [0, 0, 0.38]
        ),
        box([-0.076, 0.215, 0.085], [0.031, 0.047, 0.012], CORPORATE_MATERIALS.badge),
        box([-0.076, 0.225, 0.093], [0.025, 0.012, 0.008], badgeColor)
      ],
      head: headParts(appearance),
      leftArm: upperArm(),
      rightArm: upperArm(),
      leftElbow: forearm(),
      rightElbow: forearm(),
      leftHip: thigh(),
      rightHip: thigh(),
      leftKnee: shin(),
      rightKnee: shin()
    },
    eyes: [
      box([-0.031, 0.044, 0.072], [0.017, 0.014, 0.012], CORPORATE_PALETTE.ink),
      box([0.031, 0.044, 0.072], [0.017, 0.014, 0.012], CORPORATE_PALETTE.ink)
    ] as const,
    book: [
      box([0, 0.032, 0], [0.15, 0.19, 0.024], CORPORATE_PALETTE.lacquer),
      box([0, 0.032, 0.016], [0.131, 0.168, 0.012], CORPORATE_PALETTE.paper)
    ]
  }
}
