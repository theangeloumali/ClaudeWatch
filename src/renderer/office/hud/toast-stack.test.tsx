import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSession } from '../__tests__/fixtures'
import { MAX_TOASTS, TOAST_LIFETIME_MS, ToastStack, toastAge } from './ToastStack'

const scripts = makeSession({
  key: 'claude:s1',
  name: 'hooks',
  projectLabel: 'Scripts',
  projectKey: 'p_scripts'
})
const chips = new Map([['p_scripts', '#f59e0b']])
const news = (id: string, text: string) => ({ id, text })

describe('ToastStack', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('splits the project name from the event line, newest on top, at most three', () => {
    const { rerender } = render(<ToastStack news={null} sessions={[scripts]} chips={chips} />)
    for (const index of [1, 2, 3, 4]) {
      rerender(
        <ToastStack
          news={news(`claude:s1:done:${index}`, `Scripts › hooks · drafted ${index}`)}
          sessions={[scripts]}
          chips={chips}
        />
      )
    }
    const toasts = within(screen.getByRole('log')).getAllByRole('listitem')
    expect(toasts).toHaveLength(MAX_TOASTS)
    expect(toasts[0].textContent).toContain('hooks · drafted 4')
    expect(within(toasts[0]).getByText('Scripts')).toBeTruthy()
    expect(toasts[2].textContent).toContain('drafted 2')
    expect(screen.getByRole('log').getAttribute('aria-live')).toBe('polite')
  })

  it('dismisses each toast after its lifetime', () => {
    const { rerender } = render(<ToastStack news={null} sessions={[]} chips={chips} />)
    rerender(<ToastStack news={news('hoist', 'A tower rose')} sessions={[]} chips={chips} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    act(() => vi.advanceTimersByTime(TOAST_LIFETIME_MS + 1))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('reads the age as now, then whole minutes', () => {
    expect(toastAge(59_000)).toBe('now')
    expect(toastAge(125_000)).toBe('2m')
  })
})
