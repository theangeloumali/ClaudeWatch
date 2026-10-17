import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { OrthographicCamera } from 'three'
import {
  OfficeNameLayer,
  OfficeNameProjector,
  type OfficeNameAnchors
} from '../../scene/OfficeNames'
import { OFFSCREEN } from '../../scene/CardProjector'
import type { OfficeLabel } from '../../logic/office-labels'

type FrameCallback = (state: {
  camera: OrthographicCamera
  size: { width: number; height: number }
}) => void
const frame = vi.hoisted(() => ({ callback: null as FrameCallback | null }))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => {
    frame.callback = callback
  }
}))
const label: OfficeLabel = {
  id: 'p1',
  name: '日本 · Complete infrastructure project name',
  company: 'ZKidz',
  x: 0,
  z: 0,
  roomIds: ['r1'],
  isSelected: true
}

it('keeps the selected full office name readable in safe headroom, independent of camera yaw/pitch', () => {
  const anchors: OfficeNameAnchors = new Map()
  const view = render(
    <>
      <OfficeNameLayer labels={[label]} anchors={anchors} />
      <OfficeNameProjector
        labels={[label]}
        anchors={anchors}
        cardAnchors={{ cards: new Map(), dots: new Map(), stacks: new Map() }}
        band="desk"
        hasInspector
      />
    </>
  )
  const element = anchors.get('p1')!
  Object.defineProperties(element, { offsetWidth: { value: 240 }, offsetHeight: { value: 42 } })
  const camera = new OrthographicCamera(-720, 720, 450, -450, 0.1, 1000)
  camera.position.set(-30, 10, -25)
  camera.lookAt(0, 0, 0)
  frame.callback?.({ camera, size: { width: 1440, height: 900 } })
  expect(element.style.transform).not.toBe(OFFSCREEN)
  expect(element.textContent).toContain(label.name)
  camera.position.set(5, 40, 30)
  frame.callback?.({ camera, size: { width: 1440, height: 900 } })
  expect(element.style.transform).not.toBe(OFFSCREEN)
  view.unmount()
  expect(anchors.size).toBe(0)
})

it('keeps office names at city scale and hides the rooms not selected', () => {
  const office = document.createElement('div')
  const room = document.createElement('div')
  const anchors = new Map([
    ['p1', office],
    ['r1', room]
  ])
  const roomLabel: OfficeLabel = { ...label, id: 'r1', kind: 'room', isSelected: false }
  render(
    <OfficeNameProjector
      labels={[label, roomLabel]}
      anchors={anchors}
      cardAnchors={{ cards: new Map(), dots: new Map(), stacks: new Map() }}
      band="building"
      hasInspector={false}
    />
  )
  frame.callback?.({ camera: new OrthographicCamera(), size: { width: 900, height: 700 } })
  expect(office.style.transform).not.toBe(OFFSCREEN)
  expect(room.style.transform).toBe(OFFSCREEN)
})
