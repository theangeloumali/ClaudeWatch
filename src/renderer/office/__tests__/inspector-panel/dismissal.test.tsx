import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createOfficeHarness,
  installInspectorTestEnvironment,
  selectInspector
} from './office-harness'
import { makeFrame } from '../fixtures'

vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => false }))
installInspectorTestEnvironment()

describe('inspector dismissal focus', () => {
  it('returns focus to the surviving selection opener after expanded Close', async () => {
    createOfficeHarness()
    const table = screen.getByRole('table')
    const opener = within(table).getByRole('button', { name: 'office renderer' })
    opener.focus()
    const inspector = selectInspector()
    fireEvent.click(within(inspector).getByRole('button', { name: 'Expand inspector' }))
    const close = screen.getByRole('button', { name: 'Close' })
    close.focus()
    fireEvent.click(close)
    await waitFor(() => expect(opener).toHaveFocus())
    expect(table.closest('[inert]')).toBeNull()
  })

  it('focuses the Office heading when the selected worker and opener disappear', async () => {
    const { push } = createOfficeHarness()
    const inspector = selectInspector()
    fireEvent.click(within(inspector).getByRole('button', { name: 'Expand inspector' }))
    push(makeFrame())
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Office' })).toHaveFocus())
    expect(screen.queryByRole('dialog', { name: 'Agent details' })).toBeNull()
  })
})
