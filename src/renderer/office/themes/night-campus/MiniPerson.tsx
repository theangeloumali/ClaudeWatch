import { HumanFrame } from '../corporate-city/HumanFrame'
import type { RobotModelProps } from '../types'
import { BakedMaterial } from './BakedMesh'
import { CAMPUS_MODELS } from './glb-props'
import { MINI_BODY_FLAG, MINI_JOINT_OF, MINI_SCALE, miniRigPositions } from './mini-pose'
import { NIGHT_CAMPUS_SKINS } from './palette'

const MINI_BODY_DATA = { [MINI_BODY_FLAG]: true }
const SCALE: [number, number, number] = [MINI_SCALE, MINI_SCALE, MINI_SCALE]
const MINI_AT = CAMPUS_MODELS && miniRigPositions(CAMPUS_MODELS.person)

// One Kenney mesh at the joint origin; cloth is greyscale, so the provider colour tints it.
function Piece({ name, color }: { name: string; color?: string }) {
  const part = CAMPUS_MODELS?.person.get(name)
  if (!part) return null
  return (
    <mesh geometry={part.geometry} scale={SCALE}>
      <BakedMaterial color={color} />
    </mesh>
  )
}

// The Kenney mini character on the RobotRig groups, posed by the human pose. Knees, the eye and
// the reading prop are empty groups it does not draw.
export function MiniPerson(props: RobotModelProps) {
  if (!MINI_AT) return <HumanFrame {...props} />
  const { agent, rig } = props
  const cloth = NIGHT_CAMPUS_SKINS[agent.provider].body
  const at = MINI_AT
  const leftArm = MINI_JOINT_OF.leftArm
  const rightArm = MINI_JOINT_OF.rightArm
  return (
    <>
      <group ref={rig.base} />
      <group ref={rig.body} userData={MINI_BODY_DATA}>
        <Piece name="torso" />
        <Piece name="torso-cloth" color={cloth} />
        <group ref={rig.legs}>
          <group ref={rig.leftHip} position={at.leftHip}>
            <Piece name={MINI_JOINT_OF.leftHip} />
            <group ref={rig.leftKnee} />
          </group>
          <group ref={rig.rightHip} position={at.rightHip}>
            <Piece name={MINI_JOINT_OF.rightHip} />
            <group ref={rig.rightKnee} />
          </group>
        </group>
        <group ref={rig.leftArm} position={at.leftArm}>
          <group ref={rig.leftElbow}>
            <Piece name={leftArm} />
            <Piece name={`${leftArm}-cloth`} color={cloth} />
          </group>
        </group>
        <group ref={rig.rightArm} position={at.rightArm}>
          <group ref={rig.rightElbow}>
            <Piece name={rightArm} />
            <Piece name={`${rightArm}-cloth`} color={cloth} />
            <group ref={rig.gear} visible={false} />
          </group>
        </group>
        <group ref={rig.head} position={at.head}>
          <Piece name="head" />
          <group ref={rig.sensor}>
            <mesh ref={rig.eye} visible={false} />
          </group>
        </group>
        <group ref={rig.thought} visible={false} />
      </group>
    </>
  )
}
