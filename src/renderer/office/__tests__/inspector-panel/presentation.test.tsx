import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createOfficeHarness,
  installInspectorTestEnvironment,
  selectInspector
} from './office-harness'

vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => false }))
installInspectorTestEnvironment()

describe('inspector presentation', () => {
  it('contains Tab focus and restores background inertness on return to docked mode', () => {
    createOfficeHarness()
    const inspector = selectInspector()
    const table = screen.getByRole('table', { name: /agents by company and project/i })
    fireEvent.click(within(inspector).getByRole('button', { name: 'Expand inspector' }))
    const first = within(inspector).getByRole('button', { name: 'Restore inspector' })
    const last = within(inspector).getByRole('button', { name: 'Peek at screen' })
    expect(table.closest('[inert]')).not.toBeNull()
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.click(first)
    expect(table.closest('[inert]')).toBeNull()
  })
  it('returns focus to Expand after restoring the expanded panel', () => {
    createOfficeHarness()
    const inspector = selectInspector()
    const expand = within(inspector).getByRole('button', { name: 'Expand inspector' })
    expand.focus()
    fireEvent.click(expand)
    fireEvent.click(screen.getByRole('button', { name: 'Restore inspector' }))
    expect(within(inspector).getByRole('button', { name: 'Expand inspector' })).toHaveFocus()
  })
  it('offers Expand and Restore and gives only the expanded panel dialog semantics', () => {
    createOfficeHarness()
    const inspector = selectInspector()
    expect(screen.queryByRole('dialog', { name: 'Agent details' })).not.toBeInTheDocument()

    fireEvent.click(within(inspector).getByRole('button', { name: 'Expand inspector' }))
    const expanded = screen.getByRole('dialog', { name: 'Agent details' })
    expect(expanded).toBe(inspector)
    expect(expanded).toHaveAttribute('aria-modal', 'true')
    fireEvent.click(within(expanded).getByRole('button', { name: 'Restore inspector' }))

    expect(screen.getByRole('complementary', { name: 'Agent details' })).toBe(inspector)
    expect(screen.queryByRole('dialog', { name: 'Agent details' })).not.toBeInTheDocument()
    expect(inspector).not.toHaveAttribute('aria-modal', 'true')
  })

  it('restores on Escape without deselecting the agent or replacing its draft field', () => {
    createOfficeHarness()
    const inspector = selectInspector()
    const draft = within(inspector).getByRole('textbox', { name: 'Message office renderer' })
    fireEvent.change(draft, { target: { value: 'Keep this unsent message' } })
    fireEvent.click(within(inspector).getByRole('button', { name: 'Expand inspector' }))
    expect(screen.getByRole('dialog', { name: 'Agent details' })).toBe(inspector)
    fireEvent.keyDown(draft, { key: 'Escape' })

    const restored = screen.getByRole('complementary', { name: 'Agent details' })
    expect(restored).toBe(inspector)
    expect(within(restored).getByRole('textbox')).toBe(draft)
    expect(draft).toHaveValue('Keep this unsent message')
    expect(within(restored).getByRole('button', { name: 'Expand inspector' })).toBeEnabled()
  })

  it('does not peek or perform session actions when expanding and restoring', () => {
    const { feed } = createOfficeHarness()
    const inspector = selectInspector()
    fireEvent.click(within(inspector).getByRole('button', { name: 'Expand inspector' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore inspector' }))

    expect(feed.peek).not.toHaveBeenCalled()
    expect(feed.send).not.toHaveBeenCalled()
    expect(feed.respond).not.toHaveBeenCalled()
    expect(feed.start).not.toHaveBeenCalled()
    expect(feed.focus).not.toHaveBeenCalled()
  })

  it('retains the same screen excerpt, scroll offsets and draft through resize and expansion', async () => {
    const { feed } = createOfficeHarness()
    const inspector = selectInspector()
    const draft = within(inspector).getByRole('textbox', { name: 'Message office renderer' })
    fireEvent.change(draft, { target: { value: 'Run tests after I finish reading' } })
    fireEvent.click(within(inspector).getByRole('button', { name: 'Peek at screen' }))
    const excerpt = await within(inspector).findByLabelText('Screen excerpt')
    excerpt.scrollTop = 112
    excerpt.scrollLeft = 24

    fireEvent.keyDown(screen.getByRole('separator', { name: /resize inspector/i }), {
      key: 'ArrowLeft'
    })
    fireEvent.click(within(inspector).getByRole('button', { name: 'Expand inspector' }))
    const expanded = screen.getByRole('dialog', { name: 'Agent details' })
    expect(within(expanded).getByLabelText('Screen excerpt')).toBe(excerpt)
    expect(within(expanded).getByRole('textbox')).toBe(draft)
    fireEvent.click(within(expanded).getByRole('button', { name: 'Restore inspector' }))

    const restored = screen.getByRole('complementary', { name: 'Agent details' })
    expect(within(restored).getByLabelText('Screen excerpt')).toBe(excerpt)
    expect(excerpt.scrollTop).toBe(112)
    expect(excerpt.scrollLeft).toBe(24)
    expect(excerpt).toHaveTextContent('Fixture terminal line 59')
    expect(draft).toHaveValue('Run tests after I finish reading')
    expect(feed.peek).toHaveBeenCalledTimes(1)
    expect(feed.peek).toHaveBeenCalledWith('claude:renderer')
    expect(feed.send).not.toHaveBeenCalled()
    expect(feed.respond).not.toHaveBeenCalled()
  })
})
