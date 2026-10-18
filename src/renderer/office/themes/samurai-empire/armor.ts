import { humanParts, selectHumanAppearance } from '../corporate-city/human-parts'
import { draw, hashOf } from '../lot-math'
import { box, cylinder, turned } from '../parts'
import { SAMURAI_MATERIALS as material } from './palette'

const ARMOR_COLORS = [material.indigo, material.slate, material.charcoal] as const

export function selectSamuraiAppearance(agentKey: string) {
  const human = selectHumanAppearance(agentKey)
  const seed = hashOf(agentKey)
  return {
    ...human,
    shirt: material.garment,
    armor: ARMOR_COLORS[Math.floor(draw(seed, 6) * ARMOR_COLORS.length)] ?? material.indigo,
    metal: human.variant % 2 ? material.metal : material.mineral,
    signal: human.variant % 2 ? material.magenta : material.cyan,
    swordLength: 0.36 + Math.floor(draw(seed, 7) * 3) * 0.035
  }
}

// dry-new: armor extends human joint data; it never substitutes a visor for a face.
export function samuraiParts(
  appearance: ReturnType<typeof selectSamuraiAppearance>,
  providerColor = appearance.metal
) {
  const human = humanParts(appearance, appearance.signal)
  const swordAngle = -0.28
  const hiltX = -0.185 - (Math.sin(swordAngle) * appearance.swordLength) / 2
  const hiltY = 0.125 + (Math.cos(swordAngle) * appearance.swordLength) / 2
  const chest = [0.12, 0.19, 0.26].map((height) =>
    box([0, height, 0.094], [appearance.shoulderWidth * 0.88, 0.053, 0.045], appearance.armor)
  )
  const shoulder = [0, -0.052, -0.104].map((height) =>
    box([0, height, 0.017], [0.133, 0.046, 0.128], appearance.armor)
  )
  const cuff = [
    cylinder([0, -0.082, 0], [0.079, 0.126, 0.079], appearance.metal),
    box([0, -0.086, 0.044], [0.02, 0.084, 0.008], appearance.signal)
  ]
  const thigh = [0.032, -0.04, -0.112].map((height) =>
    box([0, height, 0.073], [0.12, 0.06, 0.035], appearance.armor)
  )
  const greave = [
    box([0, -0.018, 0.07], [0.105, 0.068, 0.035], appearance.metal),
    box([0, -0.13, 0.06], [0.07, 0.146, 0.031], appearance.armor),
    box([0.027, -0.12, 0.078], [0.009, 0.095, 0.009], appearance.signal)
  ]
  return {
    ...human,
    joints: {
      body: [
        ...human.joints.body,
        ...chest,
        box([0, 0.066, 0], [0.244, 0.042, 0.17], providerColor),
        turned(
          box([-0.185, 0.125, -0.03], [0.037, appearance.swordLength, 0.04], appearance.armor),
          [0, 0, swordAngle]
        ),
        turned(
          box(
            [hiltX - Math.sin(swordAngle) * 0.05, hiltY + Math.cos(swordAngle) * 0.05, -0.03],
            [0.04, 0.1, 0.042],
            appearance.metal
          ),
          [0, 0, swordAngle]
        ),
        turned(box([hiltX, hiltY, -0.03], [0.092, 0.018, 0.072], appearance.metal), [
          0,
          0,
          swordAngle
        ])
      ],
      head: [
        ...human.joints.head,
        cylinder([0, 0.122, -0.018], [0.174, 0.061, 0.158], appearance.armor),
        box([0, 0.097, -0.006], [0.195, 0.018, 0.176], appearance.metal),
        ...[-1, 1].map((side) =>
          box([side * 0.085, 0.012, -0.043], [0.027, 0.134, 0.085], appearance.armor)
        ),
        box([0, 0.162, -0.024], [0.029, 0.055, 0.054], appearance.metal),
        box([0.084, 0.043, 0.02], [0.017, 0.025, 0.018], appearance.signal)
      ],
      leftArm: [...human.joints.leftArm, ...shoulder],
      rightArm: [...human.joints.rightArm, ...shoulder],
      leftElbow: [...human.joints.leftElbow, ...cuff],
      rightElbow: [...human.joints.rightElbow, ...cuff],
      leftHip: [...human.joints.leftHip, ...thigh],
      rightHip: [...human.joints.rightHip, ...thigh],
      leftKnee: [...human.joints.leftKnee, ...greave],
      rightKnee: [...human.joints.rightKnee, ...greave]
    },
    book: [
      box([0, 0.032, 0], [0.15, 0.19, 0.024], appearance.armor),
      box([0, 0.032, 0.016], [0.131, 0.168, 0.012], material.mineral)
    ]
  }
}
