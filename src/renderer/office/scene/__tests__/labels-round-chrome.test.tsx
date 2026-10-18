import { cleanup, render } from '@testing-library/react'
import { OrthographicCamera } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearOfObstacles, cullCards, type Rect } from '../../logic/card-culling'
import type { NameCard } from '../../logic/name-cards'
import type { OfficeLabel } from '../../logic/office-labels'
import { CardProjector, OFFSCREEN, type CardAnchors } from '../CardProjector'
import { OfficeNameProjector } from '../OfficeNames'

type FrameState = { camera: OrthographicCamera; size: { width: number; height: number } }
type FrameCallback = (state: FrameState) => void

const { frames } = vi.hoisted(() => ({ frames: [] as FrameCallback[] }))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => {
    frames.push(callback)
  }
}))

const SIZE = { width: 1440, height: 900 }
// Over the middle of the view, where the HUD floats a notice or a handle.
const CHROME: Rect = { left: 560, top: 150, right: 860, bottom: 600 }

function deskCamera(zoom: number): OrthographicCamera {
  const camera = new OrthographicCamera(-720, 720, 450, -450, 1, 400)
  camera.zoom = zoom
  camera.updateProjectionMatrix()
  camera.position.set(0, 35, 30)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

function floatChrome(rect: Rect): HTMLElement {
  const element = document.createElement('div')
  element.dataset.canvasObstacle = ''
  element.getBoundingClientRect = () =>
    ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }) as DOMRect
  document.body.append(element)
  return element
}

function sized(layer: HTMLElement, width: number, height: number): HTMLElement {
  const element = document.createElement('div')
  Object.defineProperty(element, 'offsetWidth', { value: width })
  Object.defineProperty(element, 'offsetHeight', { value: height })
  layer.append(element)
  return element
}

// One clock for the whole file: the shared reader keeps its last measurement for 250 ms.
let fakeNowMs = 0

function runFrames(zoom: number): void {
  // Chrome is measured at most four times a second; let a measurement fall due.
  fakeNowMs += 10_000
  vi.setSystemTime(fakeNowMs)
  for (const frame of frames) frame({ camera: deskCamera(zoom), size: SIZE })
}

const translateOf = (element: HTMLElement | undefined) =>
  /translate\(([-\d.]+)px, ([-\d.]+)px\)/
    .exec(element?.style.transform ?? '')
    ?.slice(1)
    .map(Number)

const card = (agentKey: string, x: number): NameCard => ({
  agentKey,
  sessionKey: null,
  kind: 'card',
  x,
  z: 0,
  title: agentKey,
  detail: 'Working',
  status: 'working',
  projectKey: 'p',
  updatedAtMs: 0
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  frames.length = 0
  document.querySelectorAll('[data-canvas-obstacle]').forEach((element) => element.remove())
  vi.useRealTimers()
})

