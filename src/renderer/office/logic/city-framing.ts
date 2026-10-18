import { boundsOfZone, type Bounds } from './zone-framing'
import type { FloorGeometry } from '../scene-model'
import { MAX_LOT_HEIGHT_M } from '../themes/surroundings'
import type { floorEnvelope } from '../scene/all-floor-model'

// dry-new: the office fit excludes scenery; the full scene extent includes a distracting far belt.
export function nearCityBounds({
  scene,
  floor,
  envelope
}: {
  scene: { x?: number; z?: number; width: number; depth: number }
  floor: FloorGeometry
  envelope: ReturnType<typeof floorEnvelope>
}): Bounds {
  const footprint = boundsOfZone({ ...scene, x: scene.x ?? floor.x, z: scene.z ?? floor.z })
  if (!envelope) return footprint
  const offices = boundsOfZone(envelope)
  const apron = MAX_LOT_HEIGHT_M * 2
  return {
    minX: Math.min(offices.minX, Math.max(footprint.minX, offices.minX - apron)),
    maxX: Math.max(offices.maxX, Math.min(footprint.maxX, offices.maxX + apron)),
    minZ: Math.min(offices.minZ, Math.max(footprint.minZ, offices.minZ - apron)),
    maxZ: Math.max(offices.maxZ, Math.min(footprint.maxZ, offices.maxZ + apron))
  }
}
