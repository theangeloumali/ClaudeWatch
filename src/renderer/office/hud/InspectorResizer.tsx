import { GripVertical, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'
import { cn } from '../../lib/utils'
import type { InspectorPanelController } from './use-inspector-panel'

const RESIZE_KEY_STEP_PX = 24

// dry-new: Keep pointer capture separate from modal presentation; reuse the same controller.
export function InspectorResizer({ panel }: { panel: InspectorPanelController }) {
  const dragRef = useRef<{
    element: HTMLDivElement
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const releaseDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (drag.element.hasPointerCapture?.(drag.pointerId)) {
      drag.element.releasePointerCapture(drag.pointerId)
    }
  }, [])
  useEffect(() => {
    if (panel.layout.isExpanded || panel.isNarrow) releaseDrag()
    return releaseDrag
  }, [panel.layout.isExpanded, panel.isNarrow, releaseDrag])
  const stopDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    releaseDrag()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    if (panel.isNarrow) return
    const widths: Record<string, number | undefined> = {
      ArrowLeft: panel.layout.width + RESIZE_KEY_STEP_PX,
      ArrowRight: panel.layout.width - RESIZE_KEY_STEP_PX,
      Home: panel.bounds.min,
      End: panel.bounds.max
    }
    const width = widths[event.key]
    if (width === undefined) return
    event.preventDefault()
    panel.setWidth(width)
  }
  return (
    <div
      hidden={panel.layout.isExpanded}
      className={cn(
        'sticky top-0 items-center justify-between gap-2 bg-plate px-3 py-1.5',
        panel.layout.isExpanded ? 'hidden' : 'flex'
      )}
    >
      <div
        role="separator"
        tabIndex={panel.isNarrow ? -1 : 0}
        aria-label="Resize inspector"
        aria-orientation="vertical"
        aria-valuemin={panel.bounds.min}
        aria-valuemax={panel.bounds.max}
        aria-valuenow={panel.layout.width}
        aria-valuetext={`${Math.round(panel.layout.width)} pixels wide`}
        aria-disabled={panel.isNarrow ? true : undefined}
        data-inspector-resizer=""
        title={
          panel.isNarrow
            ? 'Full-width inspector on small screens'
            : 'Drag left to widen; use Left/Right, Home/End to resize'
        }
        className={cn(
          'flex min-h-8 min-w-11 touch-none select-none items-center gap-1 rounded-md px-2 text-xs text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
          !panel.isNarrow && 'cursor-ew-resize hover:bg-surface-hover'
        )}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary || dragRef.current || panel.isNarrow) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.focus()
          dragRef.current = {
            element: event.currentTarget,
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: panel.layout.width
          }
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          panel.setWidth(drag.startWidth + drag.startX - event.clientX)
        }}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={() => {
          dragRef.current = null
        }}
      >
        <GripVertical aria-hidden="true" className="size-3.5" />
        {panel.isNarrow ? 'Full width' : 'Resize'}
      </div>
      <button
        type="button"
        disabled={panel.isNarrow}
        aria-label="Reset width of inspector"
        title="Reset inspector width"
        onClick={panel.resetWidth}
        className={BUTTON_QUIET_COMPACT_CLASS}
      >
        <RotateCcw aria-hidden="true" className="size-3.5" />
        Reset width
      </button>
    </div>
  )
}
