import { fireEvent, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import {
  createOfficeHarness,
  installInspectorTestEnvironment,
  selectInspector,
  setViewportWidth
} from './office-harness'

vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => false }))
installInspectorTestEnvironment()

it('starts mobile worker details collapsed without acting on the provider', () => {
  setViewportWidth(390)
  vi.stubGlobal('innerHeight', 844)
  const { feed } = createOfficeHarness()
  const inspector = selectInspector()
  expect(inspector).toHaveStyle({ maxHeight: '100px' })
  expect(within(inspector).getByRole('button', { name: 'Show worker details' })).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  expect(within(inspector).queryByRole('textbox')).not.toBeInTheDocument()
  for (const action of [feed.focus, feed.send, feed.respond, feed.peek, feed.start])
    expect(action).not.toHaveBeenCalled()
})

it('retains the same draft through sheet collapse and returns focus on Escape', () => {
  setViewportWidth(390)
  vi.stubGlobal('innerHeight', 844)
  createOfficeHarness()
  const inspector = selectInspector()
  fireEvent.click(within(inspector).getByRole('button', { name: 'Show worker details' }))
  expect(inspector).toHaveStyle({ maxHeight: '360px' })
  expect(inspector).not.toHaveAttribute('aria-modal')
  const draft = within(inspector).getByRole('textbox', { name: 'Message office renderer' })
  fireEvent.change(draft, { target: { value: 'Keep this draft' } })
  fireEvent.keyDown(draft, { key: 'Escape' })
  const handle = within(inspector).getByRole('button', { name: 'Show worker details' })
  expect(handle).toHaveFocus()
  expect(screen.getByRole('complementary', { name: 'Agent details' })).toBe(inspector)
  fireEvent.click(handle)
  expect(within(inspector).getByRole('textbox')).toBe(draft)
  expect(draft).toHaveValue('Keep this draft')
  setViewportWidth(1280)
  expect(within(inspector).getByRole('textbox')).toBe(draft)
  expect(
    within(inspector).queryByRole('button', { name: /worker details/ })
  ).not.toBeInTheDocument()
})
