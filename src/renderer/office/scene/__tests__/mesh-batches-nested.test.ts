// perf-11: a batch nested in another owns its parts, so each rebuilds without the other.
import { BoxGeometry, Mesh, MeshStandardMaterial, type Group } from 'three'
import { describe, expect, it } from 'vitest'
import {
  createBatchRoot,
  createMeshBatches,
  freezeMatrices,
  releaseMeshBatches,
  thawMatrices
} from '../mesh-batches'

const geometry = new BoxGeometry(1, 1, 1)
const material = new MeshStandardMaterial({ color: '#888888' })

function addParts(root: Group, count: number): Mesh[] {
  return Array.from({ length: count }, (_, index) => {
    const part = new Mesh(geometry, material)
    part.position.x = index * 2
    root.add(part)
    return part
  })
}

// Layout effects run child first, so the nested batch is built before the one around it.
function floorWithCrew() {
  const floor = createBatchRoot()
  const crew = createBatchRoot()
  const desks = addParts(floor, 3)
  const robots = addParts(crew, 2)
  floor.add(crew)
  const crewBatches = createMeshBatches(crew)
  return { floor, crew, desks, robots, crewBatches }
}

describe('mesh batches: a batch nested in another', () => {
  it('the outer batch leaves out the nested batch, its parts and its instances', () => {
    const { floor, crewBatches } = floorWithCrew()
    const floorBatches = createMeshBatches(floor)
    expect(crewBatches.map((batch) => batch.mesh.count)).toEqual([2])
    expect(floorBatches.map((batch) => batch.mesh.count)).toEqual([3])
  })

  it('rebuilding the outer batch leaves the nested batch drawing its parts', () => {
    const { floor, crew, robots, crewBatches } = floorWithCrew()
    releaseMeshBatches(floor, createMeshBatches(floor))
    createMeshBatches(floor)
    expect(robots.every((robot) => !robot.layers.isEnabled(0))).toBe(true)
    expect(crew.children).toContain(crewBatches[0].mesh)
    expect(crewBatches[0].mesh.layers.isEnabled(0)).toBe(true)
  })

  it('freezing a static outer batch leaves the nested parts free to move', () => {
    const { floor, desks, robots } = floorWithCrew()
    thawMatrices(floor)
    freezeMatrices(floor)
    expect(desks.every((desk) => !desk.matrixAutoUpdate)).toBe(true)
    expect(robots.every((robot) => robot.matrixAutoUpdate)).toBe(true)
  })
})
