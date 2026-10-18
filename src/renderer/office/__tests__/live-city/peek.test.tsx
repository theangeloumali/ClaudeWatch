import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PeekResult } from '../../../../shared/office/types'
import { PeekPanel } from '../../hud/PeekPanel'

const NOW = 1_000_000
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('captures only on demand and labels actual capture time and exact target', async () => {
  const peek = vi.fn(
    async (): Promise<PeekResult> => ({
      success: true,
      lines: ['<a href="private">inert</a>'],
      capturedAtMs: NOW - 2000,
      targetAgentKey: 'claude:a'
    })
  )
  render(<PeekPanel agentKey="claude:a" peek={peek} />)
  expect(peek).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
  expect(peek).toHaveBeenCalledWith('claude:a')
  expect(screen.getByText(/Captured at/)).toHaveTextContent(new Date(NOW - 2000).toISOString())
  expect(screen.getByText(/Capture target/)).toHaveTextContent('claude:a')
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.getByLabelText('Screen excerpt')).toHaveTextContent('<a href="private">inert</a>')
})

it('clears captures on selected key, pane, and incarnation changes and expiry', async () => {
  const peek = vi.fn(
    async (): Promise<PeekResult> => ({ success: true, lines: ['private'], capturedAtMs: NOW })
  )
  const { rerender } = render(
    <PeekPanel agentKey="claude:a" paneKey="pane-a" incarnationKey="first" peek={peek} />
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
  rerender(<PeekPanel agentKey="claude:a" paneKey="pane-a" incarnationKey="second" peek={peek} />)
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
  rerender(<PeekPanel agentKey="claude:a" paneKey="pane-b" incarnationKey="second" peek={peek} />)
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
  rerender(<PeekPanel agentKey="claude:b" paneKey="pane-b" incarnationKey="second" peek={peek} />)
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
  act(() => vi.advanceTimersByTime(61000))
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
  expect(screen.getByText(/Capture expired/)).toBeInTheDocument()
})

it('drops old in-flight captures after a target change', async () => {
  let resolveCapture: (result: PeekResult) => void = () => undefined
  const peek = vi.fn(
    () =>
      new Promise<PeekResult>((resolve) => {
        resolveCapture = resolve
      })
  )
  const { rerender } = render(<PeekPanel agentKey="claude:a" peek={peek} />)
  fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' }))
  rerender(<PeekPanel agentKey="claude:b" peek={peek} />)
  await act(async () => resolveCapture({ success: true, lines: ['old private'] }))
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
})

it('explains disabled view-only capture and makes no RPC', () => {
  const peek = vi.fn(async (): Promise<PeekResult> => ({ success: true, lines: ['private'] }))
  render(<PeekPanel agentKey="claude:a" peek={peek} isViewOnly />)
  const button = screen.getByRole('button', { name: 'Capture unavailable' })
  expect(button).toBeDisabled()
  expect(screen.getByText(/Reason:.*view-only/)).toBeInTheDocument()
  fireEvent.click(button)
  expect(peek).not.toHaveBeenCalled()
})

it('does not invent capture timestamps and hides rejected or mismatched output', async () => {
  const peek = vi.fn(async (): Promise<PeekResult> => ({ success: true, lines: ['legacy'] }))
  const { rerender } = render(<PeekPanel agentKey="claude:a" peek={peek} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
  expect(screen.getByText('Capture time unavailable')).toBeInTheDocument()
  peek.mockResolvedValueOnce({
    success: true,
    lines: ['wrong private'],
    targetAgentKey: 'claude:b'
  })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh' })))
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
  rerender(
    <PeekPanel
      agentKey="claude:c"
      peek={async () => {
        throw new Error('private rejection')
      }}
    />
  )
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
  expect(screen.queryByText(/private rejection/)).toBeNull()
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
})

it('rejects a different pane or terminal incarnation even when the agent key matches', async () => {
  const terminal = {
    ownerAgentKey: 'claude:a',
    paneKey: 'pane-a',
    pid: 100,
    startedAtMs: 1,
    incarnationId: 'first'
  }
  const peek = vi.fn(
    async (): Promise<PeekResult> => ({
      success: true,
      lines: ['wrong private'],
      targetAgentKey: 'claude:a',
      capturedAtMs: NOW,
      terminal: { ...terminal, paneKey: 'pane-b' }
    })
  )
  render(<PeekPanel agentKey="claude:a" peek={peek} paneKey="pane-a" terminal={terminal} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
  peek.mockResolvedValueOnce({
    success: true,
    lines: ['wrong private'],
    targetAgentKey: 'claude:a',
    terminal: { ...terminal, incarnationId: 'second' }
  })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh' })))
  expect(screen.queryByLabelText('Screen excerpt')).toBeNull()
})
