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

it('preserves the latest wheel-scroll position when the window clamps a widened inspector', async () => {
  createOfficeHarness()
  const inspector = selectInspector()
  fireEvent.click(within(inspector).getByRole('button', { name: 'Peek at screen' }))
  const excerpt = await within(inspector).findByLabelText('Screen excerpt')
  fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize inspector' }), { key: 'End' })
  excerpt.scrollTop = 150
  excerpt.scrollLeft = 80
  fireEvent.scroll(excerpt)
  setViewportWidth(900)
  expect(excerpt.scrollTop).toBe(150)
  expect(excerpt.scrollLeft).toBe(80)
})
