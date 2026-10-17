import { render } from '@testing-library/react'
import { OrthographicCamera } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { buildNameCards, buildProjectStacks } from '../../logic/name-cards'
import { CardProjector, OFFSCREEN, type CardAnchors } from '../../scene/CardProjector'
import { NameCardLayer } from '../../scene/NameCards'
import { makeActivityFrame } from './activity-fixtures'

type FrameCallback = (state: {
  camera: OrthographicCamera
  size: { width: number; height: number }
  invalidate: () => void
}) => void

const { frame } = vi.hoisted(() => {
  const frame: { callback?: FrameCallback } = {}
  return { frame }
})
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => {
    frame.callback = callback
  }
}))

describe('city activity projection', () => {
  it('does not replace worker dots with large project strips in a compact Office view', () => {
    const snapshot = makeActivityFrame(
      Array.from({ length: 5 }, () => ({ activity: 'editing', attention: 'none' }))
    )
    const cards = buildNameCards(snapshot, 'f1', null).map((card) => ({ ...card, x: 0, z: 0 }))
    const stacks = buildProjectStacks(snapshot, 'f1').map((stack) => ({ ...stack, x: 0, z: 0 }))
    const anchors: CardAnchors = { cards: new Map(), dots: new Map(), stacks: new Map() }
    const camera = new OrthographicCamera(-450, 450, 450, -450, 1, 200)
    camera.position.set(30, 35, 30)
    camera.lookAt(0, 0, 0)
    render(
      <>
        <NameCardLayer
          cards={cards}
          stacks={stacks}
          band="floor"
          selectedAgentKey={null}
          anchors={anchors}
          reviewableKeys={new Set()}
          onReview={vi.fn()}
          onFlyToZone={vi.fn()}
        />
        <CardProjector
          visibleFloors={[]}
          cards={cards}
          stacks={stacks}
          band="floor"
          selectedAgentKey={null}
          anchors={anchors}
        />
      </>
    )
    for (const element of anchors.cards.values()) {
      Object.defineProperty(element, 'offsetWidth', { value: 100 })
      Object.defineProperty(element, 'offsetHeight', { value: 30 })
    }
    expect(anchors.stacks.size).toBeGreaterThan(0)
    frame.callback?.({ camera, size: { width: 900, height: 900 }, invalidate: vi.fn() })
    for (const element of anchors.stacks.values()) expect(element.style.transform).toBe(OFFSCREEN)
  })
  it('places narrow City summaries below the bounded Offices rail', () => {
    const snapshot = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    const stacks = buildProjectStacks(snapshot, 'f1')
    const anchors: CardAnchors = { cards: new Map(), dots: new Map(), stacks: new Map() }
    const camera = new OrthographicCamera(-195, 195, 450, -450, 1, 200)
    render(
      <>
        <NameCardLayer
          cards={[]}
          stacks={stacks}
          band="building"
          selectedAgentKey={null}
          anchors={anchors}
          reviewableKeys={new Set()}
          onReview={vi.fn()}
          onFlyToZone={vi.fn()}
        />
        <CardProjector
          visibleFloors={[]}
          cards={[]}
          stacks={stacks}
          band="building"
          selectedAgentKey={null}
          anchors={anchors}
          inspectorLayout={{
            width: 366,
            viewportWidth: 390,
            viewportHeight: 900,
            topInset: 0,
            isExpanded: false
          }}
        />
      </>
    )
    frame.callback?.({ camera, size: { width: 390, height: 900 }, invalidate: vi.fn() })
    const transform = anchors.stacks.get('p_1')?.style.transform ?? ''
    const top = Number(transform.match(/translate\([^,]+px, ([\d.]+)px\)/)?.[1])
    expect(top).toBeGreaterThanOrEqual(417)
  })
  it('shows project summaries without requiring overlapping worker cards and hides worker clutter', () => {
    const snapshot = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    const cards = buildNameCards(snapshot, 'f1', null)
    const stacks = buildProjectStacks(snapshot, 'f1')
    const anchors: CardAnchors = { cards: new Map(), dots: new Map(), stacks: new Map() }
    const camera = new OrthographicCamera(-720, 720, 450, -450, 1, 200)
    camera.position.set(30, 35, 30)
    camera.lookAt(0, 0, 0)
    render(
      <>
        <NameCardLayer
          cards={cards}
          stacks={stacks}
          band="building"
          selectedAgentKey={null}
          anchors={anchors}
          reviewableKeys={new Set()}
          onReview={vi.fn()}
          onFlyToZone={vi.fn()}
        />
        <CardProjector
          visibleFloors={[]}
          cards={cards}
          stacks={stacks}
          anchors={anchors}
          band="building"
          selectedAgentKey={null}
        />
      </>
    )
    frame.callback?.({ camera, size: { width: 1440, height: 900 }, invalidate: vi.fn() })
    expect(anchors.stacks.get('p_1')?.style.transform).not.toBe(OFFSCREEN)
    expect(anchors.stacks.get('p_1')).toHaveTextContent(/1 Working/)
    expect(anchors.cards.get('worker-0')?.style.transform).toBe(OFFSCREEN)
  })
})
