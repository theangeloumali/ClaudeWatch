import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildNameCards, buildProjectStacks } from '../../logic/name-cards'
import { createOfficeHarness } from '../inspector-panel/office-harness'
import { makeActivityFrame } from './activity-fixtures'

vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => false }))

describe('activity source health', () => {
  it.each(['opencode', 'codex', 'claude:/registry'])(
    'does not confirm working activity when %s fails after a snapshot',
    (sourceId) => {
      const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
      const provider = sourceId.startsWith('claude')
        ? 'claude'
        : sourceId === 'codex'
          ? 'codex'
          : 'opencode'
      frame.agents[0].provider = provider
      frame.sessions[0].provider = provider
      frame.sources = [{ id: sourceId, ok: false, detail: 'Activity source unreadable' }]
      createOfficeHarness(frame)

      expect(screen.getByRole('region', { name: 'Office totals' })).toHaveTextContent(
        'Activity unavailable'
      )
      const offices = screen.getByRole('navigation', { name: 'Offices' })
      expect(
        within(offices).getByRole('button', { name: 'Project, 1 agent' })
      ).toHaveAccessibleDescription('Activity unavailable')
      const card = buildNameCards(frame, 'f1', null)[0]
      expect(card.isAvailable).toBe(false)
      expect(card.detail).toBe('Activity unavailable')
      expect(card.status).not.toBe('working')
      expect(buildProjectStacks(frame, 'f1')[0].text).toContain('Activity unavailable')
    }
  )

  it('does not confuse failed action or usage services with unavailable session activity', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    frame.sources = [
      { id: 'orca', ok: false, detail: 'Actions unavailable' },
      { id: 'usage', ok: false, detail: 'Token counting unavailable' }
    ]
    createOfficeHarness(frame)
    expect(screen.getByRole('region', { name: 'Office totals' })).toHaveTextContent(/1\s+Working/)
    expect(buildNameCards(frame, 'f1', null)[0].isAvailable).toBe(true)
  })
})
