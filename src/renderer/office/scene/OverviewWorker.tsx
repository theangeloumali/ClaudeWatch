import type { RobotModelProps } from '../themes/types'
import { UnitPart } from '../themes/unit-parts'
import { HUMAN_PIVOT } from '../themes/corporate-city/human-parts'

// The low-detail silhouette shares the human joints, including real seated knees.
export function OverviewWorker({ rig, skin }: RobotModelProps) {
  return (
    <group ref={rig.body} position={HUMAN_PIVOT.body}>
      <UnitPart shape="box" at={[0, 0.18, 0]} size={[0.29, 0.36, 0.19]} color={skin.body} />
      <group ref={rig.head} position={HUMAN_PIVOT.head}>
        <UnitPart shape="box" size={[0.18, 0.21, 0.18]} color={skin.trim} />
        <UnitPart shape="box" at={[0, 0, 0.1]} size={[0.13, 0.025, 0.02]} color={skin.eye} />
      </group>
      {(['left', 'right'] as const).map((side) => (
        <group
          key={side}
          ref={side === 'left' ? rig.leftArm : rig.rightArm}
          position={side === 'left' ? HUMAN_PIVOT.leftArm : HUMAN_PIVOT.rightArm}
        >
          <UnitPart shape="box" at={[0, -0.095, 0]} size={[0.08, 0.19, 0.09]} color={skin.body} />
          <group
            ref={side === 'left' ? rig.leftElbow : rig.rightElbow}
            position={HUMAN_PIVOT.leftElbow}
          >
            <UnitPart shape="box" at={[0, -0.1, 0]} size={[0.07, 0.2, 0.08]} color={skin.body} />
          </group>
        </group>
      ))}
      {(['left', 'right'] as const).map((side) => (
        <group
          key={side}
          ref={side === 'left' ? rig.leftHip : rig.rightHip}
          position={side === 'left' ? HUMAN_PIVOT.leftHip : HUMAN_PIVOT.rightHip}
        >
          <UnitPart shape="box" at={[0, -0.125, 0]} size={[0.1, 0.25, 0.12]} color={skin.trim} />
          <group
            ref={side === 'left' ? rig.leftKnee : rig.rightKnee}
            position={HUMAN_PIVOT.leftKnee}
          >
            <UnitPart shape="box" at={[0, -0.15, 0]} size={[0.09, 0.3, 0.11]} color={skin.trim} />
          </group>
        </group>
      ))}
    </group>
  )
}
