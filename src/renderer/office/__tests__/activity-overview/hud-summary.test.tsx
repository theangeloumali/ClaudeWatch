import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeAgent } from '../fixtures'
import { createOfficeHarness } from '../inspector-panel/office-harness'
import {
  ACTIVITY_STATES,
  ATTENTION_STATES,
  activityCountPattern,
  makeActivityFrame
} from './activity-fixtures'

vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => false }))

function totals(): HTMLElement {
  return screen.getByRole('region', { name: 'Office totals' })
}

describe('feed-backed activity overview', () => {
  it('shows Working, Needs you and Idle/Done text without selecting an agent', () => {
    createOfficeHarness(
      makeActivityFrame([
        { activity: 'editing', attention: 'none' },
        { activity: 'reading', attention: 'none' },
        { activity: 'running', attention: 'permission' },
        { activity: 'idle', attention: 'none' }
      ])
    )
    expect(totals()).toHaveTextContent(activityCountPattern(2, 'working'))
    expect(totals()).toHaveTextContent(activityCountPattern(1, 'needs you'))
    expect(totals()).toHaveTextContent(activityCountPattern(1, 'idle\\s*/\\s*done'))
    expect(screen.queryByLabelText('Agent details')).not.toBeInTheDocument()
  })

  it('counts every reported non-idle activity as working, including thinking and delegating', () => {
    createOfficeHarness(
      makeActivityFrame(ACTIVITY_STATES.map((activity) => ({ activity, attention: 'none' })))
    )
    expect(totals()).toHaveTextContent(activityCountPattern(6, 'working'))
    expect(totals()).toHaveTextContent(activityCountPattern(1, 'idle\\s*/\\s*done'))
    expect(totals()).toHaveTextContent(activityCountPattern(0, 'needs you'))
  })

  it('gives every attention state precedence over every activity without double counting', () => {
    const { push } = createOfficeHarness(makeActivityFrame([]))
    for (const attention of ATTENTION_STATES) {
      push(makeActivityFrame(ACTIVITY_STATES.map((activity) => ({ activity, attention }))))
      expect(totals()).toHaveTextContent(
        activityCountPattern(attention === 'none' ? 6 : 0, 'working')
      )
      const needsYouCount = attention === 'permission' || attention === 'question' ? 7 : 0
      expect(totals()).toHaveTextContent(activityCountPattern(needsYouCount, 'needs you'))
      let idleCount = 0
      if (attention === 'none') idleCount = 1
      if (attention === 'done') idleCount = ACTIVITY_STATES.length
      expect(totals()).toHaveTextContent(activityCountPattern(idleCount, 'idle\\s*/\\s*done'))
      if (attention === 'error' || attention === 'limited') {
        expect(totals()).toHaveTextContent(activityCountPattern(7, `issues?|${attention}`))
      }
    }
  })

  it('adds accessible project and company breakdowns without changing their button names', () => {
    createOfficeHarness(
      makeActivityFrame([
        { activity: 'editing', attention: 'none' },
        { activity: 'reading', attention: 'none' },
        { activity: 'searching', attention: 'question' },
        { activity: 'idle', attention: 'none' }
      ])
    )
    const offices = screen.getByRole('navigation', { name: 'Offices' })
    for (const name of ['Project, 4 agents, 1 needs you', 'Test Co, 4 agents, 1 needs you']) {
      const row = within(offices).getByRole('button', { name })
      expect(row).toHaveAccessibleDescription(activityCountPattern(2, 'working'))
      expect(row).toHaveAccessibleDescription(activityCountPattern(1, 'needs you'))
      expect(row).toHaveAccessibleDescription(activityCountPattern(1, 'idle\\s*/\\s*done'))
    }
  })

  it('counts visible subagents once using their own activity rather than their parent', () => {
    const frame = makeActivityFrame([{ activity: 'idle', attention: 'none' }])
    frame.sessions[0].subagents = [{ id: 'research', type: 'Explore', activity: 'searching' }]
    frame.agents.push(
      makeAgent({
        agentKey: 'worker-0/research',
        roomId: 'room-0',
        label: 'Explore',
        isSubagent: true,
        activity: 'searching'
      })
    )
    createOfficeHarness(frame)
    expect(totals()).toHaveTextContent('2 agents')
    expect(totals()).toHaveTextContent(activityCountPattern(1, 'working'))
    expect(totals()).toHaveTextContent(activityCountPattern(1, 'idle\\s*/\\s*done'))
    const offices = screen.getByRole('navigation', { name: 'Offices' })
    const project = within(offices).getByRole('button', { name: 'Project, 2 agents' })
    expect(project).toHaveAccessibleDescription(activityCountPattern(1, 'working'))
  })

  it('updates totals when a worker changes state, departs and leaves an empty project', () => {
    const { push } = createOfficeHarness(
      makeActivityFrame([{ activity: 'running', attention: 'none' }])
    )
    expect(totals()).toHaveTextContent(activityCountPattern(1, 'working'))
    push(makeActivityFrame([{ activity: 'running', attention: 'done' }]))
    expect(totals()).toHaveTextContent(activityCountPattern(0, 'working'))
    expect(totals()).toHaveTextContent(activityCountPattern(1, 'idle\\s*/\\s*done'))
    push(makeActivityFrame([]))
    expect(totals()).toHaveTextContent('0 agents')
    expect(totals()).toHaveTextContent(activityCountPattern(0, 'idle\\s*/\\s*done'))
    const offices = screen.getByRole('navigation', { name: 'Offices' })
    const project = within(offices).getByRole('button', { name: 'Project, 0 agents' })
    expect(project).toHaveAccessibleDescription(activityCountPattern(0, 'working'))
  })

  it('labels disconnected totals and project activity unavailable instead of confirming live work', () => {
    const frame = makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    const { push } = createOfficeHarness(frame)
    push({ ...frame, connected: false })
    expect(totals()).toHaveTextContent(
      /activity.*(?:unavailable|unknown)|(?:unavailable|unknown).*activity/i
    )
    const offices = screen.getByRole('navigation', { name: 'Offices' })
    const project = within(offices).getByRole('button', { name: 'Project, 1 agent' })
    expect(project).toHaveAccessibleDescription(/unavailable|unknown/i)
  })

  it('keeps activity textual without adding routine work changes to the attention announcement', () => {
    const { push } = createOfficeHarness(
      makeActivityFrame([{ activity: 'editing', attention: 'none' }])
    )
    const announcement = screen.getByRole('status')
    const initialAnnouncement = announcement.textContent
    push(makeActivityFrame([{ activity: 'thinking', attention: 'none' }]))
    expect(totals()).toHaveTextContent(activityCountPattern(1, 'working'))
    expect(announcement.textContent).toBe(initialAnnouncement)
    expect(totals()).not.toHaveAttribute('aria-live')
  })
})
