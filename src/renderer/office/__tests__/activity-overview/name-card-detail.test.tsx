import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildNameCards } from '../../logic/name-cards'
import type { CardAnchors } from '../../scene/CardProjector'
import { NameCardLayer } from '../../scene/NameCards'
import { makeAgent } from '../fixtures'
import { makeActivityFrame } from './activity-fixtures'

vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))

describe('overview name-card details', () => {
  it('labels disconnected cards unavailable and does not present a confirmed working marker', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    const cards = buildNameCards({ ...frame, connected: false }, 'f1', null)
    expect(cards[0].detail).toBe('Activity unavailable')
    expect(cards[0].status).not.toBe('working')
    const anchors: CardAnchors = { cards: new Map(), dots: new Map(), stacks: new Map() }
    render(
      <NameCardLayer
        cards={cards}
        stacks={[]}
        band="floor"
        selectedAgentKey={null}
        anchors={anchors}
        reviewableKeys={new Set()}
        onReview={vi.fn()}
        onFlyToZone={vi.fn()}
      />
    )
    expect(anchors.cards.get('worker-0')).toHaveTextContent('Activity unavailable')
    expect(anchors.cards.get('worker-0')).not.toHaveTextContent(/Working|Editing/)
  })
  it('keeps explicit Working and available activity/tool text on unselected floor cards', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    const anchors: CardAnchors = { cards: new Map(), dots: new Map(), stacks: new Map() }
    render(
      <NameCardLayer
        cards={buildNameCards(frame, 'f1', null)}
        stacks={[]}
        band="floor"
        selectedAgentKey={null}
        anchors={anchors}
        reviewableKeys={new Set()}
        onReview={vi.fn()}
        onFlyToZone={vi.fn()}
      />
    )
    const card = anchors.cards.get('worker-0')
    expect(card).toHaveTextContent(/Working/i)
    expect(card).toHaveTextContent(/Editing/i)
    expect(card).toHaveTextContent(/Editing\s*·\s*Edit\b/)
  })

  it('keeps Needs permission text on an unselected floor card instead of a color-only marker', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'permission' }])
    const anchors: CardAnchors = { cards: new Map(), dots: new Map(), stacks: new Map() }
    render(
      <NameCardLayer
        cards={buildNameCards(frame, 'f1', null)}
        stacks={[]}
        band="floor"
        selectedAgentKey={null}
        anchors={anchors}
        reviewableKeys={new Set()}
        onReview={vi.fn()}
        onFlyToZone={vi.fn()}
      />
    )
    expect(anchors.cards.get('worker-0')).toHaveTextContent('Needs permission')
    expect(anchors.cards.get('worker-0')).not.toHaveTextContent(/Working/i)
  })

  it('gives unselected subagents their own readable activity without inheriting the parent tool', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    frame.sessions[0].subagents = [{ id: 'reader', type: 'Explore', activity: 'reading' }]
    frame.agents.push(
      makeAgent({
        agentKey: 'worker-0#reader',
        roomId: 'room-0',
        label: 'Explore',
        isSubagent: true,
        activity: 'reading'
      })
    )
    const cards = buildNameCards(frame, 'f1', null)
    const subagent = cards.find((card) => card.agentKey === 'worker-0#reader')
    expect(subagent?.detail).toMatch(/Reading/i)
    expect(subagent?.detail).not.toMatch(/Edit/)
    const anchors: CardAnchors = { cards: new Map(), dots: new Map(), stacks: new Map() }
    render(
      <NameCardLayer
        cards={cards}
        stacks={[]}
        band="floor"
        selectedAgentKey={null}
        anchors={anchors}
        reviewableKeys={new Set()}
        onReview={vi.fn()}
        onFlyToZone={vi.fn()}
      />
    )
    expect(anchors.cards.get('worker-0#reader')).toHaveTextContent(/Reading/i)
    expect(anchors.cards.get('worker-0#reader')).not.toHaveTextContent(/Edit/)
  })
})
