import { describe, expect, it } from 'vitest'
import type { CampusSpoke } from '../../logic/campus-geometry'
import { campusPacketPaths } from '../../logic/campus-packets'

const spoke = (projectKey: string, x: number): CampusSpoke => ({
  buildingId: `b-${projectKey}`,
  projectKey,
  from: { x, z: 0 },
  to: { x: x / 4, z: 0 }
})

describe('campusPacketPaths', () => {
  const core = { x: 0, y: 4, z: 0 }
  const paths = campusPacketPaths([spoke('a', 20), spoke('b', -20)], core)

  it('gives every room one road path and one arc path', () => {
    expect(paths.filter((path) => path.kind === 'road')).toHaveLength(2)
    expect(paths.filter((path) => path.kind === 'arc')).toHaveLength(2)
  })

  it('runs a road from the room end to the hub end, straight along the ground', () => {
    const road = paths.find((path) => path.kind === 'road' && path.projectKey === 'a')
    expect(road?.from.x).toBe(20)
    expect(road?.to.x).toBe(5)
    expect(road?.control).toEqual({ x: 12.5, y: road?.from.y, z: 0 })
  })

  it('lifts an arc from the room up to the core', () => {
    const arc = paths.find((path) => path.kind === 'arc' && path.projectKey === 'b')
    expect(arc?.from.x).toBe(-20)
    expect(arc?.to).toEqual(core)
    expect(arc?.control.y).toBeGreaterThan(core.y)
  })
})
