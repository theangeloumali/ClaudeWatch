import { render } from '@testing-library/react'
import { OrthographicCamera, Vector3 } from 'three'
import { expect, it, vi } from 'vitest'
import type { NameCard } from '../logic/name-cards'
import { CARD_HEIGHT, CardProjector, type CardAnchors } from './CardProjector'

type FrameCallback = (state: {
  camera: OrthographicCamera
  size: { width: number; height: number }
}) => void

const { frame } = vi.hoisted(() => ({ frame: { callback: null as FrameCallback | null } }))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => {
    frame.callback = callback
  }
}))

const SIZE = { width: 1440, height: 900 }
const CARD: NameCard = {
  agentKey: 'a',
  sessionKey: null,
  kind: 'card',
  x: 6,
  z: -3,
  title: 'A',
  detail: 'Working',
  status: 'working',
  projectKey: 'p',
  updatedAtMs: 0
}

function readTranslate(element: HTMLElement): { x: number; y: number } {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(element.style.transform)
  return { x: Number(match?.[1]), y: Number(match?.[2]) }
}

it('places a card where the camera will draw it, even before the renderer refreshes the matrix', () => {
  const camera = new OrthographicCamera(-720, 720, 450, -450, 1, 200)
  camera.zoom = 40
  camera.updateProjectionMatrix()
  camera.position.set(30, 35, 30)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()

  const element = document.createElement('div')
  const anchors: CardAnchors = {
    cards: new Map([['a', element]]),
    dots: new Map(),
    stacks: new Map()
  }
  render(
    <CardProjector
      visibleFloors={[]}
      cards={[CARD]}
      stacks={[]}
      anchors={anchors}
      band="desk"
      selectedAgentKey={null}
    />
  )

  // What camera-controls leaves behind mid-rotation: a new pose, a stale world matrix.
  camera.position.set(-30, 35, 30)
  camera.quaternion.setFromRotationMatrix(
    camera.matrix.clone().lookAt(camera.position, new Vector3(0, 0, 0), camera.up)
  )
  frame.callback?.({ camera, size: SIZE })

  const fresh = camera.clone()
  fresh.updateMatrixWorld()
  const expected = new Vector3(CARD.x, CARD_HEIGHT, CARD.z).project(fresh)
  const placed = readTranslate(element)
  expect(placed.x).toBeCloseTo(((expected.x + 1) / 2) * SIZE.width, 3)
  expect(placed.y).toBeCloseTo(((1 - expected.y) / 2) * SIZE.height, 3)
})
