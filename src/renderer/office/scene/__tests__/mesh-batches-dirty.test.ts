// perf-1: a dynamic batch rewrites and uploads only the parts that moved or changed visibility.
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { createBatchRoot, createMeshBatches, updateMeshBatches } from '../mesh-batches'

const MATRIX_FLOATS = 16

function rootWithThreeDesks() {
  const root = createBatchRoot()
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshStandardMaterial({ color: '#888888' })
  const desks = [0, 1, 2].map((index) => {
    const desk = new Mesh(geometry, material)
    desk.position.x = index * 2
    root.add(desk)
    return desk
  })
  return { root, desks }
}

function batchedMatrix(mesh: InstancedMesh, index: number): Matrix4 {
  const matrix = new Matrix4()
  mesh.getMatrixAt(index, matrix)
  return matrix
}

describe('mesh batches: dirty instances', () => {
  it('uploads no instance matrices on a frame where no part moved', () => {
    const { root } = rootWithThreeDesks()
    const batches = createMeshBatches(root)
    expect(batches).toHaveLength(1)
    const uploaded = batches[0].mesh.instanceMatrix.version
    updateMeshBatches(root, batches)
    updateMeshBatches(root, batches)
    expect(batches[0].mesh.instanceMatrix.version).toBe(uploaded)
  })

  it('a robot moved this frame is drawn at its new place', () => {
    const { root, desks } = rootWithThreeDesks()
    const batches = createMeshBatches(root)
    const uploaded = batches[0].mesh.instanceMatrix.version
    desks[1].position.z = 3
    updateMeshBatches(root, batches)
    expect(batches[0].mesh.instanceMatrix.version).toBeGreaterThan(uploaded)
    expect(batchedMatrix(batches[0].mesh, 1).elements[14]).toBe(3)
  })

  it('uploads only the instances that moved', () => {
    const { root, desks } = rootWithThreeDesks()
    const batches = createMeshBatches(root)
    desks[1].position.z = 3
    updateMeshBatches(root, batches)
    expect(batches[0].mesh.instanceMatrix.updateRanges).toEqual([
      { start: MATRIX_FLOATS, count: MATRIX_FLOATS }
    ])
  })

  it('a side hidden by the cutaway is hidden in the batch on the next frame', () => {
    const root = createBatchRoot()
    const side = new Group()
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    const facade = new Mesh(geometry, material)
    facade.position.x = 4
    side.add(facade)
    root.add(side, new Mesh(geometry, material))
    const batches = createMeshBatches(root)
    side.visible = false
    updateMeshBatches(root, batches)
    expect(batchedMatrix(batches[0].mesh, 0).elements[0]).toBe(0)
    side.visible = true
    updateMeshBatches(root, batches)
    expect(batchedMatrix(batches[0].mesh, 0).elements[12]).toBe(4)
  })

  it("an eased wall's new height reaches the batch", () => {
    const root = createBatchRoot()
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    const walls = new InstancedMesh(geometry, material, 2)
    walls.setMatrixAt(0, new Matrix4())
    walls.setMatrixAt(1, new Matrix4())
    root.add(walls, new Mesh(geometry, material))
    const batches = createMeshBatches(root)
    walls.setMatrixAt(1, new Matrix4().makeScale(1, 0.4, 1))
    walls.instanceMatrix.needsUpdate = true
    updateMeshBatches(root, batches)
    expect(batchedMatrix(batches[0].mesh, 1).elements[5]).toBeCloseTo(0.4)
  })
})
