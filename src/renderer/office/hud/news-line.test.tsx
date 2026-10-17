import { render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import type { CityEvent } from '../../office-live/city-events'
import { buildAttentionQueue } from '../logic/attention-queue'
import { createRoleBook, maskFrame } from '../logic/role-names'
import { usage } from '../scene/__tests__/city-marks.test-utils'
import { useAttentionAnnouncement } from '../use-office-effects'
import { makeFrame, makeSession } from '../__tests__/fixtures'
import { headerWithNewsLine, NEWS_LINE_HEIGHT_PX, NewsLine } from './NewsLine'

const auth = makeSession({
  key: 'claude:a1b2',
  name: 'auth',
  projectLabel: 'PropApp',
  usage: usage(1_100_000)
})
const docs = makeSession({ key: 'claude:c3d4', name: 'docs', projectLabel: 'PropApp' })

// The page's event log as the hook sees it: what is live, and how many have fired.
function eventLog(initial: CityEvent[] = []) {
  let live = initial
  let fired = initial.length
  return {
    log: { active: () => live, version: () => fired },
    fire(event: Omit<CityEvent, 'buildingId' | 'atMs'>) {
      live = [...live, { ...event, buildingId: 'building:c_test:p_1', atMs: 0 }]
      fired += 1
    }
  }
}

function hookFor(sessions: readonly SessionRef[], log: ReturnType<typeof eventLog>['log']) {
  const counter = { renders: 0 }
  const queue = buildAttentionQueue(sessions)
  const hook = renderHook(
    (props: { sessions: readonly SessionRef[] }) => {
      counter.renders += 1
      return useAttentionAnnouncement(queue, props.sessions, log)
    },
    { initialProps: { sessions } }
  )
  return { ...hook, counter, again: () => hook.rerender({ sessions }) }
}

describe('news line', () => {
  it('each city event yields one line', () => {
    const { log, fire } = eventLog()
    const { result, again } = hookFor([auth, docs], log)
    fire({ id: 'claude:a1b2:milestone:1', kind: 'milestone', sessionKey: auth.key })
    again()
    expect(result.current.news?.text).toBe('PropApp › auth · reached 1M tokens')
    expect(result.current.announcement).toContain('PropApp › auth · reached 1M tokens')
    fire({ id: 'claude:c3d4:done:1', kind: 'done', sessionKey: docs.key })
    again()
    expect(result.current.news?.text).toBe('PropApp › docs · finished its turn')
    // A tool call has no words: the line keeps the one before it.
    fire({ id: 'claude:c3d4:dispatch:7', kind: 'dispatch', sessionKey: docs.key })
    again()
    expect(result.current.news?.text).toBe('PropApp › docs · finished its turn')
    expect(result.current.news?.text).not.toMatch(/claude:|a1b2|c3d4/)
  })

  it('names hidden shows roles', () => {
    const masked = maskFrame(makeFrame({ sessions: [auth, docs] }), createRoleBook()).sessions
    const { log, fire } = eventLog()
    const { result, again } = hookFor(masked, log)
    fire({ id: 'claude:a1b2:milestone:1', kind: 'milestone', sessionKey: auth.key })
    again()
    expect(result.current.news?.text).toBe('Project A-1 › Session A-1.1 · reached 1M tokens')
    expect(result.current.announcement).not.toMatch(/PropApp|auth/)
  })

  it('the line commits once per event', () => {
    const { log, fire } = eventLog()
    const { result, again, counter } = hookFor([auth, docs], log)
    for (let tick = 0; tick < 3; tick++) again()
    expect(counter.renders).toBe(4)
    fire({ id: 'claude:a1b2:milestone:1', kind: 'milestone', sessionKey: auth.key })
    again()
    // The re-render that saw the event, plus one commit for its line.
    expect(counter.renders).toBe(6)
    const line = result.current.news
    for (let tick = 0; tick < 3; tick++) again()
    expect(counter.renders).toBe(9)
    expect(result.current.news).toBe(line)
  })

  it('the first frame shows no line, and still announces who needs you', () => {
    const waiting = { ...docs, attention: 'permission' as const }
    const { log } = eventLog([
      { id: 'old', kind: 'done', sessionKey: auth.key, buildingId: 'b', atMs: 0 }
    ])
    const { result } = hookFor([auth, waiting], log)
    expect(result.current.news).toBeNull()
    expect(result.current.announcement).toBe('Needs permission: PropApp › docs')
  })

  it('a needs-you prompt after the first frame makes the line', () => {
    const { log } = eventLog()
    const { result, rerender } = renderHook(
      ({ sessions }) => useAttentionAnnouncement(buildAttentionQueue(sessions), sessions, log),
      { initialProps: { sessions: [auth, docs] as readonly SessionRef[] } }
    )
    rerender({ sessions: [auth, { ...docs, attention: 'question' }] })
    expect(result.current.news?.text).toBe('PropApp › docs · waiting for you')
    expect(result.current.announcement).toBe('Waiting for you: PropApp › docs')
  })
})

describe('the ticker under the header', () => {
  it('shows the line as plain text: no second live region, nothing focusable', () => {
    const { container } = render(<NewsLine news={{ id: 'a', text: 'PropApp › auth · done' }} />)
    const line = screen.getByText('PropApp › auth · done')
    expect(line.className).toMatch(/truncate/)
    expect(container.querySelector('[aria-live], [role="status"], [tabindex]')).toBeNull()
  })

  it('keeps its height with or without a line, and the header measure includes it', () => {
    const { container } = render(<NewsLine news={null} />)
    const ticker = container.firstElementChild
    expect(ticker instanceof HTMLElement && ticker.style.height).toBe(`${NEWS_LINE_HEIGHT_PX}px`)
    expect(headerWithNewsLine(48)).toBe(48 + NEWS_LINE_HEIGHT_PX)
  })
})
