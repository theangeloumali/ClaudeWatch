import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clampInspectorWidth,
  DEFAULT_INSPECTOR_WIDTH,
  HUD_COLUMNS_BREAKPOINT,
  HUD_GRID_STYLE,
  HUD_SAFE_INSETS,
  inspectorWidthBounds
} from '../logic/hud-layout'

// dry-new: No existing panel controller owns viewport-clamped width and presentation state.
export function useInspectorPanel(selectedAgentKey: string | null, topInset: number) {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))
  const [dockedWidth, setDockedWidth] = useState(() =>
    clampInspectorWidth(DEFAULT_INSPECTOR_WIDTH, window.innerWidth)
  )
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [hudTopHeight, setHudTopHeight] = useState(HUD_SAFE_INSETS.top)
  const [hudBottomHeight, setHudBottomHeight] = useState(HUD_SAFE_INSETS.bottom)
  const measureControls = useCallback((height: number) => {
    if (height > 0)
      setHudBottomHeight(
        Math.max(HUD_SAFE_INSETS.bottom, height + HUD_GRID_STYLE.padding + HUD_GRID_STYLE.gap)
      )
  }, [])
  const measureTotals = useCallback((height: number) => {
    if (height > 0) setHudTopHeight(height + HUD_GRID_STYLE.padding + HUD_GRID_STYLE.gap)
  }, [])
  useEffect(() => {
    const resize = (): void => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setDockedWidth((width) => clampInspectorWidth(width, window.innerWidth))
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    if (!selectedAgentKey) {
      setIsExpanded(false)
      setIsSheetOpen(false)
    }
  }, [selectedAgentKey])
  const setWidth = useCallback((width: number) => {
    setDockedWidth(clampInspectorWidth(width, window.innerWidth))
  }, [])
  const bounds = inspectorWidthBounds(viewport.width)
  const isNarrow = viewport.width < HUD_COLUMNS_BREAKPOINT
  const width = isNarrow ? bounds.max : clampInspectorWidth(dockedWidth, viewport.width)
  const layout = useMemo(
    () => ({
      width,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      topInset,
      isExpanded,
      isSheetOpen,
      hudTopHeight,
      hudBottomHeight
    }),
    [
      width,
      viewport.width,
      viewport.height,
      topInset,
      isExpanded,
      isSheetOpen,
      hudTopHeight,
      hudBottomHeight
    ]
  )
  return {
    layout,
    bounds,
    isNarrow,
    measureTotals,
    measureControls,
    setWidth,
    expand: () => setIsExpanded(true),
    restore: () => setIsExpanded(false),
    toggleSheet: () => setIsSheetOpen((isOpen) => !isOpen),
    collapseSheet: () => setIsSheetOpen(false),
    resetWidth: () => setWidth(DEFAULT_INSPECTOR_WIDTH)
  }
}

export type InspectorPanelController = ReturnType<typeof useInspectorPanel>
