import { CameraControlsImpl } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3, type Mesh } from 'three'
import { clipPlanes, groundCover, type CameraPose, type SceneBox } from '../logic/camera-bands'
import { markHeadroomM } from './city-marks'
import { Matte } from './InstancedParts'

const FLAT = -Math.PI / 2
// Rounding moves the planes by less than this every frame; rebuilding the projection for it is waste.
const PLANE_EPSILON_M = 1e-3

// Nothing is cut off: each frame the camera's planes are fitted to the scene, and one square of
// ground in the floor theme's colour is laid under the whole view, so the floor never ends in a void.
export function Horizon({ box, color }: { box: SceneBox; color: string }) {
  const groundRef = useRef<Mesh>(null)
  const forward = useMemo(() => new Vector3(), [])
  const up = useMemo(() => new Vector3(), [])
  // After camera-controls (priority -1), so the pose is this frame's.
  useFrame(({ camera, size, controls }) => {
    const pose: CameraPose = {
      position: camera.position,
      forward: camera.getWorldDirection(forward),
      halfWidth: size.width / 2 / camera.zoom,
      halfHeight: size.height / 2 / camera.zoom
    }
    // Signs and crowns keep their size on screen, so their room grows as the camera pulls out.
    const upY = up.set(0, 1, 0).applyQuaternion(camera.quaternion).y
    const planes = clipPlanes({ ...box, maxY: box.maxY + markHeadroomM(camera.zoom, upY) }, pose)
    if (planes.pushBack > 0) {
      // Orthographic: distance changes what is clipped and picked, never the picture.
      camera.position.addScaledVector(forward, -planes.pushBack)
      if (controls instanceof CameraControlsImpl)
        void controls.dollyTo(controls.distance + planes.pushBack, false)
    }
    const hasMoved =
      Math.abs(camera.near - planes.near) > PLANE_EPSILON_M ||
      Math.abs(camera.far - planes.far) > PLANE_EPSILON_M
    if (hasMoved) {
      camera.near = planes.near
      camera.far = planes.far
      camera.updateProjectionMatrix()
    }
    const ground = groundRef.current
    if (!ground) return
    const cover = groundCover(box.minY, pose)
    ground.position.set(cover.x, box.minY, cover.z)
    ground.scale.set(cover.size, cover.size, 1)
  })
  return (
    <mesh ref={groundRef} rotation={[FLAT, 0, 0]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <Matte color={color} />
    </mesh>
  )
}
