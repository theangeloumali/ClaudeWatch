import { Maximize2, Minimize2, X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'
import { cn } from '../../lib/utils'
import {
  HUD_COLUMNS_BREAKPOINT,
  HUD_GRID_STYLE,
  HUD_SAFE_INSETS,
  inspectorSheetHeight
} from '../logic/hud-layout'
import { useInspectorDialog } from './use-inspector-dialog'
import type { InspectorPanelController } from './use-inspector-panel'

interface InspectorPanelProps {
  panel: InspectorPanelController
  children: ReactNode
}

// dry-new: OfficeSettings is a popover; this panel must retain its DOM while becoming modal.
export function InspectorPanel({ panel, children }: InspectorPanelProps) {
  const { dialogRef, captureScroll, trapTab } = useInspectorDialog(panel)
  const sheetHandleRef = useRef<HTMLButtonElement>(null)
  const sheetBodyId = useId()
  const { isExpanded, viewportHeight, topInset } = panel.layout
  const hasCompactSheet = panel.layout.viewportWidth < HUD_COLUMNS_BREAKPOINT && !isExpanded
  const isSheetCollapsed = hasCompactSheet && !panel.layout.isSheetOpen
  const viewportPadding = HUD_GRID_STYLE.padding
  const contentTop = topInset + (panel.layout.hudTopHeight ?? 0)
  const contentBottom = panel.layout.hudBottomHeight ?? HUD_SAFE_INSETS.bottom
  let maxHeight = Math.max(1, viewportHeight - contentTop - contentBottom)
  if (panel.isNarrow)
    maxHeight = inspectorSheetHeight(
      viewportHeight,
      hasCompactSheet ? panel.layout.isSheetOpen : undefined
    )
  if (isExpanded) maxHeight = Math.max(1, viewportHeight - topInset - viewportPadding * 2)
  let positionClass = 'relative w-full max-w-none'
  if (panel.isNarrow) positionClass = 'fixed inset-x-3 z-10 w-auto max-w-none'
  if (isExpanded)
    positionClass =
      'fixed inset-x-3 bottom-3 top-auto mx-auto w-auto max-w-none md:top-12 md:w-[min(1100px,calc(100vw-3rem))]'
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role={isExpanded ? 'dialog' : 'complementary'}
      aria-label="Agent details"
      aria-modal={isExpanded ? true : undefined}
      data-inspector-expanded={isExpanded ? 'true' : 'false'}
      onClickCapture={captureScroll}
      onPointerDownCapture={captureScroll}
      onKeyDownCapture={captureScroll}
      onKeyDown={(event) => {
        if (hasCompactSheet && panel.layout.isSheetOpen && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          panel.collapseSheet()
          sheetHandleRef.current?.focus()
          return
        }
        if (!isExpanded) return
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          panel.restore()
        }
        trapTab(event)
      }}
      onKeyUp={(event) => {
        if (isExpanded) event.stopPropagation()
      }}
      className={cn(
        'isolate m-0 min-w-0 overscroll-contain border-0 bg-transparent p-0 text-text-primary [color-scheme:dark]',
        positionClass,
        isExpanded && 'z-50',
        hasCompactSheet && 'flex flex-col'
      )}
      style={{
        maxHeight,
        ...(hasCompactSheet ? { height: maxHeight } : {}),
        ...(panel.isNarrow && !isExpanded ? { bottom: contentBottom } : {}),
        ...(isExpanded
          ? { top: topInset + viewportPadding, bottom: viewportPadding, height: maxHeight }
          : {})
      }}
    >
      <div
        aria-hidden="true"
        className={cn('fixed inset-0 -z-10 bg-surface/70', !isExpanded && 'hidden')}
      />
      {hasCompactSheet && (
        <button
          type="button"
          ref={sheetHandleRef}
          aria-expanded={!isSheetCollapsed}
          aria-controls={sheetBodyId}
          onClick={panel.toggleSheet}
          className={cn(
            'min-h-11 shrink-0 border border-border bg-surface-raised px-3 text-left text-body text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
            isSheetCollapsed && 'h-full'
          )}
        >
          {isSheetCollapsed ? 'Show worker details' : 'Hide worker details'}
        </button>
      )}
      <div
        id={sheetBodyId}
        hidden={isSheetCollapsed}
        className={
          isSheetCollapsed
            ? 'hidden'
            : hasCompactSheet
              ? 'flex min-h-0 flex-1 flex-col'
              : 'contents'
        }
        style={{ maxHeight: hasCompactSheet ? Math.max(1, maxHeight - 44) : maxHeight }}
      >
        {children}
      </div>
    </div>
  )
}

export function InspectorControls({
  panel,
  onClose
}: {
  panel: InspectorPanelController
  onClose: () => void
}) {
  const isExpanded = panel.layout.isExpanded
  const ExpandIcon = isExpanded ? Minimize2 : Maximize2
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      <button
        type="button"
        data-inspector-expand=""
        aria-label={isExpanded ? 'Restore inspector' : 'Expand inspector'}
        title={isExpanded ? 'Restore inspector' : 'Expand inspector'}
        onClick={isExpanded ? panel.restore : panel.expand}
        className={BUTTON_QUIET_COMPACT_CLASS}
      >
        <ExpandIcon aria-hidden="true" className="size-3.5" />
        {isExpanded ? 'Restore' : 'Expand'}
      </button>
      <button
        type="button"
        aria-label="Close"
        title="Close inspector"
        onClick={onClose}
        className={BUTTON_QUIET_COMPACT_CLASS}
      >
        <X aria-hidden="true" className="size-3.5" />
        Close
      </button>
    </div>
  )
}
