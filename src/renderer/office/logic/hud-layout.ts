import type { CSSProperties } from 'react'

const LEFT_RAIL_WIDTH = 296
export const DEFAULT_INSPECTOR_WIDTH = 320
const GRID_GAP = 12
const GRID_PADDING = 12
export const HUD_COLUMNS_BREAKPOINT = 768
const MIN_INSPECTOR_WIDTH = 280
const MAX_INSPECTOR_WIDTH = 640
const MIN_SCENE_WIDTH = 180
const MAX_INSPECTOR_SHEET_HEIGHT = 440
const COLLAPSED_INSPECTOR_SHEET_HEIGHT = 100
const OPEN_INSPECTOR_SHEET_HEIGHT = 360
const SHEET_VIEWPORT_SHARE = 0.5
const MOBILE_RAIL_VIEWPORT_SHARE = 0.45
const MOBILE_INSPECTOR_RAIL_VIEWPORT_SHARE = 0.25

function mobileRailHeight(hasInspector: boolean, viewportHeight: number): number {
  return (
    viewportHeight *
    (hasInspector ? MOBILE_INSPECTOR_RAIL_VIEWPORT_SHARE : MOBILE_RAIL_VIEWPORT_SHARE)
  )
}

// dry-new: The existing rail dimensions also bound the resize control and scene-safe area.
export function inspectorWidthBounds(viewportWidth: number): { min: number; max: number } {
  const available = Math.max(1, viewportWidth - GRID_PADDING * 2)
  const maximum =
    viewportWidth < HUD_COLUMNS_BREAKPOINT
      ? available
      : Math.min(
          MAX_INSPECTOR_WIDTH,
          Math.max(1, available - LEFT_RAIL_WIDTH - GRID_GAP * 2 - MIN_SCENE_WIDTH)
        )
  return { min: Math.min(MIN_INSPECTOR_WIDTH, maximum), max: maximum }
}

export function clampInspectorWidth(width: number, viewportWidth: number): number {
  const bounds = inspectorWidthBounds(viewportWidth)
  return Math.max(bounds.min, Math.min(bounds.max, width))
}

export interface InspectorLayout {
  width: number
  viewportWidth: number
  viewportHeight: number
  topInset: number
  isExpanded: boolean
  hudTopHeight?: number
  hudBottomHeight?: number
  navigationHeight?: number
  isContextVisible?: boolean
  isSheetOpen?: boolean
  // The owner hid the side and bottom panels for a clear view; phones keep their sheet.
  arePanelsHidden?: boolean
}

// Phones keep their bottom sheet, so panels hide on wide and medium layouts only.
export const canHidePanels = (viewportWidth: number): boolean =>
  viewportWidth >= HUD_COLUMNS_BREAKPOINT

export function inspectorSheetHeight(viewportHeight: number, isSheetOpen?: boolean): number {
  const maximum =
    isSheetOpen === undefined
      ? MAX_INSPECTOR_SHEET_HEIGHT
      : isSheetOpen
        ? OPEN_INSPECTOR_SHEET_HEIGHT
        : COLLAPSED_INSPECTOR_SHEET_HEIGHT
  return Math.min(maximum, Math.max(1, viewportHeight * SHEET_VIEWPORT_SHARE))
}

export const HUD_GRID_STYLE = {
  '--office-left-rail': `${LEFT_RAIL_WIDTH}px`,
  '--office-right-rail': `${DEFAULT_INSPECTOR_WIDTH}px`,
  gap: GRID_GAP,
  padding: GRID_PADDING
} satisfies CSSProperties & { '--office-left-rail': string; '--office-right-rail': string }

export const HUD_SAFE_INSETS = {
  left: GRID_PADDING + LEFT_RAIL_WIDTH + GRID_GAP,
  right: GRID_PADDING + DEFAULT_INSPECTOR_WIDTH + GRID_GAP,
  top: 72,
  bottom: 96
}

export function hudSafeInsets(
  hasInspector: boolean,
  layout?: InspectorLayout
): typeof HUD_SAFE_INSETS {
  if (layout?.arePanelsHidden && canHidePanels(layout.viewportWidth)) {
    return {
      left: 0,
      right: 0,
      top: (layout.hudTopHeight ?? HUD_SAFE_INSETS.top) + layout.topInset,
      bottom: layout.hudBottomHeight ?? HUD_SAFE_INSETS.bottom
    }
  }
  if (layout && layout.viewportWidth < (layout.isContextVisible ? 1100 : HUD_COLUMNS_BREAKPOINT)) {
    return {
      left: GRID_PADDING,
      right: GRID_PADDING,
      top:
        Math.max(
          layout.hudTopHeight ?? HUD_SAFE_INSETS.top,
          layout.navigationHeight ??
            GRID_PADDING + mobileRailHeight(hasInspector, layout.viewportHeight)
        ) + layout.topInset,
      bottom:
        (layout.hudBottomHeight ?? HUD_SAFE_INSETS.bottom) +
        (hasInspector
          ? inspectorSheetHeight(
              layout.viewportHeight,
              layout.viewportWidth < HUD_COLUMNS_BREAKPOINT ? layout.isSheetOpen : undefined
            )
          : 0)
    }
  }
  return {
    ...HUD_SAFE_INSETS,
    top: (layout?.hudTopHeight ?? HUD_SAFE_INSETS.top) + (layout?.topInset ?? 0),
    bottom: layout?.hudBottomHeight ?? HUD_SAFE_INSETS.bottom,
    right:
      hasInspector || layout?.isContextVisible
        ? GRID_PADDING + (layout?.width ?? DEFAULT_INSPECTOR_WIDTH) + GRID_GAP
        : GRID_PADDING
  }
}
