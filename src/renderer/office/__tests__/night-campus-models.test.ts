import { describe, expect, it } from 'vitest'
import { DESK_REACH } from '../logic/room-layout'
import { WORKSTATIONS } from '../themes/workstations'
import {
  BakedGeometry,
  CAMPUS_MODELS,
  decodeBakedGlb,
  deskModelBoxes,
  fitTransform
} from '../themes/night-campus/glb-props'
import { MINI_PERSON_JOINTS, miniBodyY, miniRigPositions } from '../themes/night-campus/mini-pose'
import {
  campusPropPlacements,
  campusRoomParts,
  campusRoomShell
} from '../themes/night-campus/room-parts'
import { makeFloor } from './fixtures'

const FURNITURE_KINDS = [
  'desk',
  'chair',
  'monitor',
  'keyboard',
  'lamp',
  'plant',
  'bookshelf',
  'sofa'
]

describe('campus models', () => {
  it('decodes every furniture kind and person joint from the committed GLBs', () => {
    expect(CAMPUS_MODELS).not.toBeNull()
    for (const kind of FURNITURE_KINDS) expect(CAMPUS_MODELS?.furniture.get(kind)).toBeDefined()
    for (const joint of MINI_PERSON_JOINTS) expect(CAMPUS_MODELS?.person.get(joint)).toBeDefined()
  })

  it('gives each kind a parameters key, so BatchedScene merges every copy into one draw', () => {
    const desk = CAMPUS_MODELS?.furniture.get('desk')?.geometry
    expect(desk).toBeInstanceOf(BakedGeometry)
    const json = desk?.toJSON()
    expect(json).toMatchObject({ type: 'BakedGeometry', bakedProp: 'campus-furniture:desk' })
    expect(json).not.toHaveProperty('data')
  })

  it('carries vertex colours and a joint pivot', () => {
    const head = CAMPUS_MODELS?.person.get('head')
    expect(head?.geometry.getAttribute('color').itemSize).toBe(3)
    expect(head?.pivot[1]).toBeGreaterThan(0.3)
  })

  it('returns null for bytes that are not a GLB', () => {
    expect(decodeBakedGlb(new Uint8Array([1, 2, 3, 4]).buffer, 'x')).toBeNull()
  })

  it('fits a part into its box, standing on the box floor', () => {
    const chair = CAMPUS_MODELS?.furniture.get('chair')
    if (!chair) throw new Error('chair missing')
    const fit = fitTransform(chair, { at: [0, 0, 0], size: [0.42, 0.665, 0.4] })
    expect(chair.size[1] * fit.scale[1]).toBeCloseTo(0.665)
    expect(chair.size[0] * fit.scale[0]).toBeCloseTo(0.42)
  })

  it('keeps the desk at the reach the seat expects, with the monitor turned to the chair', () => {
    const boxes = deskModelBoxes()
    expect(boxes.desk.at[2]).toBeCloseTo(DESK_REACH)
    expect(boxes.chair.at).toEqual([0, 0, 0])
    expect(boxes.monitor.yaw).toBeCloseTo(Math.PI)
    // The monitor face sits just behind the live screen plane, so that plane stays in front.
    const face = boxes.monitor.at[2] - boxes.monitor.size[2] / 2
    expect(face).toBeGreaterThan(WORKSTATIONS.corporate.screen[2])
  })
})

describe('campus room placements', () => {
  const floor = makeFloor({ floorId: 'f', x: 0, z: 0, width: 16, depth: 12 })

  it('splits the room into its shell and props without changing a part', () => {
    const colors = { slab: '#3FA65B', rug: '#C9EBCF', wall: '#2E7F45', chip: '#34C759' }
    const props = campusPropPlacements(floor)
    expect(props.map((placement) => placement.kind)).toContain('bookshelf')
    expect([...campusRoomShell(floor, colors), ...props.flatMap((prop) => prop.parts)]).toEqual(
      campusRoomParts(floor, colors)
    )
  })

  it('gives each wall prop an origin on the plate edge and a yaw into the room', () => {
    const shelf = campusPropPlacements(floor).find((placement) => placement.kind === 'bookshelf')
    if (!shelf) throw new Error('no bookshelf')
    const onEdge = Math.abs(Math.abs(shelf.x) - 8) < 1e-9 || Math.abs(Math.abs(shelf.z) - 6) < 1e-9
    expect(onEdge).toBe(true)
  })
})

describe('mini person rig', () => {
  it('puts the rig left limbs on -x, as the human frame does, and the head above the hips', () => {
    if (!CAMPUS_MODELS) throw new Error('models missing')
    const rig = miniRigPositions(CAMPUS_MODELS.person)
    expect(rig.leftArm[0]).toBeLessThan(0)
    expect(rig.leftHip[0]).toBeLessThan(0)
    expect(rig.rightArm[0]).toBeGreaterThan(0)
    expect(rig.head[1]).toBeGreaterThan(0.2)
  })
})

describe('miniBodyY', () => {
  it('maps the human seated and standing hip heights onto the mini figure', () => {
    const seated = miniBodyY(0.3)
    const standing = miniBodyY(0.55)
    expect(seated).toBeGreaterThan(0.25)
    expect(standing).toBeGreaterThan(0.2)
    expect(miniBodyY(0.425)).toBeCloseTo((seated + standing) / 2)
  })
})
