import { memo, useEffect, useMemo } from 'react'
import type { WorkstationDisplay } from '../logic/workstation-displays'
import { monitorTexture } from './monitor-texture'

const WorkstationScreen = memo(function WorkstationScreen({
  x,
  y,
  z,
  width,
  height,
  rotationY,
  title,
  detail,
  color
}: WorkstationDisplay) {
  const texture = useMemo(() => monitorTexture({ title, detail, color }), [title, detail, color])
  useEffect(() => {
    texture.needsUpdate = true
    return () => texture.dispose()
  }, [texture])
  return (
    <mesh position={[x, y, z]} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
})

export function WorkstationScreens({ displays }: { displays: readonly WorkstationDisplay[] }) {
  return (
    <group>
      {displays.map((display) => (
        <WorkstationScreen key={display.agentKey} {...display} />
      ))}
    </group>
  )
}
