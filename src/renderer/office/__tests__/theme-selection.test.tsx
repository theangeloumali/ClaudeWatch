import { act, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useOfficeTheme } from '../hooks'
import { useOfficeHotkeys } from '../use-office-effects'
import { listThemes, themeForTeam } from '../themes/registry'

beforeEach(() => localStorage.clear())
// Here, not in the test: a spy left behind by a failing test would fail every test after it.
afterEach(() => vi.restoreAllMocks())

it('keeps the legacy Neo Edo fallback for an unknown saved theme', () => {
  localStorage.setItem('claudewatch.office.theme', 'missing')
  const { result } = renderHook(useOfficeTheme)
  expect(result.current.theme.id).toBe('neo-edo-steam')
})

it('renders with the default theme when the stored one cannot be read or written', () => {
  const refuse = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse)

  const { result } = renderHook(useOfficeTheme)
  expect(result.current.theme.id).toBe(themeForTeam().id)
  act(() => result.current.cycleTheme())
  expect(result.current.theme.id).not.toBe(themeForTeam().id)
})

it('restores a registered theme, cycles in registry order and persists', () => {
  const lastThemeId = listThemes().at(-1)?.id ?? ''
  localStorage.setItem('claudewatch.office.theme', lastThemeId)
  const { result } = renderHook(useOfficeTheme)
  expect(result.current.theme.id).toBe(lastThemeId)
  act(() => result.current.cycleTheme())
  expect(result.current.theme.id).toBe('neo-edo-steam')
  expect(localStorage.getItem('claudewatch.office.theme')).toBe('neo-edo-steam')
})

it('cycles from T without dispatching a reducer action or intercepting editable input', () => {
  const dispatch = vi.fn()
  const cycle = vi.fn()
  renderHook(() =>
    useOfficeHotkeys(dispatch, false, {
      onCycleTheme: cycle,
      onFocusTerminal: vi.fn(),
      onToggleSettings: vi.fn()
    })
  )
  fireEvent.keyDown(window, { key: 'T' })
  expect(cycle).toHaveBeenCalledTimes(1)
  expect(dispatch).not.toHaveBeenCalled()
  const input = document.createElement('input')
  document.body.append(input)
  fireEvent.keyDown(input, { key: 't' })
  expect(cycle).toHaveBeenCalledTimes(1)
  input.remove()
})

it('says the floor default changed when T cycles with no office in focus', () => {
  const { result } = renderHook(useOfficeTheme)
  act(() => result.current.cycleTheme())
  expect(result.current.notice).toBe(
    'Map theme is now Neo Edo Steam. Offices with their own theme keep it.'
  )
  act(() => result.current.dismissNotice())
  expect(result.current.notice).toBe('')
})
