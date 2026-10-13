import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SessionHistory } from '../components/SessionHistory'
import type { SessionHistoryEntry } from '../lib/types'
import { mockApi } from './api-mock'

const entry = (pid: number, projectName: string): SessionHistoryEntry => ({
  pid,
  projectPath: `/w/${projectName}`,
  projectName,
  status: 'exited',
  startedAt: new Date('2026-10-11T10:00:00'),
  endedAt: new Date('2026-10-11T10:30:00'),
  durationSeconds: 1800,
  flags: []
})

describe('SessionHistory', () => {
  const clearHistory = vi.fn().mockResolvedValue({ success: true })

  beforeEach(() => {
    clearHistory.mockClear()
    window.api = mockApi({
      getHistory: vi.fn().mockResolvedValue([entry(1, 'ZKidz/ClaudeWatch'), entry(2, 'w/PropApp')]),
      clearHistory
    })
  })

  it('lists ended sessions with how long each ran', async () => {
    render(<SessionHistory />)
    const row = (await screen.findByText('ZKidz/ClaudeWatch')).closest('li')
    expect(row).toHaveTextContent('30:00')
  })

  it('crests a session by its folder, even under a Windows path saved by an older build', async () => {
    const windowsPath = 'C:\\Users\\a\\PropApp'
    window.api = mockApi({ getHistory: vi.fn().mockResolvedValue([entry(3, windowsPath)]) })
    render(<SessionHistory />)
    const row = (await screen.findByText(windowsPath)).closest('li')
    expect(row?.querySelector('.crest')).toHaveTextContent('PA')
  })

  it('asks before clearing and clears only once confirmed', async () => {
    render(<SessionHistory />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clear history' }))

    expect(screen.getByText('Clear 2 sessions?')).toBeInTheDocument()
    expect(clearHistory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await waitFor(() => expect(clearHistory).toHaveBeenCalledOnce())
    expect(await screen.findByText('No session history yet')).toBeInTheDocument()
  })

  it('keeps the history when the question is declined', async () => {
    render(<SessionHistory />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clear history' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))

    expect(clearHistory).not.toHaveBeenCalled()
    expect(screen.getByText('w/PropApp')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear history' })).toBeInTheDocument()
  })
})
