import { describe, expect, it } from 'vitest'
import { footprintEdges } from '../world-document-geometry'

describe('footprintEdges: the outermost edges of a group of footprints', () => {
  const rooms = [
    { x: 0, z: 0, width: 4, depth: 2 },
    { x: 6, z: 3, width: 2, depth: 4 }
  ]

  it('reaches the far side of every footprint', () => {
    expect(footprintEdges(rooms)).toEqual({ west: -2, east: 7, north: -1, south: 5 })
  })

  it('stands a margin clear of them when given one', () => {
    expect(footprintEdges(rooms, 0.5)).toEqual({ west: -2.5, east: 7.5, north: -1.5, south: 5.5 })
  })
})
