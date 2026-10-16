import { cleanup, render } from '@testing-library/react'
import { OrthographicCamera } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NameCard } from '../../logic/name-cards'
import { pinQuality } from '../../quality-store'
import { CardProjector, OFFSCREEN, type CardAnchors } from '../CardProjector'

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
const CARD_WIDTH_PX = 100
const CARD_HEIGHT_PX = 30

afterEach(() => {
  cleanup()
  pinQuality('auto')
  frame.callback = null
})

function cardAt(agentKey: string, x: number, z: number, overrides: Partial<NameCard> = {}) {
  return {
    agentKey,
    sessionKey: null,
    kind: 'card',
    x,
    z,
    title: agentKey,
    detail: 'Working',
    status: 'working',
    projectKey: 'p',
    updatedAtMs: 0,
    ...overrides
  } satisfies NameCard
}

// A desk-zoom orthographic camera looking north, so world x is screen x at `zoom` px per metre.
function deskCamera(zoom: number): OrthographicCamera {
  const camera = new OrthographicCamera(-720, 720, 450, -450, 1, 400)
  camera.zoom = zoom
  camera.updateProjectionMatrix()
  camera.position.set(0, 35, 30)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

// Card, dot and badge elements in one layer, measured the way the browser would lay them out.
function project(cards: readonly NameCard[], zoom: number, selectedAgentKey: string | null = null) {
  const layer = document.createElement('div')
  const sized = () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'offsetWidth', { value: CARD_WIDTH_PX })
    Object.defineProperty(element, 'offsetHeight', { value: CARD_HEIGHT_PX })
    layer.append(element)
    return element
  }
  const anchors: CardAnchors = {
    cards: new Map(cards.map((card) => [card.agentKey, sized()])),
    dots: new Map(cards.map((card) => [card.agentKey, sized()])),
    stacks: new Map([['p', sized()]])
  }
  render(
    <CardProjector
      cards={cards}
      stacks={[{ projectKey: 'p', zoneId: null, x: 0, z: 0, text: 'p · 5 agents' }]}
      anchors={anchors}
      band="desk"
      selectedAgentKey={selectedAgentKey}
    />
  )
  frame.callback?.({ camera: deskCamera(zoom), size: SIZE })
  const shown = (elements: Map<string, HTMLElement>) =>
    [...elements]
      .filter(([, element]) => element.style.transform !== OFFSCREEN)
      .map(([key]) => key)
      .sort()
  const badge = layer.querySelector<HTMLElement>('[data-card-overflow]')
  return {
    cards: shown(anchors.cards),
    dots: shown(anchors.dots),
    stacks: shown(anchors.stacks),
    overflow: badge && badge.style.transform !== OFFSCREEN ? badge.textContent : null
  }
}

// Seven across, two deep, 2 m apart: 110 px at zoom 55, so no two cards touch.
const crowd = Array.from({ length: 14 }, (_, index) =>
  cardAt(`agent-${String(index).padStart(2, '0')}`, ((index % 7) - 3) * 2, index < 7 ? -2 : 2)
)

describe('desk-zoom name cards (clearspent-3, P9)', () => {
  it('two robots 0.5 m apart at zoom 90 show one card and one dot', () => {
    const outcome = project([cardAt('a', 0, 0), cardAt('b', 0.5, 0)], 90)
    expect(outcome.cards).toHaveLength(1)
    expect(outcome.dots).toHaveLength(1)
    expect([...outcome.cards, ...outcome.dots].sort()).toEqual(['a', 'b'])
  })

  it('two working agents at adjacent desks whose cards don’t overlap at zoom 55 both keep their cards', () => {
    const outcome = project([cardAt('a', 0, 0), cardAt('b', 2, 0)], 55)
    expect(outcome.cards).toEqual(['a', 'b'])
    expect(outcome.dots).toEqual([])
  })

  it('never stacks a project at desk zoom', () => {
    const huddle = ['a', 'b', 'c', 'd', 'e'].map((key, index) => cardAt(key, index * 0.2, 0))
    const outcome = project(huddle, 90)
    expect(outcome.stacks).toEqual([])
    expect(outcome.cards).toHaveLength(1)
    expect(outcome.dots).toHaveLength(4)
  })

  it('the selected card always wins', () => {
    const outcome = project(
      [cardAt('waiting', 0, 0, { status: 'waiting' }), cardAt('picked', 0.4, 0)],
      90,
      'picked'
    )
    expect(outcome.cards).toEqual(['picked'])
    expect(outcome.dots).toEqual(['waiting'])
  })

  it('caps cards at 12 and says how many more there are', () => {
    const outcome = project(crowd, 55)
    expect(outcome.cards).toHaveLength(12)
    expect(outcome.dots).toHaveLength(2)
    expect(outcome.overflow).toBe('+2 more')
  })

  it('caps cards at 6 on the light quality level', () => {
    pinQuality('light')
    const outcome = project(crowd, 55)
    expect(outcome.cards).toHaveLength(6)
    expect(outcome.dots).toHaveLength(8)
    expect(outcome.overflow).toBe('+8 more')
  })

  it('shows no count while every card fits', () => {
    expect(project(crowd.slice(0, 12), 55).overflow).toBeNull()
  })
})
