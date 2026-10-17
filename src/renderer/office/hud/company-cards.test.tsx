import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import { createCitySignalStore } from '../logic/city-signal-store'
import { companyHues, companyLens } from '../logic/company-lens'
import { createRoleBook, maskFrame } from '../logic/role-names'
import { buildOfficesTree } from '../logic/zone-model'
import type { OfficeFrame } from '../scene-model'
import { live, NOW, stale, usage } from '../scene/__tests__/city-marks.test-utils'
import { getTheme } from '../themes/registry'
import { makeFloor, makeFrame, makeZone } from '../__tests__/fixtures'
import { CompanyCards } from './CompanyCards'
import { CompanyLensToggle } from './CompanyLensToggle'

const { palette } = getTheme('corporate-city')
const companyFloor = (index: number, companyKey: string, label: string) =>
  makeFloor({
    floorId: `f${index}`,
    zones: [
      makeZone({
        id: `zone-${companyKey}`,
        kind: 'company',
        companyKey,
        label,
        children: [
          makeZone({ id: `office-${index}`, kind: 'project', companyKey, projectKey: `p_${index}` })
        ]
      })
    ]
  })
const floors = [companyFloor(1, 'c_test', 'Test Co'), companyFloor(2, 'c_other', 'Other Co')]
const atOther = { companyKey: 'c_other', projectKey: 'p_2' }

function cardsFor(sessions: readonly SessionRef[], options: { frame?: OfficeFrame } = {}) {
  const store = createCitySignalStore()
  const real = makeFrame({ floors, sessions: [...sessions] })
  store.update(real, NOW)
  const shown = options.frame ?? real
  const props: ComponentProps<typeof CompanyCards> = {
    store,
    version: store.version(),
    companies: buildOfficesTree(shown),
    palette,
    onFlyToZone: vi.fn()
  }
  return { store, props }
}

const cardNamed = (label: string): HTMLElement =>
  screen.getByRole('button', { name: new RegExp(`^${label}`) })

describe('company cards', () => {
  beforeEach(() => {
    if (!companyLens.isOn()) companyLens.toggle()
  })
  afterEach(() => {
    if (companyLens.isOn()) companyLens.toggle()
  })

  it('a company card counts working and waiting agents from fresh evidence only', () => {
    const { props } = cardsFor([
      live('claude:a1', { activity: 'editing' }),
      live('claude:a2', { attention: 'permission' }),
      live('claude:a3', { attention: 'error' }),
      stale('claude:a4', { activity: 'editing' }),
      stale('claude:a5', { attention: 'permission' }),
      live('claude:b1', { ...atOther, activity: 'reading' })
    ])
    render(<CompanyCards {...props} />)
    const test = cardNamed('Test Co')
    expect(test).toHaveTextContent('1 working')
    expect(test).toHaveTextContent('1 needs you')
    expect(test).toHaveTextContent('1 error')
    expect(cardNamed('Other Co')).toHaveTextContent('1 working')
    expect(cardNamed('Other Co')).toHaveTextContent('0 needs you')
  })

  it('tokens today read as unknown when no count exists, never as 0', () => {
    const { props } = cardsFor([
      live('claude:a1', { usage: usage(8_400_000) }),
      live('claude:b1', { ...atOther, usage: null })
    ])
    render(<CompanyCards {...props} />)
    expect(cardNamed('Test Co')).toHaveTextContent('8.4M tokens today')
    expect(cardNamed('Other Co')).toHaveTextContent('tokens today unknown')
    expect(cardNamed('Other Co')).not.toHaveTextContent(/\b0 tokens/)
  })

  it('names hidden shows Company A', () => {
    const sessions = [live('claude:a1', { activity: 'editing' })]
    const masked = maskFrame(makeFrame({ floors, sessions }), createRoleBook())
    const { props } = cardsFor(sessions, { frame: masked })
    render(<CompanyCards {...props} />)
    expect(cardNamed('Company A')).toHaveTextContent('1 working')
    expect(cardNamed('Company B')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Test Co|Other Co|c_test|c_other/)
  })

  it("each card wears its company's hue, the one its offices take", () => {
    const { props, store } = cardsFor([live('claude:a1')])
    render(<CompanyCards {...props} />)
    const hues = companyHues(store.current().companies.keys(), palette)
    const swatch = cardNamed('Test Co').querySelector('[data-company-hue]')
    expect(swatch?.getAttribute('data-company-hue')).toBe(hues.get('c_test'))
    expect(swatch).toHaveAttribute('aria-hidden', 'true')
  })

  it('a card flies to its company, and is a 44 px target', () => {
    const { props } = cardsFor([live('claude:a1')])
    render(<CompanyCards {...props} />)
    fireEvent.click(cardNamed('Other Co'))
    expect(props.onFlyToZone).toHaveBeenCalledWith('zone-c_other')
    for (const card of screen.getAllByRole('button')) expect(card.className).toMatch(/min-h-11/)
  })

  it('shows nothing while the lens is off', () => {
    companyLens.toggle()
    const { props } = cardsFor([live('claude:a1')])
    const { container } = render(<CompanyCards {...props} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('company lens toggle', () => {
  afterEach(() => {
    if (companyLens.isOn()) companyLens.toggle()
  })

  it('is a 44 px target with a label that says whether the lens is on', () => {
    render(<CompanyLensToggle />)
    const toggle = screen.getByRole('button', { name: 'Company lens' })
    expect(toggle.className).toMatch(/min-h-11/)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(companyLens.isOn()).toBe(true)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('is disabled with the 3D view', () => {
    render(<CompanyLensToggle isDisabled />)
    expect(screen.getByRole('button', { name: 'Company lens' })).toBeDisabled()
  })
})
