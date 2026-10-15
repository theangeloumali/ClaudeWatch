import { useMemo } from 'react'
import { HUMAN_PIVOT } from '../corporate-city/human-parts'
import { Parts } from '../parts'
import { agentHash } from '../roster'
import type { RobotModelProps } from '../types'
import { UnitPart, UNIT_SHAPES } from '../unit-parts'
import { Matte } from '../../scene/InstancedParts'
import { characterParts, type CharacterParts } from './character-parts'
import { CYBERPUNK_PALETTE } from './palette'
import { CYBERPUNK_CAST, cyberpunkRoster } from './roster'

const LIMBS = [
  { shoulder: 'leftArm', elbow: 'leftElbow', hip: 'leftHip', knee: 'leftKnee' },
  { shoulder: 'rightArm', elbow: 'rightElbow', hip: 'rightHip', knee: 'rightKnee' }
] as const

// dry-new: JointedFigure lacks elbows/knees; the human frame cannot accept authored role parts.
export function CyberpunkCharacter({ agent, rosterIndex, skin, rig }: RobotModelProps) {
  const castIndex = cyberpunkRoster.indexFor(agent, rosterIndex)
  const kind = CYBERPUNK_CAST[castIndex].kind
  const parts = useMemo(
    () =>
      characterParts({
        kind,
        palette: { ...CYBERPUNK_PALETTE, lacquer: skin.body, gold: skin.trim },
        variant: agentHash(agent.agentKey) % 6
      }),
    [kind, skin.body, skin.trim, agent.agentKey]
  )
  return <ArticulatedCharacter parts={parts} rig={rig} />
}

function ArticulatedCharacter({
  parts,
  rig
}: {
  parts: CharacterParts
  rig: RobotModelProps['rig']
}) {
  const [leftEye, rightEye] = parts.eyes
  return (
    <>
      <group ref={rig.base} />
      <group ref={rig.body} position={HUMAN_PIVOT.body}>
        <Parts parts={parts.joints.body} />
        <group ref={rig.legs}>
          {LIMBS.map(({ hip, knee }) => (
            <group key={hip} ref={rig[hip]} position={HUMAN_PIVOT[hip]}>
              <Parts parts={parts.joints[hip]} />
              <group ref={rig[knee]} position={HUMAN_PIVOT[knee]}>
                <Parts parts={parts.joints[knee]} />
              </group>
            </group>
          ))}
        </group>
        {LIMBS.map(({ shoulder, elbow }) => (
          <group key={shoulder} ref={rig[shoulder]} position={HUMAN_PIVOT[shoulder]}>
            <Parts parts={parts.joints[shoulder]} />
            <group ref={rig[elbow]} position={HUMAN_PIVOT[elbow]}>
              <Parts parts={parts.joints[elbow]} />
              {shoulder === 'rightArm' && (
                <group ref={rig.gear} position={[0, -0.19, 0.043]} visible={false}>
                  <Parts parts={parts.book} />
                </group>
              )}
            </group>
          </group>
        ))}
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
