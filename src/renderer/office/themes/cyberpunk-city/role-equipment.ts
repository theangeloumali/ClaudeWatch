import { box, cylinder, turned } from '../parts'
import type { ThemePalette } from '../types'
import type { CharacterKind, CharacterParts } from './character-parts'

interface EquipmentOptions {
  kind: CharacterKind
  palette: ThemePalette
  joints: CharacterParts['joints']
}

export function roleEquipment({ kind, palette, joints }: EquipmentOptions): void {
  switch (kind) {
    case 'samurai':
      joints.body.push(
        box([0, 0.18, 0.103], [0.245, 0.2, 0.03], palette.brass),
        ...[0.04, 0.09, 0.14].map((height) =>
          box([0, height, 0.111], [0.26, 0.025, 0.018], palette.gold)
        ),
        turned(box([-0.12, 0.17, -0.125], [0.032, 0.43, 0.035], palette.ink), [0, 0, -0.22])
      )
      joints.leftArm.push(box([0, -0.035, 0], [0.16, 0.095, 0.2], palette.brass))
      joints.rightArm.push(box([0, -0.035, 0], [0.16, 0.095, 0.2], palette.brass))
      joints.head.push(box([0, 0.129, 0], [0.04, 0.035, 0.13], palette.gold))
      return
    case 'courier':
      joints.body.push(
        box([0, 0.19, -0.126], [0.225, 0.28, 0.1], palette.copper),
        box([0, 0.2, -0.182], [0.17, 0.025, 0.015], palette.gold),
        turned(box([0, 0.21, 0.102], [0.035, 0.29, 0.018], palette.gold), [0, 0, -0.65])
      )
      joints.head.push(box([0, 0.094, 0.092], [0.17, 0.018, 0.095], palette.lacquer))
      return
    case 'technician':
      joints.body.push(box([0, 0.085, 0.1], [0.185, 0.18, 0.021], palette.copper))
      joints.head.push(box([0, 0.059, 0.083], [0.125, 0.037, 0.035], palette.glow))
      joints.leftElbow.push(box([0, -0.025, 0.052], [0.065, 0.04, 0.034], palette.glow))
      joints.rightHip.push(box([0.069, -0.09, 0.03], [0.085, 0.14, 0.08], palette.brass))
      return
    case 'guard':
      joints.body.push(box([0, 0.195, 0.101], [0.285, 0.23, 0.065], palette.brass))
      joints.head.push(cylinder([0, 0.12, 0], [0.19, 0.075, 0.19], palette.lacquer))
      joints.leftArm.push(box([0, -0.06, 0], [0.16, 0.12, 0.17], palette.brass))
      joints.rightArm.push(box([0, -0.06, 0], [0.16, 0.12, 0.17], palette.brass))
      joints.leftKnee.push(box([0, -0.06, 0.05], [0.105, 0.09, 0.04], palette.gold))
      joints.rightKnee.push(box([0, -0.06, 0.05], [0.105, 0.09, 0.04], palette.gold))
      return
    case 'human':
      joints.body.push(box([-0.075, 0.215, 0.095], [0.045, 0.055, 0.016], palette.gold))
      joints.head.push(cylinder([0.04, 0.106, -0.07], [0.075, 0.085, 0.075], palette.wood))
      return
    case 'scoutrobo':
      joints.body.push(
        cylinder([0, 0.19, 0.092], [0.12, 0.11, 0.055], palette.glow),
        box([0, 0.21, -0.107], [0.13, 0.24, 0.06], palette.brass)
      )
      joints.head.push(
        box([0, 0.035, 0.092], [0.16, 0.075, 0.025], palette.ink),
        cylinder([0.081, 0.148, -0.017], [0.015, 0.075, 0.015], palette.glow)
      )
      joints.leftElbow.push(cylinder([0, -0.192, 0.035], [0.09, 0.07, 0.09], palette.brass))
      joints.rightElbow.push(cylinder([0, -0.192, 0.035], [0.09, 0.07, 0.09], palette.brass))
      return
    case 'medic':
      joints.body.push(
        box([0, 0.16, -0.115], [0.24, 0.2, 0.08], palette.paper),
        box([-0.068, 0.205, 0.098], [0.065, 0.09, 0.023], palette.paper)
      )
      joints.leftElbow.push(box([0, -0.065, 0], [0.078, 0.032, 0.089], palette.blossom))
      return
    case 'analyst':
      joints.body.push(box([0, -0.023, -0.014], [0.245, 0.15, 0.19], palette.lacquer))
      joints.head.push(
        box([0, 0.053, 0.083], [0.13, 0.025, 0.021], palette.brass),
        box([-0.082, 0.038, 0], [0.034, 0.071, 0.055], palette.ink)
      )
      return
    case 'pilot':
      joints.head.push(
        cylinder([0, 0.108, -0.006], [0.18, 0.07, 0.175], palette.copper),
        box([0.075, 0.034, 0], [0.029, 0.075, 0.052], palette.brass),
        box([0.07, 0.012, 0.058], [0.018, 0.015, 0.093], palette.ink)
      )
      joints.body.push(
        ...[-1, 1].map((side) =>
          box([side * 0.066, 0.19, 0.101], [0.026, 0.25, 0.027], palette.gold)
        )
      )
      return
    case 'mechanic':
      joints.body.push(box([0, 0.014, 0.09], [0.25, 0.047, 0.049], palette.copper))
      joints.rightHip.push(box([0.075, -0.07, 0.012], [0.065, 0.11, 0.09], palette.brass))
      joints.rightElbow.push(
        box([0.025, -0.15, 0.071], [0.022, 0.18, 0.018], palette.brass),
        box([0.025, -0.055, 0.071], [0.07, 0.023, 0.018], palette.brass)
      )
      return
  }
}
