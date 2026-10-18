import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OfficeApp } from '../OfficeApp'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from './fixtures'
import type { OfficeFeed } from '../scene-model'
import { listThemes } from '../themes/registry'
import type { OfficeTheme, TowerFloor } from '../themes/types'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../scene/OfficeScene', () => ({
  default: ({
    theme,
    floors,
    onFlyToZone
  }: {
    theme: OfficeTheme
    floors: TowerFloor[]
    onFlyToZone: (zoneId: string) => void
  }) => (
    <div aria-label={`Scene theme ${theme.label}`}>
      {floors.map((floor) => (
        <span key={floor.floorId}>
          Building {floor.label}: {floor.agentCount} agents, {floor.attentionCount} waiting
        </span>
      ))}
      <button onClick={() => onFlyToZone('p-forge')}>Double-click Forge</button>
    </div>
  )
}))

const frame = makeFrame({
  floors: [
    makeFloor({
      floorId: 'one',
      label: 'Office',
      rooms: [makeRoom({ id: 'r1', sessionKey: 'claude:b' })],
      zones: [
        makeZone({
          id: 'c-guild',
          kind: 'company',
          label: 'Guild',
          companyKey: 'c_test',
          children: [
            makeZone({ id: 'p-forge', kind: 'project', label: 'Forge', projectKey: 'p_1' })
          ]
        })
      ]
    })
  ],
  sessions: [makeSession({ key: 'claude:b', attention: 'permission' })],
  agents: [makeAgent({ agentKey: 'b1', floorId: 'one', roomId: 'r1', attention: 'permission' })]
})
const feed: OfficeFeed = {
  subscribe: (listener) => {
    listener(frame)
    return () => undefined
  },
  focus: vi.fn().mockResolvedValue({ success: true }),
  send: vi.fn(),
  respond: vi.fn(),
  peek: vi.fn(),
  start: vi.fn()
}
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('innerWidth', 1440)
})
afterEach(() => vi.unstubAllGlobals())

it('passes theme selection and building totals to the scene and flies to zones from it', async () => {
  render(<OfficeApp feed={feed} />)
  expect(await screen.findByText('Building Office: 1 agents, 1 waiting')).toBeInTheDocument()
  // The bar's button opens the themes list; it changes no theme by itself.
  fireEvent.click(screen.getByRole('button', { name: /^Map theme: Corporate City$/ }))
  expect(screen.getByLabelText('Scene theme Corporate City')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 't' })
  expect(screen.getByLabelText('Scene theme Neo Edo Steam')).toBeInTheDocument()
  expect(localStorage.getItem('claudewatch.office.theme')).toBe('neo-edo-steam')
  // T walks the registry and returns to the initial theme.
  for (let press = 2; press <= listThemes().length; press++) fireEvent.keyDown(window, { key: 't' })
  expect(screen.getByLabelText('Scene theme Corporate City')).toBeInTheDocument()
  // Once a zone is focused T changes that office, says so, and the floor's theme stays put.
  fireEvent.click(screen.getByRole('button', { name: 'Double-click Forge' }))
  expect(screen.getByRole('button', { name: /^Forge, 1 agent/ })).toHaveAttribute(
    'aria-current',
    'true'
  )
  fireEvent.keyDown(window, { key: 't' })
  expect(
    screen.getByText('Forge office is now Neo Edo Steam. Other offices keep their themes.')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Map theme: Corporate City$/ })).toBeInTheDocument()
  expect(screen.getByLabelText('Scene theme Corporate City')).toBeInTheDocument()
})

it('integrates native dragging and traffic-light space into the operational header', () => {
  const { container } = render(<OfficeApp feed={feed} hasHiddenTitleBar />)
  const heading = screen.getByTitle('ClaudeWatch Office')
  const header = heading.closest('header')
  if (!header) throw new Error('The office identity must belong to the operational header')
  const identity = heading.parentElement
  expect(identity).toHaveClass('[-webkit-app-region:drag]')
  expect(header).toHaveClass('[-webkit-app-region:no-drag]')
  expect(identity?.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  expect(identity?.firstElementChild).toHaveClass('w-20', '[-webkit-app-region:no-drag]')
  const choices = within(header).getByRole('combobox', {
    name: 'Choose office or physical floor'
  })
  expect(choices).toHaveClass('[-webkit-app-region:no-drag]')
  expect(within(header).getByRole('button', { name: 'List' })).toHaveClass(
    '[-webkit-app-region:no-drag]'
  )
  expect(identity).not.toContainElement(choices)
  expect(identity).not.toContainElement(screen.getByRole('navigation', { name: 'Offices' }))
  expect(container.querySelector('.drag-region')).toBeNull()
})

it('leaves browser identity and controls without any native drag region', () => {
  const { container } = render(<OfficeApp feed={feed} />)
  expect(container.querySelector('[class*="-webkit-app-region:drag"]')).toBeNull()
  expect(screen.getByTitle('ClaudeWatch Office').parentElement).not.toHaveClass(
    '[-webkit-app-region:drag]'
  )
  expect(container.querySelector('.drag-region')).toBeNull()
})

it('reserves a useful desktop context rail before a worker is selected', () => {
  const { container } = render(<OfficeApp feed={feed} />)
  const layout = container.querySelector('.pointer-events-none.grid')
  expect(layout).toHaveClass(
    'min-[1100px]:grid-cols-[var(--office-left-rail)_minmax(0,1fr)_var(--office-right-rail)]'
  )
  expect(layout).toHaveStyle({ '--office-left-rail': '296px', '--office-right-rail': '320px' })
  const network = screen.getByRole('region', { name: 'Office network' })
  expect(network).toHaveTextContent('All offices · 1 physical floor.')
  expect(within(network).getByRole('button', { name: /^Office/ })).toHaveTextContent(
    /1 assigned · 0 confirmed working · 0 confirmed attention/
  )
  expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Current-session evidence' })).toHaveTextContent(
    'Select a worker to view current-session evidence.'
  )
})

it('keeps compact scope choices and an expandable context sheet on a narrow viewport', () => {
  vi.stubGlobal('innerWidth', 390)
  render(<OfficeApp feed={feed} />)
  expect(
    screen.getByRole('combobox', { name: 'Choose office or physical floor' })
  ).toBeInTheDocument()
  expect(screen.getByText('Projects & offices', { selector: 'summary' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Office network' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByText('Office context', { selector: 'summary' }))

  const network = screen.getByRole('region', { name: 'Office network' })
  expect(network).toHaveTextContent('All offices · 1 physical floor.')
  expect(within(network).getByRole('button', { name: /^Office/ })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Current-session evidence' })).toHaveTextContent(
    'Select a worker to view current-session evidence.'
  )
})
