import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'
import { cityEvents } from '../../../office-live/city-events'
import { courierStore } from '../../../office-live/work-trip-store'
import { person } from '../../citizens/figure-parts'
import { citizenGeometry } from '../../citizens/figures'
import {
  COURIER_CAP,
  courierPose,
  createCourierCrew,
  type CourierPose
} from '../../logic/campus-couriers'
import type { CampusSpoke } from '../../logic/campus-geometry'
import { cityClock } from '../../logic/city-clock'
import { sceneMotion } from '../../logic/scene-motion'

// On the asphalt's top face.
const ROAD_TOP_M = 0.06
const SHIRT_INDEX = 1
const HIDDEN = new Object3D()
HIDDEN.scale.setScalar(0)
HIDDEN.updateMatrix()

// The citizen body, split so only the shirt takes the room's colour per instance.
function courierGeometries() {
  const parts = () => person({ robe: '#2a3045', coat: '#ffffff', hair: '#1a1410' })
  return {
    body: citizenGeometry({
      name: 'Campus Courier',
      parts: () => parts().filter((_, index) => index !== SHIRT_INDEX)
    }),
    shirt: citizenGeometry({ name: 'Campus Courier Shirt', parts: () => [parts()[SHIRT_INDEX]] })
  }
}

interface CampusCouriersProps {
  spokes: readonly CampusSpoke[]
  chipOf: (spoke: CampusSpoke) => string
  isReducedMotion: boolean
}

// A figure per sampled tool call, walking its room's spoke to the hub rim and back.
export function CampusCouriers({ spokes, chipOf, isReducedMotion }: CampusCouriersProps) {
  const geometries = useMemo(courierGeometries, [])
  useEffect(
    () => () => {
      geometries.body.dispose()
      geometries.shirt.dispose()
    },
    [geometries]
  )
  const crew = useMemo(createCourierCrew, [])
  // Read in the frame loop, so a relayout reaches it without a new loop.
  const spokesRef = useRef(new Map<string, { spoke: CampusSpoke; chip: Color }>())
  useEffect(() => {
    spokesRef.current = new Map(
      spokes.map((spoke) => [spoke.buildingId, { spoke, chip: new Color(chipOf(spoke)) }])
    )
  }, [spokes, chipOf])
  const bodyRef = useRef<InstancedMesh>(null)
  const shirtRef = useRef<InstancedMesh>(null)
  const shownRef = useRef(0)
  const scratch = useMemo(() => new Object3D(), [])
  const pose = useMemo<CourierPose>(() => ({ x: 0, z: 0, heading: 0 }), [])

  useFrame(() => {
    const body = bodyRef.current
    const shirt = shirtRef.current
    if (!body || !shirt) return
    const nowMs = cityClock.now()
    // Drained even when stilled, so calls made under reduced motion never walk out later.
    for (const request of courierStore.take(cityEvents.active())) {
      if (!isReducedMotion)
        crew.dispatch(request, spokesRef.current.get(request.buildingId)?.spoke, nowMs)
    }
    const walking = crew.step(nowMs)
    if (walking.length === 0 && shownRef.current === 0) return
    if (walking.length > 0) sceneMotion.mark()
    walking.forEach((courier, slot) => {
      courierPose(courier, nowMs, pose)
      scratch.position.set(pose.x, ROAD_TOP_M, pose.z)
      scratch.rotation.y = pose.heading
      scratch.updateMatrix()
      body.setMatrixAt(slot, scratch.matrix)
      shirt.setMatrixAt(slot, scratch.matrix)
      const chip = spokesRef.current.get(courier.buildingId)?.chip
      if (chip) shirt.setColorAt(slot, chip)
    })
    for (let slot = walking.length; slot < shownRef.current; slot++) {
      body.setMatrixAt(slot, HIDDEN.matrix)
      shirt.setMatrixAt(slot, HIDDEN.matrix)
    }
    shownRef.current = walking.length
    body.instanceMatrix.needsUpdate = true
    shirt.instanceMatrix.needsUpdate = true
    if (shirt.instanceColor) shirt.instanceColor.needsUpdate = true
  })

  // Every slot starts hidden; the frame loop shows only the ones walking.
  const hideAll = (mesh: InstancedMesh | null): void => {
    if (!mesh) return
    for (let slot = 0; slot < COURIER_CAP; slot++) mesh.setMatrixAt(slot, HIDDEN.matrix)
    mesh.instanceMatrix.needsUpdate = true
  }
  return (
    <>
      <instancedMesh
        name="campus-couriers"
        ref={(mesh) => {
          bodyRef.current = mesh
          hideAll(mesh)
        }}
        args={[geometries.body, undefined, COURIER_CAP]}
        frustumCulled={false}
      >
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0.05} />
      </instancedMesh>
      <instancedMesh
        name="campus-courier-shirts"
        ref={(mesh) => {
          shirtRef.current = mesh
          hideAll(mesh)
          // A white instance colour until a courier claims the slot, so instanceColor exists.
          if (mesh && !mesh.instanceColor) mesh.setColorAt(0, new Color('#ffffff'))
        }}
        args={[geometries.shirt, undefined, COURIER_CAP]}
        frustumCulled={false}
      >
        <meshStandardMaterial vertexColors roughness={0.7} metalness={0.05} />
      </instancedMesh>
    </>
  )
}
