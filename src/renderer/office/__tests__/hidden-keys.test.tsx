import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeAgent } from '../../../shared/office/observation'
import type { PeekResult } from '../../../shared/office/types'
import { OperationsWorkerRow } from '../hud/operations-components'
import { PeekPanel } from '../hud/PeekPanel'
import { officeSettings } from '../logic/office-settings'
import { makeFrame } from './fixtures'

// A teammate's agent key carries its name and its team's.
const TEAMMATE_KEY = 'claude:5f1c9a2e#lena@acme-payroll'
const KEYS = /5f1c9a2e|lena|acme-payroll/

// The tooltip text and every visible word, as a recording would show them.
const shownText = (root: Element): string => {
  const titles = [...root.querySelectorAll('[title]')].map((el) => el.getAttribute('title'))
  return [root.textContent, ...titles].join('\n')
}

beforeEach(() => {
  localStorage.clear()
  officeSettings.reset()
  officeSettings.set('hideNames', true)
})
afterEach(() => {
  cleanup()
  officeSettings.reset()
})

describe('with names hidden, no agent key reaches the screen', () => {
  it('a worker row in an office', () => {
    const { container } = render(
      <OperationsWorkerRow
        worker={{
          key: TEAMMATE_KEY,
          label: 'Teammate 1',
          sessionKey: 'claude:5f1c9a2e',
          projectLabel: 'Project A-1',
          provider: 'claude',
          roomId: null,
          isSubagent: true,
          isPresent: true,
          detail: 'Editing',
          evidence: observeAgent({ ...makeFrame(), agentKey: TEAMMATE_KEY, nowMs: 0 })
        }}
        onChooseWorker={vi.fn()}
      />
    )
    expect(shownText(container)).toMatch(/Teammate 1/)
    expect(shownText(container).match(KEYS)).toBeNull()
  })

  it('a screen capture of a teammate', async () => {
    const peek = vi.fn(
      async (): Promise<PeekResult> => ({
        success: true,
        lines: ['ready'],
        capturedAtMs: Date.now(),
        targetAgentKey: TEAMMATE_KEY,
        terminal: {
          ownerAgentKey: TEAMMATE_KEY,
          paneKey: 'pane-7',
          pid: 42,
          startedAtMs: 1,
          incarnationId: 'inc-1'
        }
      })
    )
    const { container } = render(<PeekPanel agentKey={TEAMMATE_KEY} peek={peek} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
    expect(peek).toHaveBeenCalledWith(TEAMMATE_KEY)
    expect(screen.getByText(/Capture target/)).toHaveTextContent('Hidden')
    expect(shownText(container).match(KEYS)).toBeNull()
  })

  // A terminal can print anything, a project path or a client's name included.
  it('a peek shows no screen text while names are hidden', async () => {
    const peek = vi.fn(
      async (): Promise<PeekResult> => ({
        success: true,
        lines: ['~/Work/acme-payroll $ git status'],
        capturedAtMs: Date.now(),
        targetAgentKey: TEAMMATE_KEY
      })
    )
    const { container } = render(<PeekPanel agentKey={TEAMMATE_KEY} peek={peek} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Peek at screen' })))
    expect(shownText(container).match(KEYS)).toBeNull()
    expect(screen.getByText(/hidden while names are hidden/i)).toBeInTheDocument()
  })
})
