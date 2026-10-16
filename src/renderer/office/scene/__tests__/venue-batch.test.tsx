// perf-1: venues have no moving parts, so their batch is placed once and costs nothing per frame.
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { buildLayout } from '../../../../office/sim/layout'
import { createWorldDocument } from '../../../../shared/office/world-document'
import { makeSession } from '../../__tests__/fixtures'
import { getTheme } from '../../themes/registry'
import { BatchedScene } from '../BatchedScene'
import { VenueLayer } from '../VenueLayer'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory()
}))

type Node = ReactElement<{ children?: ReactNode; isStatic?: boolean }>

function elements(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Node['props']>(node)) return []
  return [node, ...elements(node.props.children)]
}

describe('VenueLayer', () => {
  it('places its venues once, in a static batch', () => {
    const sessions = [makeSession({ key: 'claude:venue-batch' })]
    const venues = createWorldDocument(buildLayout(sessions, undefined), sessions).venues
    const theme = getTheme('corporate-city')
    expect(venues.length).toBeGreaterThan(0)
    const batches = elements(VenueLayer({ venues, palette: theme.palette, theme })).filter(
      (node) => node.type === BatchedScene
    )
    expect(batches.map((batch) => batch.props.isStatic)).toEqual([true])
  })
})
