import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InteractionResult, PeekResult } from '../../../shared/office/types'
import { OfficeApp } from '../OfficeApp'
import type { OfficeFeed, OfficeFrame } from '../scene-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from './fixtures'

vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => false }))

const SCREEN = ['$ rm -rf build', 'Do you want to proceed?', '❯ 1. Yes', '  2. No']

function mockFeed(overrides: Partial<OfficeFeed> = {}) {
  let push: (frame: OfficeFrame) => void = () => undefined
  const feed: OfficeFeed = {
    subscribe: (listener) => {
      push = listener
      return () => undefined
    },
    focus: vi.fn().mockResolvedValue({ success: true }),
    send: vi.fn(async (): Promise<InteractionResult> => ({ success: true })),
    respond: vi.fn(async (): Promise<InteractionResult> => ({ success: true })),
    peek: vi.fn(
      async (): Promise<PeekResult> => ({ success: true, lines: SCREEN, fingerprint: 'fp-1' })
    ),
    start: vi.fn(async (): Promise<InteractionResult> => ({ success: true })),
    ...overrides
  }
  return { feed, push: (frame: OfficeFrame) => act(() => push(frame)) }
}

function officeFrame(permissionAttention: 'permission' | 'none' = 'permission'): OfficeFrame {
  const rooms = [
    makeRoom({ id: 'r1', sessionKey: 'claude:a', label: 'office renderer' }),
    makeRoom({ id: 'r2', sessionKey: 'claude:b', label: 'listing search' }),
    makeRoom({ id: 'r3', sessionKey: 'codex:c', label: 'widget sync' }),
    makeRoom({ id: 'r4', sessionKey: 'claude:d', label: 'plain shell' })
  ]
  return makeFrame({
    floors: [makeFloor({ floorId: 'p_abc~2', label: 'ClaudeWatch', rooms })],
    sessions: [
      makeSession({ key: 'claude:a', name: 'office renderer', host: 'orca', activity: 'editing' }),
      makeSession({
        key: 'claude:b',
        name: 'listing search',
        host: 'orca',
        attention: permissionAttention
      }),
      makeSession({
        key: 'codex:c',
        name: 'widget sync',
        host: 'orca',
        provider: 'codex',
        attention: 'permission'
      }),
      makeSession({ key: 'claude:d', name: 'plain shell', host: 'terminal' })
    ],
    agents: [
      makeAgent({
        agentKey: 'claude:a',
        floorId: 'p_abc~2',
        roomId: 'r1',
        label: 'office renderer',
        activity: 'editing'
      }),
      makeAgent({
        agentKey: 'claude:b',
        floorId: 'p_abc~2',
        roomId: 'r2',
        label: 'listing search',
        attention: permissionAttention
      }),
      makeAgent({
        agentKey: 'codex:c',
        floorId: 'p_abc~2',
        roomId: 'r3',
        label: 'widget sync',
        provider: 'codex',
        attention: 'permission'
      }),
      makeAgent({ agentKey: 'claude:d', floorId: 'p_abc~2', roomId: 'r4', label: 'plain shell' })
    ]
  })
}

function setup(overrides: Partial<OfficeFeed> = {}) {
  const harness = mockFeed(overrides)
  render(<OfficeApp feed={harness.feed} />)
  harness.push(officeFrame())
  return harness
}

function selectAgent(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: /agents by company and project/i })
  fireEvent.click(within(table).getByRole('button', { name: new RegExp(`^${name}`) }))
  return screen.getByRole('complementary', { name: 'Agent details' })
}

afterEach(() => vi.restoreAllMocks())

describe('a view-only page', () => {
  it('offers nothing the server would refuse, and says the page is view-only', () => {
    setup({ isViewOnly: true })
    expect(screen.queryByRole('button', { name: /^New agent in/ })).not.toBeInTheDocument()
    // The queue keeps its Review button, which here can only bring the terminal forward.
    fireEvent.click(screen.getByRole('button', { name: 'Review listing search' }))
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()

    const inspector = selectAgent('office renderer')
    expect(within(inspector).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(inspector).getByText(/This page is view-only/)).toBeInTheDocument()
    expect(
      within(inspector).queryByRole('button', { name: 'Peek at screen' })
    ).not.toBeInTheDocument()
    // Looking is still allowed: focus types nothing.
    expect(within(inspector).getByRole('button', { name: /^Focus terminal/ })).toBeInTheDocument()
  })
})