describe('cards round the floating chrome', () => {
  it('a card under a floating control is moved or culled', () => {
    const safe: Rect = { left: 0, top: 0, right: 1440, bottom: 900 }
    const under = { left: 600, top: 200, right: 700, bottom: 230 }
    const outcome = cullCards(
      [
        {
          agentKey: 'under',
          projectKey: null,
          status: 'permission',
          updatedAtMs: 0,
          isSelected: false,
          rect: under
        },
        {
          agentKey: 'clear',
          projectKey: null,
          status: 'idle',
          updatedAtMs: 0,
          isSelected: false,
          rect: { left: 900, top: 200, right: 1000, bottom: 230 }
        }
      ],
      safe,
      { stackProjects: false, cap: 1, obstacles: [CHROME] }
    )
    // Covered, it is a dot, and it spends none of the cap the clear card needs.
    expect([...outcome.cards]).toEqual(['clear'])
    expect([...outcome.dots]).toEqual(['under'])
    expect(outcome.capped).toBe(0)
    expect(clearOfObstacles(under, safe, [CHROME])).toEqual({ ...under, top: 600, bottom: 630 })
  })

  it('a card under a floating control is moved or culled, as the projector draws it', () => {
    floatChrome(CHROME)
    const layer = document.createElement('div')
    const anchors: CardAnchors = {
      cards: new Map([
        ['covered', sized(layer, 100, 30)],
        ['beside', sized(layer, 100, 30)]
      ]),
      dots: new Map([
        ['covered', sized(layer, 10, 10)],
        ['beside', sized(layer, 10, 10)]
      ]),
      stacks: new Map()
    }
    const props = {
      visibleFloors: [],
      cards: [card('covered', 0), card('beside', 4)],
      stacks: [],
      anchors,
      band: 'desk' as const
    }
    const { rerender } = render(<CardProjector {...props} selectedAgentKey={null} />)
    runFrames(55)
    expect(anchors.cards.get('covered')?.style.transform).toBe(OFFSCREEN)
    expect(anchors.dots.get('covered')?.style.transform).not.toBe(OFFSCREEN)
    expect(anchors.cards.get('beside')?.style.transform).not.toBe(OFFSCREEN)

    // The selected card is never culled; it moves out from under the chrome instead.
    frames.length = 0
    rerender(<CardProjector {...props} selectedAgentKey="covered" />)
    runFrames(55)
    expect(translateOf(anchors.cards.get('covered'))?.[1]).toBe(CHROME.bottom + 30)
  })
})

describe('office names round the floating chrome', () => {
  function projectNames(labels: OfficeLabel[]) {
    const layer = document.createElement('div')
    const anchors = new Map(labels.map((label) => [label.id, sized(layer, 100, 40)]))
    render(
      <OfficeNameProjector
        labels={labels}
        anchors={anchors}
        cardAnchors={{ cards: new Map(), dots: new Map(), stacks: new Map() }}
        band="floor"
        hasInspector={false}
      />
    )
    runFrames(20)
    return anchors
  }
  const label = (id: string, x: number, isSelected = false): OfficeLabel => ({
    id,
    name: id,
    company: 'Company A',
    x,
    z: 0,
    roomIds: [],
    isSelected
  })

  it('an office name under a floating control is moved or culled', () => {
    floatChrome(CHROME)
    const anchors = projectNames([label('covered', 0), label('beside', 10)])
    expect(anchors.get('covered')?.style.transform).toBe(OFFSCREEN)
    expect(anchors.get('beside')?.style.transform).not.toBe(OFFSCREEN)
  })

  it('an office name under a floating control is moved or culled: the pinned one moves', () => {
    const corner = { left: 300, top: 60, right: 700, bottom: 120 }
    floatChrome(corner)
    const anchors = projectNames([label('chosen', 0, true)])
    expect(translateOf(anchors.get('chosen'))?.[1]).toBe(corner.bottom)
  })

  it('office names read every size before they write a transform', () => {
    const order: string[] = []
    const layer = document.createElement('div')
    const watched = (id: string) => {
      const element = document.createElement('div')
      Object.defineProperty(element, 'offsetWidth', { get: () => (order.push(`read ${id}`), 100) })
      Object.defineProperty(element, 'offsetHeight', { get: () => (order.push(`read ${id}`), 40) })
      const style = element.style
      Object.defineProperty(element, 'style', {
        value: new Proxy(style, {
          set: (target, field, value) => {
            if (field === 'transform') order.push(`write ${id}`)
            return Reflect.set(target, field, value)
          }
        })
      })
      layer.append(element)
      return element
    }
    const labels = [label('a', -6), label('b', 0), label('c', 10)]
    render(
      <OfficeNameProjector
        labels={labels}
        anchors={new Map(labels.map((entry) => [entry.id, watched(entry.id)]))}
        cardAnchors={{ cards: new Map(), dots: new Map(), stacks: new Map() }}
        band="floor"
        hasInspector={false}
      />
    )
    runFrames(20)
    const lastRead = order.findLastIndex((entry) => entry.startsWith('read'))
    const firstWrite = order.findIndex((entry) => entry.startsWith('write'))
    expect(firstWrite).toBeGreaterThan(lastRead)
  })
})
