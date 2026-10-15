import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import type { InspectorPanelController } from './use-inspector-panel'

interface ScrollPosition {
  element: HTMLElement
  top: number
  left: number
}

function findFocusableElements(panel: HTMLElement): HTMLElement[] {
  // DOM order is the tab sequence, even when a selector engine groups matching element types.
  return [...panel.querySelectorAll<HTMLElement>('*')].filter(
    (element) =>
      element.matches(
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]'
      ) &&
      element.tabIndex >= 0 &&
      !element.closest('[hidden]') &&
      getComputedStyle(element).display !== 'none' &&
      getComputedStyle(element).visibility !== 'hidden'
  )
}

// dry-new: A native dialog cannot legally become a complementary landmark; keep one conforming node.
export function useInspectorDialog(panel: InspectorPanelController) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef(document.activeElement)
  const wasExpanded = useRef(false)
  const scrollPositions = useRef<{ docked: ScrollPosition[]; expanded: ScrollPosition[] }>({
    docked: [],
    expanded: []
  })
  const { isExpanded } = panel.layout
  useEffect(() => {
    const fallback = dialogRef.current?.closest('main')?.querySelector<HTMLElement>('h1')
    return () => {
      const opener = openerRef.current
      if (
        opener instanceof HTMLElement &&
        opener !== document.body &&
        opener.isConnected &&
        !opener.closest('[inert]')
      ) {
        opener.focus({ preventScroll: true })
      } else if (fallback?.isConnected) {
        fallback.focus({ preventScroll: true })
      }
    }
  }, [])
  const captureScroll = (): void => {
    const dialog = dialogRef.current
    if (!dialog) return
    const elements = [dialog, ...dialog.querySelectorAll<HTMLElement>('*')]
    const positions = elements.map((element) => ({
      element,
      top: element.scrollTop,
      left: element.scrollLeft
    }))
    scrollPositions.current[isExpanded ? 'expanded' : 'docked'] = positions
  }
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!isExpanded) {
      if (wasExpanded.current) {
        dialog
          .querySelector<HTMLButtonElement>('[data-inspector-expand]')
          ?.focus({ preventScroll: true })
      }
      wasExpanded.current = false
      return
    }
    wasExpanded.current = true
    const siblings = new Map<HTMLElement, boolean>()
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (!(sibling instanceof HTMLElement) || sibling === branch) continue
        siblings.set(sibling, sibling.hasAttribute('inert'))
        sibling.setAttribute('inert', '')
      }
      branch = branch.parentElement
      if (branch === document.body) break
    }
    const focusInside = (): void =>
      (findFocusableElements(dialog)[0] ?? dialog).focus({ preventScroll: true })
    const containFocus = (event: FocusEvent): void => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusInside()
    }
    document.addEventListener('focusin', containFocus, true)
    focusInside()
    return () => {
      document.removeEventListener('focusin', containFocus, true)
      for (const [sibling, wasInert] of siblings) {
        if (!wasInert) sibling.removeAttribute('inert')
      }
    }
  }, [isExpanded])
  useLayoutEffect(() => {
    const positions = scrollPositions.current[isExpanded ? 'expanded' : 'docked']
    for (const { element, top, left } of positions) {
      if (!element.isConnected) continue
      element.scrollTop = top
      element.scrollLeft = left
    }
  }, [isExpanded])
  const trapTab = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab' || !dialogRef.current) return
    const elements = findFocusableElements(dialogRef.current)
    const first = elements[0]
    const last = elements.at(-1)
    if (!first || !last) {
      event.preventDefault()
      dialogRef.current.focus()
      return
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  return { dialogRef, captureScroll, trapTab }
}