describe('talk', () => {
  it('sends with ⌘↵, disables Send in flight, then clears the box and says Sent', async () => {
    let resolveSend: (result: InteractionResult) => void = () => undefined
    const send = vi.fn(() => new Promise<InteractionResult>((resolve) => (resolveSend = resolve)))
    setup({ send })
    const inspector = selectAgent('office renderer')
    const box = within(inspector).getByRole('textbox', { name: 'Message office renderer' })
    fireEvent.change(box, { target: { value: 'run the tests' } })
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })
    expect(send).toHaveBeenCalledWith('claude:a', 'run the tests')
    expect(within(inspector).getByRole('button', { name: 'Send' })).toBeDisabled()
    await act(async () => resolveSend({ success: true }))
    expect(box).toHaveValue('')
    expect(within(inspector).getByText('Sent')).toBeInTheDocument()
  })

  it('offers no message box while the agent has a dialog open, and says why', () => {
    setup()
    const inspector = selectAgent('listing search')
    expect(within(inspector).queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      within(inspector).getByText(/not at its input line, so a message could answer a prompt/)
    ).toBeInTheDocument()
  })

  it('explains the plain-terminal case instead of offering a box', () => {
    setup()
    const inspector = selectAgent('plain shell')
    expect(within(inspector).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(inspector).getByText(/runs in a plain terminal/)).toBeInTheDocument()
    expect(
      within(inspector).queryByRole('button', { name: 'Peek at screen' })
    ).not.toBeInTheDocument()
  })

  it('shows the failure in words and keeps the draft', async () => {
    setup({ send: vi.fn(async () => ({ success: false, reason: 'orca-unavailable' as const })) })
    const inspector = selectAgent('office renderer')
    const box = within(inspector).getByRole('textbox', { name: 'Message office renderer' })
    fireEvent.change(box, { target: { value: 'hello' } })
    fireEvent.click(within(inspector).getByRole('button', { name: 'Send' }))
    expect(
      await within(inspector).findByText("Orca isn't responding. Check that it's running.")
    ).toBeInTheDocument()
    expect(box).toHaveValue('hello')
  })

  it('stops an empty message before it reaches the feed', () => {
    const { feed } = setup()
    const inspector = selectAgent('office renderer')
    fireEvent.click(within(inspector).getByRole('button', { name: 'Send' }))
    expect(feed.send).not.toHaveBeenCalled()
    expect(
      within(inspector).getByText('Type a message first (up to 4000 characters).')
    ).toBeInTheDocument()
  })
})

