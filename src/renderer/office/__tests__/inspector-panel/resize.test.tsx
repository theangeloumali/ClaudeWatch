import { fireEvent, renderHook, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useOfficeHotkeys } from '../../use-office-effects'
import {
  createOfficeHarness,
  installInspectorTestEnvironment,
  selectInspector,
  setViewportWidth
} from './office-harness'

vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => false }))
installInspectorTestEnvironment()

function inspectorResizer(): HTMLElement {
  return screen.getByRole('separator', { name: /resize inspector/i })
}

function currentWidth(resizer: HTMLElement): number {
  const width = resizer.getAttribute('aria-valuenow')
  if (width === null) throw new Error('Inspector resizer must report its current width')
  return Number(width)
}

function fireResizePointer(
  resizer: HTMLElement,
  properties: { type: string; clientX: number }
): void {
  const event = new Event(properties.type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: 7 },
    clientX: { value: properties.clientX },
    button: { value: 0 },
    isPrimary: { value: true }
  })
  fireEvent(resizer, event)
}

describe('inspector resizing', () => {
  it('captures a drag pointer, grows by its leftward movement and stops resizing after release', () => {
    createOfficeHarness()
    selectInspector()
    const resizer = inspectorResizer()
    let capturedPointer: number | null = null
    const capture = vi.fn((pointerId: number) => {
      capturedPointer = pointerId
    })
    const release = vi.fn(() => {
      capturedPointer = null
    })
    Object.defineProperties(resizer, {
      setPointerCapture: { value: capture },
      hasPointerCapture: { value: (pointerId: number) => capturedPointer === pointerId },
      releasePointerCapture: { value: release }
    })
    fireResizePointer(resizer, { type: 'pointerdown', clientX: 900 })
    expect(capture).toHaveBeenCalledWith(7)
    fireResizePointer(resizer, { type: 'pointermove', clientX: 820 })
    expect(currentWidth(resizer)).toBe(400)
    fireResizePointer(resizer, { type: 'pointerup', clientX: 820 })
    expect(release).toHaveBeenCalledWith(7)
    fireResizePointer(resizer, { type: 'pointermove', clientX: 700 })
    expect(currentWidth(resizer)).toBe(400)
  })
  it('exposes a focusable vertical separator with finite width bounds', () => {
    createOfficeHarness()
    selectInspector()
    const resizer = inspectorResizer()
    resizer.focus()
    expect(resizer).toHaveFocus()
    expect(resizer).toHaveAttribute('aria-orientation', 'vertical')
    expect(currentWidth(resizer)).toBe(320)
    expect(Number(resizer.getAttribute('aria-valuemin'))).toBeGreaterThan(0)
    expect(Number(resizer.getAttribute('aria-valuemax'))).toBeGreaterThan(320)
    expect(Number(resizer.getAttribute('aria-valuemax'))).toBeLessThan(1280)
  })

  it('grows leftward, shrinks rightward and resets to the original docked width', () => {
    createOfficeHarness()
    const inspector = selectInspector()
    const resizer = inspectorResizer()
    const hudGrid = inspector.closest<HTMLElement>('[style*="--office-right-rail"]')
    fireEvent.keyDown(resizer, { key: 'ArrowLeft' })
    expect(currentWidth(resizer)).toBeGreaterThan(320)
    expect(hudGrid?.style.getPropertyValue('--office-right-rail')).toBe(
      `${currentWidth(resizer)}px`
    )
    fireEvent.keyDown(resizer, { key: 'ArrowRight' })
    expect(currentWidth(resizer)).toBe(320)
    fireEvent.keyDown(resizer, { key: 'ArrowLeft' })
    fireEvent.click(within(inspector).getByRole('button', { name: /reset.*(?:inspector|width)/i }))
    expect(currentWidth(resizer)).toBe(320)
    expect(hudGrid?.style.getPropertyValue('--office-right-rail')).toBe('320px')
  })

  it('restores the user-resized width rather than resetting it after expansion', () => {
    createOfficeHarness()
    const inspector = selectInspector()
    fireEvent.keyDown(inspectorResizer(), { key: 'ArrowLeft' })
    const resizedWidth = currentWidth(inspectorResizer())
    expect(resizedWidth).toBeGreaterThan(320)
    fireEvent.click(within(inspector).getByRole('button', { name: 'Expand inspector' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore inspector' }))
    expect(currentWidth(inspectorResizer())).toBe(resizedWidth)
  })

  it('clamps a widened panel when the viewport shrinks, including below the rail breakpoint', () => {
    createOfficeHarness()
    selectInspector()
    const resizerBeforeShrink = inspectorResizer()
    const initialMaximum = Number(resizerBeforeShrink.getAttribute('aria-valuemax'))
    expect(initialMaximum).toBeGreaterThan(320)
    fireEvent.keyDown(resizerBeforeShrink, { key: 'End' })
    expect(currentWidth(resizerBeforeShrink)).toBe(initialMaximum)
    for (const viewportWidth of [900, 390]) {
      setViewportWidth(viewportWidth)
      if (viewportWidth < 768) {
        fireEvent.click(screen.getByRole('button', { name: 'Show worker details' }))
      }
      const resizer = inspectorResizer()
      const maximumWidth = Number(resizer.getAttribute('aria-valuemax'))
      expect(maximumWidth).toBeGreaterThan(0)
      expect(maximumWidth).toBeLessThanOrEqual(viewportWidth - 24)
      expect(currentWidth(resizer)).toBeLessThanOrEqual(maximumWidth)
      expect(screen.getByRole('button', { name: 'Expand inspector' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    }
  })

  it('keeps resizer keystrokes out of global wall, camera, theme and focus commands', () => {
    createOfficeHarness()
    selectInspector()
    const dispatch = vi.fn()
    const onCycleTheme = vi.fn()
    const onFocusTerminal = vi.fn()
    const onToggleSettings = vi.fn()
    renderHook(() =>
      useOfficeHotkeys(dispatch, false, { onCycleTheme, onFocusTerminal, onToggleSettings })
    )
    const resizer = inspectorResizer()
    resizer.focus()
    for (const key of ['Home', 'End', 'ArrowLeft', 'ArrowRight', 'q', 'e', 't', 'f']) {
      fireEvent.keyDown(resizer, { key })
    }
    expect(dispatch).not.toHaveBeenCalled()
    expect(onCycleTheme).not.toHaveBeenCalled()
    expect(onFocusTerminal).not.toHaveBeenCalled()
    expect(onToggleSettings).not.toHaveBeenCalled()
  })
})
