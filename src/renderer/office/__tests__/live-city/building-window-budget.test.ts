import { BoxGeometry, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { expect, it } from 'vitest'
import { makeFloor } from '../fixtures'
import { getTheme, themeForTeam } from '../../themes/registry'
import { windowParts } from '../../scene/building-window-parts'
import {
  createBatchRoot,
  createMeshBatches,
  releaseMeshBatches,
  SHARED_BATCH
} from '../../scene/mesh-batches'

it.each([1, 2, 3])(
  'batches %i mixed-theme physical window storeys into at most four draws',
  (count) => {
    const root = createBatchRoot()
    const geometry = new BoxGeometry(1, 1, 1)
    const palettes = [
      getTheme('corporate-city').palette,
      getTheme('samurai-empire').palette,
      themeForTeam().palette
    ]
    const materials = palettes.map((palette) => ({
      frame: new MeshStandardMaterial({ color: palette.lacquer }),
      band: new MeshStandardMaterial({ color: palette.stone }),
      glass: new MeshBasicMaterial({
        color: palette.paper,
        transparent: true,
        opacity: 0.14,
        depthWrite: false
      })
    }))
    for (let index = 0; index < count; index++) {
      const floor = { ...makeFloor({ floorId: `f:${index}` }), elevation: index * 5.5 }
      for (const part of windowParts(floor)) {
        const mesh = new Mesh(geometry, materials[index][part.kind])
        mesh.position.set(...part.position)
        mesh.scale.set(...part.size)
        if (part.kind === 'glass')
          mesh.userData[SHARED_BATCH] = `physical-building-glass:${palettes[index].paper}`
        root.add(mesh)
      }
    }
    const batches = createMeshBatches(root)
    const drawn: Mesh[] = []
    root.traverse((object) => {
      if (object instanceof Mesh && object.layers.isEnabled(0)) drawn.push(object)
    })
    expect(drawn.length).toBeLessThanOrEqual(4)
    const triangles = drawn.reduce(
      (sum, mesh) =>
        sum +
        ((mesh.geometry.index?.count ?? 0) / 3) * (mesh instanceof InstancedMesh ? mesh.count : 1),
      0
    )
    expect(triangles).toBeLessThan(10000)
    releaseMeshBatches(root, batches)
    geometry.dispose()
    for (const set of materials) for (const material of Object.values(set)) material.dispose()
  }
)
