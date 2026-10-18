import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import { createCitySignalStore } from '../logic/city-signal-store'
import { createRoleBook, maskFrame } from '../logic/role-names'
import { buildOfficesTree } from '../logic/zone-model'
import type { OfficeFrame } from '../scene-model'
import { live, NOW, usage } from '../scene/__tests__/city-marks.test-utils'
import { makeFloor, makeFrame, makeZone } from '../__tests__/fixtures'
import { LeadersCard } from './LeadersCard'

const HOURS = 3_600_000
const member = (id: string) => ({ id, type: 'general', activity: 'editing' as const })
const auth = live('claude:a1b2', {
  name: 'auth',
  projectLabel: 'PropApp',
  activity: 'editing',
  usage: usage(8_400_000),
  startedAtMs: NOW - 3 * HOURS - 12 * 60_000,
  subagents: [member('m1'), member('m2')]
})
const docs = live('claude:c3d4', {
  name: 'docs',
  projectLabel: 'PropApp',
  activity: 'reading',
  usage: usage(1_200_000),
  startedAtMs: NOW - 10 * 60_000
})
const office = makeZone({
  id: 'zone-propapp',
  kind: 'project',
  companyKey: 'c_test',
  projectKey: 'p_1',
  label: 'PropApp'
})
const floors = [
  makeFloor({
    floorId: 'f1',
    zones: [
      makeZone({
        id: 'zone-company',
        kind: 'company',
        companyKey: 'c_test',
        label: 'Test Co',
        children: [office]
      })
    ]
  })
]

function cardFor(sessions: readonly SessionRef[], options: { frame?: OfficeFrame } = {}) {
  const store = createCitySignalStore()
  const real = makeFrame({ floors, sessions: [...sessions] })
  store.update(real, NOW)
  const shown = options.frame ?? real
  const props: ComponentProps<typeof LeadersCard> = {
    store,
    sessions: shown.sessions,
    companies: buildOfficesTree(shown),
    onFlyToZone: vi.fn()
  }
  return { store, props, real }
}

const rowNamed = (title: string): HTMLElement =>
  screen.getByRole('button', { name: new RegExp(`^${title}`) })

describe('leaders card', () => {
  it('rows come from citySignals leaders', () => {
    const { props } = cardFor([auth, docs])
    render(<LeadersCard {...props} />)
    expect(rowNamed('Top spender').textContent).toContain('PropApp › auth')
    expect(rowNamed('Top spender').textContent).toContain('8.4M')
    expect(rowNamed('Busiest project').textContent).toContain('2 working')
    // A start time, not an age: it stays true between signal versions.
    const started = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    expect(rowNamed('Longest running').textContent).toContain(
      `since ${started.format(auth.startedAtMs)}`
    )
    expect(rowNamed('Most crew').textContent).toContain('2 helpers')
    // Keys and ids never reach the page.
    expect(document.body.textContent).not.toMatch(/claude:|a1b2|c_test|p_1/)
  })

  it('names hidden shows roles', () => {
    const real = makeFrame({ floors, sessions: [auth, docs] })
    const masked = maskFrame(real, createRoleBook())
    const { props } = cardFor([auth, docs], { frame: masked })
    render(<LeadersCard {...props} />)
    expect(rowNamed('Top spender').textContent).toContain('Project A-1 › Session A-1.1')
    expect(document.body.textContent).not.toMatch(/PropApp|auth|docs/)
  })

  it("a row's tap flies to the building", () => {
    const { props } = cardFor([auth, docs])
    render(<LeadersCard {...props} />)
    fireEvent.click(rowNamed('Busiest project'))
    fireEvent.click(rowNamed('Top spender'))
    expect(props.onFlyToZone).toHaveBeenNthCalledWith(1, office.id)
    expect(props.onFlyToZone).toHaveBeenNthCalledWith(2, office.id)
  })

  it('the card commits for a store change and new props, never for the clock', () => {
    const { store, props, real } = cardFor([auth, docs])
    // Each render of the card reads the store once.
    const renders = vi.spyOn(store, 'current')
    const { rerender } = render(<LeadersCard {...props} />)
    // The Office re-renders on its clock and on pose-only frames: the card does not.
    for (let tick = 1; tick <= 5; tick++) rerender(<LeadersCard {...props} />)
    expect(renders).toHaveBeenCalledTimes(1)
    const richer = { ...docs, usage: usage(9_000_000) }
    act(() => store.update(makeFrame({ ...real, sessions: [auth, richer] }), NOW))
    expect(renders).toHaveBeenCalledTimes(2)
    const patched = { ...props, sessions: [auth, richer] }
    rerender(<LeadersCard {...patched} />)
    rerender(<LeadersCard {...patched} />)
    expect(renders).toHaveBeenCalledTimes(3)
    expect(rowNamed('Top spender').textContent).toContain('PropApp › docs')
  })

  it('the card follows the store with no new props', () => {
    const { store, props, real } = cardFor([auth, docs])
    render(<LeadersCard {...props} sessions={[auth, docs]} />)
    expect(rowNamed('Top spender').textContent).toContain('PropApp › auth')
    const richer = { ...docs, usage: usage(9_000_000) }
    act(() => store.update(makeFrame({ ...real, sessions: [auth, richer] }), NOW))
    expect(rowNamed('Top spender').textContent).toContain('PropApp › docs')
  })

  it('a board with no leader reads "No agents yet" and offers no tap', () => {
    const { props } = cardFor([])
    render(<LeadersCard {...props} />)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getAllByText('No agents yet')).toHaveLength(4)
  })

  it('every row is a 44 px target with a label', () => {
    const { props } = cardFor([auth, docs])
    render(<LeadersCard {...props} />)
    for (const row of screen.getAllByRole('button')) {
      expect(row.className).toMatch(/min-h-11/)
      expect(row).toHaveAccessibleName()
    }
  })
})
