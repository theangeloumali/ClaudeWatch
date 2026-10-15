import { Matte } from '../../scene/InstancedParts'
import { Parts } from '../parts'
import { UnitPart, UNIT_SHAPES } from '../unit-parts'
import type { RobotModelProps } from '../types'
import { HUMAN_PIVOT, humanParts, selectHumanAppearance } from './human-parts'
import { HUMAN_SKINS } from './palette'

// dry-new: separate elbows and knees cannot be expressed by the rigid JointedFigure.
export function HumanFrame({ agent, rig }: RobotModelProps) {
  const parts = humanParts(selectHumanAppearance(agent.agentKey), HUMAN_SKINS[agent.provider].trim)
  const [leftEye, rightEye] = parts.eyes
  return (
    <>
      <group ref={rig.base} />
      <group ref={rig.body} position={HUMAN_PIVOT.body}>
        <Parts parts={parts.joints.body} />
        <group ref={rig.legs}>
          <group ref={rig.leftHip} position={HUMAN_PIVOT.leftHip}>
            <Parts parts={parts.joints.leftHip} />
            <group ref={rig.leftKnee} position={HUMAN_PIVOT.leftKnee}>
              <Parts parts={parts.joints.leftKnee} />
            </group>
          </group>
          <group ref={rig.rightHip} position={HUMAN_PIVOT.rightHip}>
            <Parts parts={parts.joints.rightHip} />
            <group ref={rig.rightKnee} position={HUMAN_PIVOT.rightKnee}>
              <Parts parts={parts.joints.rightKnee} />
            </group>
          </group>
        </group>
        <group ref={rig.leftArm} position={HUMAN_PIVOT.leftArm}>
          <Parts parts={parts.joints.leftArm} />
          <group ref={rig.leftElbow} position={HUMAN_PIVOT.leftElbow}>
            <Parts parts={parts.joints.leftElbow} />
          </group>
        </group>
        <group ref={rig.rightArm} position={HUMAN_PIVOT.rightArm}>
          <Parts parts={parts.joints.rightArm} />
          <group ref={rig.rightElbow} position={HUMAN_PIVOT.rightElbow}>
            <Parts parts={parts.joints.rightElbow} />
            <group ref={rig.gear} position={[0, -0.19, 0.043]} visible={false}>
              <Parts parts={parts.book} />
            </group>
          </group>
        </group>
        <group ref={rig.head} position={HUMAN_PIVOT.head}>
          <Parts parts={parts.joints.head} />
          <group ref={rig.sensor} position={[0, leftEye.at[1], leftEye.at[2]]}>
            <mesh ref={rig.eye} position={[leftEye.at[0], 0, 0]} scale={leftEye.size}>
              {UNIT_SHAPES.box}
              <Matte color={leftEye.color} />
            </mesh>
            <UnitPart {...rightEye} at={[rightEye.at[0], 0, 0]} />
          </group>
        </group>
        <group ref={rig.thought} visible={false} />
      </group>
    </>
  )
}