describe('permission review', () => {
  it('peeks first, then approves, and stays open until the prompt clears', async () => {
    const { feed, push } = setup()
    const queue = screen.getByRole('region', { name: 'Needs you' })
    fireEvent.click(within(queue).getByRole('button', { name: 'Review listing search' }))
    const panel = await screen.findByRole('region', { name: 'Permission request' })
    expect(feed.peek).toHaveBeenCalledWith('claude:b')
    expect(within(panel).getByLabelText('Screen excerpt')).toHaveTextContent(
      'Do you want to proceed?'
    )
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve' }))
    expect(feed.respond).toHaveBeenCalledWith('claude:b', 'approve', 'fp-1')
    expect(await within(panel).findByText(/Approved/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Permission request' })).toBeInTheDocument()
    push(officeFrame('none'))
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Permission request' })).not.toBeInTheDocument()
    )
  })

  it('does not reopen a finished review when a later prompt appears', async () => {
    const { push } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Review listing search' }))
    const panel = await screen.findByRole('region', { name: 'Permission request' })
    await within(panel).findByLabelText('Screen excerpt')
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve' }))
    await within(panel).findByText(/Approved/)
    push(officeFrame('none'))
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Permission request' })).not.toBeInTheDocument()
    )
    push(officeFrame('permission'))
    expect(screen.queryByRole('region', { name: 'Permission request' })).not.toBeInTheDocument()
  })

  it('reviews in the office only where an answer can be sent, else in the terminal', () => {
    const focus = vi.fn(async () => ({ success: true }))
    setup({ focus })
    const queue = screen.getByRole('region', { name: 'Needs you' })
    fireEvent.click(within(queue).getByRole('button', { name: 'Review widget sync' }))
    expect(focus).toHaveBeenCalledWith('codex:c')
    expect(screen.queryByRole('region', { name: 'Permission request' })).not.toBeInTheDocument()
  })

  it('re-reads the screen when the prompt changed since it was reviewed', async () => {
    const { feed } = setup({
      respond: vi.fn(async () => ({ success: false, reason: 'prompt-changed' as const }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review listing search' }))
    const panel = await screen.findByRole('region', { name: 'Permission request' })
    await within(panel).findByLabelText('Screen excerpt')
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve' }))
    expect(
      await within(panel).findByText('The prompt changed since you reviewed it. Review it again.')
    ).toBeInTheDocument()
    await waitFor(() => expect(feed.peek).toHaveBeenCalledTimes(2))
  })

  it('reports a denied respond failure in words', async () => {
    setup({
      respond: vi.fn(async () => ({ success: false, reason: 'no-permission-prompt' as const }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review listing search' }))
    const panel = await screen.findByRole('region', { name: 'Permission request' })
    await within(panel).findByLabelText('Screen excerpt')
    fireEvent.click(within(panel).getByRole('button', { name: 'Deny' }))
    expect(
      await within(panel).findByText('No permission prompt is showing for this agent right now.')
    ).toBeInTheDocument()
  })
})

describe('peek', () => {
  it('shows the screen on demand, refreshes, and never stores or logs it', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'debug')]
    const { feed } = setup()
    const inspector = selectAgent('office renderer')
    expect(feed.peek).not.toHaveBeenCalled()
    fireEvent.click(within(inspector).getByRole('button', { name: 'Peek at screen' }))
    expect(await within(inspector).findByLabelText('Screen excerpt')).toHaveTextContent(
      'rm -rf build'
    )
    fireEvent.click(within(inspector).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(feed.peek).toHaveBeenCalledTimes(2))
    expect(setItem).not.toHaveBeenCalled()
    for (const log of logs) expect(log).not.toHaveBeenCalled()
  })

  it('shows why a peek failed', async () => {
    setup({
      peek: vi.fn(async () => ({
        success: false,
        lines: [],
        reason: 'terminal-not-found' as const
      }))
    })
    const inspector = selectAgent('office renderer')
    fireEvent.click(within(inspector).getByRole('button', { name: 'Peek at screen' }))
    expect(
      await within(inspector).findByText(
        "Couldn't find this agent's Orca pane. It may have closed."
      )
    ).toBeInTheDocument()
  })
})

describe('new agent', () => {
  it('starts a Claude agent in the project from its Offices row', async () => {
    const { feed } = setup()
    const elevator = screen.getByRole('navigation', { name: 'Offices' })
    fireEvent.click(within(elevator).getByRole('button', { name: 'New agent in Project' }))
    fireEvent.click(within(elevator).getByRole('button', { name: 'Start Claude agent' }))
    expect(feed.start).toHaveBeenCalledWith('p_1', 'claude')
    expect(await within(elevator).findByText(/Starting a Claude agent/)).toBeInTheDocument()
  })

  it('shows why a start failed', async () => {
    setup({ start: vi.fn(async () => ({ success: false, reason: 'orca-unavailable' as const })) })
    const elevator = screen.getByRole('navigation', { name: 'Offices' })
    fireEvent.click(within(elevator).getByRole('button', { name: 'New agent in Project' }))
    fireEvent.click(within(elevator).getByRole('button', { name: 'Start Codex agent' }))
    expect(
      await within(elevator).findByText("Orca isn't responding. Check that it's running.")
    ).toBeInTheDocument()
  })
})
