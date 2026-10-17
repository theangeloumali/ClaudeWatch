import { ChevronUp } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Plate } from '../../components/deck/Plate'
import type { ZoomDirection } from '../logic/camera-bands'
import { SETTINGS_KEY, WALK_KEYS } from '../logic/hotkeys'
import type { WallsMode } from '../logic/room-layout'
import { BAR_BUTTON_CLASS, KBD_CLASS } from './hud-styles'
import { OfficeSettingsPanel } from './OfficeSettings'
import { officeSettings } from '../logic/office-settings'
import { CameraTools } from './CameraTools'
import { CompanyLensToggle } from './CompanyLensToggle'

export interface BottomBarProps {
  isCompact?: boolean
  isNarrow?: boolean
  floorThemeLabel: string
  // The themes list, shown above the bar while its button is open.
  renderThemes: (id: string, close: () => void) => ReactNode
  wallsMode: WallsMode
  areRoofsVisible?: boolean
  onToggleRoofs?: () => void
  isListView: boolean
  is3DAvailable: boolean
  isMetricsVisible: boolean
  // The owner is moving their own character through the office.
  isWalking: boolean
  onToggleWalk: () => void
  hasPlayer: boolean
  onFindPlayer?: () => void
  playerControls?: ReactNode
  onHeightChange?: (height: number) => void
  // Held above the bar so the settings key opens the panel too.
  isSettingsOpen: boolean
  isDistributedCity?: boolean
  onToggleSettings: () => void
  onWallsMode: (mode: WallsMode) => void
  onToggleList: () => void
  onToggleMetrics: () => void
  onRotate: (direction: -1 | 1) => void
  onTilt?: (direction: -1 | 1) => void
  onZoom: (direction: ZoomDirection) => void
  onFit: () => void
  onWorkstation?: () => void
  canWorkstation?: boolean
  viewMode?: 'office' | 'city'
  onView?: (view: 'office' | 'city') => void
  onReset?: () => void
  onEditLayout?: () => void
}

const WALL_OPTIONS: readonly { mode: WallsMode; label: string; key: string }[] = [
  { mode: 'up', label: 'Walls up', key: 'Home' },
  { mode: 'cutaway', label: 'Cutaway', key: 'W' },
  { mode: 'down', label: 'Walls down', key: 'End' }
]

function ToggleButton(props: {
  isPressed: boolean
  isDisabled?: boolean
  onClick: () => void
  label: string
  title?: string
  shortcut?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={props.isPressed}
      disabled={props.isDisabled}
      onClick={props.onClick}
      title={props.title}
      className={BAR_BUTTON_CLASS}
    >
      {props.label}
      {props.shortcut && <kbd className={KBD_CLASS}>{props.shortcut}</kbd>}
    </button>
  )
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
}

export function BottomBar(props: BottomBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const { onHeightChange } = props
  useEffect(() => {
    const bar = barRef.current
    if (!bar || !onHeightChange) return
    const measure = (): void => onHeightChange(bar.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [onHeightChange])
  const isShowing3D = props.is3DAvailable && !props.isListView
  const areRoofsVisible = props.areRoofsVisible ?? true
  const [isThemesOpen, setIsThemesOpen] = useState(false)
  const themesButtonRef = useRef<HTMLButtonElement>(null)
  const themesId = useId()
  const closeThemes = (): void => {
    setIsThemesOpen(false)
    themesButtonRef.current?.focus()
  }
  const { isSettingsOpen, onToggleSettings } = props
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const settingsId = useId()
  // One panel stands above the bar at a time; the settings are the later arrival.
  const isShowingThemes = isThemesOpen && !isSettingsOpen
  const wasSettingsOpenRef = useRef(isSettingsOpen)
  useEffect(() => {
    const hasClosed = wasSettingsOpenRef.current && !isSettingsOpen
    wasSettingsOpenRef.current = isSettingsOpen
    // The panel took focus with it when it closed, unless another control was clicked.
    const isFocusLost = !document.activeElement || document.activeElement === document.body
    if (hasClosed && isFocusLost) settingsButtonRef.current?.focus()
  }, [isSettingsOpen])
  const toggleThemes = (): void => {
    if (isSettingsOpen) onToggleSettings()
    setIsThemesOpen(!isShowingThemes)
  }
  const toggleSettings = (): void => {
    setIsThemesOpen(false)
    onToggleSettings()
  }
  return (
    <div
      className="relative min-w-0 max-w-full"
      ref={barRef}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !(event.target instanceof Element)) return
        const disclosure = event.target.closest('details')
        if (!disclosure?.open) return
        event.preventDefault()
        event.stopPropagation()
        disclosure.open = false
        disclosure.querySelector('summary')?.focus()
      }}
    >
      {isShowingThemes && props.renderThemes(themesId, closeThemes)}
      {isSettingsOpen && (
        <OfficeSettingsPanel
          id={settingsId}
          onClose={onToggleSettings}
          isDistributedCity={props.isDistributedCity}
          mapThemeLabel={props.floorThemeLabel}
          onOpenThemes={toggleThemes}
        />
      )}
      <div
        className={`relative isolate flex flex-wrap items-center gap-1 p-1.5 ${props.isCompact ? 'max-md:[&_button]:min-h-11 max-md:[&_summary]:min-h-11 max-md:[&_kbd]:hidden' : ''}`}
      >
        {/* Keep the chamfer behind controls so its clip cannot cut off their popovers. */}
        <Plate className="pointer-events-none absolute inset-0 -z-10" faceClassName="h-full">
          {null}
        </Plate>
        {props.isCompact && <ViewControls props={props} />}
        <details
          open={!props.isCompact}
          className={props.isCompact ? 'relative order-2' : 'contents'}
        >
          <summary className={props.isCompact ? `${BAR_BUTTON_CLASS} cursor-pointer` : 'hidden'}>
            {props.isCompact ? 'More controls' : 'Scene controls'}
          </summary>
          <div
            className={
              props.isCompact
                ? 'absolute bottom-full right-0 z-20 mb-3 flex w-[min(720px,calc(100vw-24px))] flex-wrap items-center gap-1 rounded-md border border-border bg-surface-raised p-3 shadow-lg max-md:fixed max-md:inset-x-3 max-md:bottom-[var(--office-footer-height)] max-md:max-h-[50vh] max-md:overflow-y-auto'
                : 'contents'
            }
          >
            <div role="group" aria-label="Walls" className="flex gap-1">
              {WALL_OPTIONS.map((option) => (
                <ToggleButton
                  key={option.mode}
                  label={option.label}
                  shortcut={option.key}
                  isPressed={props.wallsMode === option.mode}
                  isDisabled={!isShowing3D}
                  onClick={() => props.onWallsMode(option.mode)}
                />
              ))}
            </div>
            <ToggleButton
              label={areRoofsVisible ? 'Hide roofs' : 'Show roofs'}
              title={
                !isShowing3D
                  ? 'Roof visibility is available in the 3D view'
                  : areRoofsVisible
                    ? 'Hide roofs across all offices to expose their interiors'
                    : 'Roofs are hidden; show roofs across all offices'
              }
              isPressed={!areRoofsVisible}
              isDisabled={!isShowing3D || !props.onToggleRoofs}
              onClick={() => props.onToggleRoofs?.()}
            />
            <Divider />
            {!props.isCompact && <ViewControls props={props} />}
            {props.isCompact && props.isNarrow && props.onWorkstation && (
              <button
                type="button"
                disabled={!isShowing3D || !props.canWorkstation}
                onClick={props.onWorkstation}
                className={BAR_BUTTON_CLASS}
              >
                Workstation
              </button>
            )}
            {props.onReset && (
              <button
                type="button"
                disabled={!isShowing3D}
                onClick={props.onReset}
                className={BAR_BUTTON_CLASS}
              >
                Reset view
              </button>
            )}
            {props.onEditLayout && (
              <button
                type="button"
                disabled={!isShowing3D}
                onClick={props.onEditLayout}
                className={BAR_BUTTON_CLASS}
                title="Edit layout, or Shift + right-click a building. Plain right-drag rotates the map."
              >
                Edit layout
              </button>
            )}
            <Divider />
            <ToggleButton
              label={
                !props.hasPlayer
                  ? 'Enable player'
                  : props.isWalking
                    ? 'Stop controlling'
                    : 'Control player'
              }
              shortcut={props.hasPlayer ? WALK_KEYS.toggle : undefined}
              isPressed={props.hasPlayer && props.isWalking && isShowing3D}
              isDisabled={!isShowing3D}
              onClick={() => {
                if (!props.hasPlayer) officeSettings.set('player', true)
                props.onToggleWalk()
              }}
            />
            {props.onFindPlayer && (
              <button
                type="button"
                disabled={!isShowing3D || !props.hasPlayer}
                onClick={props.onFindPlayer}
                className={BAR_BUTTON_CLASS}
              >
                Find player
              </button>
            )}
            <ToggleButton
              label="List view"
              shortcut="L"
              isPressed={props.isListView || !props.is3DAvailable}
              isDisabled={!props.is3DAvailable}
              onClick={props.onToggleList}
            />
            {props.isCompact && props.isNarrow && (
              <div className="flex flex-wrap gap-1">
                <CameraTools
                  isDisabled={!isShowing3D}
                  onRotate={props.onRotate}
                  onTilt={props.onTilt}
                  onZoom={props.onZoom}
                  onFit={props.onFit}
                />
                <ToggleButton
                  label="Metrics"
                  isPressed={props.isMetricsVisible}
                  isDisabled={!isShowing3D}
                  onClick={props.onToggleMetrics}
                />
              </div>
            )}
          </div>
        </details>
        <button
          type="button"
          ref={themesButtonRef}
          aria-expanded={isShowingThemes}
          aria-controls={isShowingThemes ? themesId : undefined}
          onClick={toggleThemes}
          className={BAR_BUTTON_CLASS}
        >
          Map theme
          <span className={props.isCompact ? 'max-md:hidden' : undefined}>
            : {props.floorThemeLabel}
          </span>
          <ChevronUp aria-hidden="true" className="size-3.5" />
        </button>
        {(!props.isCompact || !props.isNarrow) && (
          <details
            open={props.onReset ? undefined : true}
            className={props.isCompact ? 'relative order-3 max-md:hidden' : 'min-w-0 max-w-full'}
          >
            <summary className={`${BAR_BUTTON_CLASS} cursor-pointer`}>
              {props.isCompact ? 'Camera' : 'More controls'}
            </summary>
            <div
              className={
                props.isCompact
                  ? 'absolute bottom-full right-0 z-20 mb-3 flex w-80 flex-wrap items-center gap-1 rounded-md border border-border bg-surface-raised p-3 shadow-lg'
                  : 'flex min-w-0 max-w-full flex-wrap items-center gap-1 pt-1'
              }
            >
              <CameraTools
                isDisabled={!isShowing3D}
                onRotate={props.onRotate}
                onTilt={props.onTilt}
                onZoom={props.onZoom}
                onFit={props.onFit}
              />
              <ToggleButton
                label="Metrics"
                isPressed={props.isMetricsVisible}
                isDisabled={!isShowing3D}
                onClick={props.onToggleMetrics}
              />
            </div>
          </details>
        )}
        {/* Never disabled: the switches are also how a struggling machine gets its 3D view back. */}
        <button
          type="button"
          ref={settingsButtonRef}
          aria-expanded={isSettingsOpen}
          aria-controls={isSettingsOpen ? settingsId : undefined}
          aria-keyshortcuts={SETTINGS_KEY}
          onClick={toggleSettings}
          className={BAR_BUTTON_CLASS}
        >
          Settings
          <kbd className={KBD_CLASS}>{SETTINGS_KEY}</kbd>
        </button>
        {props.hasPlayer && props.isWalking && isShowing3D && (
          <div className="basis-full">
            {props.playerControls}
            <p className="px-1 pb-0.5 text-xs text-text-secondary">
              Arrow keys or W A S D to walk, click to go there, {WALK_KEYS.talk} to inspect the
              agent beside you.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ViewControls({ props }: { props: BottomBarProps }) {
  if (!props.onView) return null
  const isShowing3D = props.is3DAvailable && !props.isListView
  return (
    <div role="group" aria-label="View" className="flex gap-1">
      {(['city', 'office'] as const).map((view) => (
        <button
          type="button"
          key={view}
          disabled={!isShowing3D}
          aria-pressed={!props.isListView && props.viewMode === view}
          title={
            view === 'office' ? 'Office reference: 35° elevation, 45° azimuth' : 'Frame the city'
          }
          onClick={() => props.onView?.(view)}
          className={BAR_BUTTON_CLASS}
        >
          {view === 'office' ? 'Office' : 'City'}
        </button>
      ))}
      {props.onWorkstation && (!props.isCompact || !props.isNarrow) && (
        <button
          type="button"
          disabled={!isShowing3D || !props.canWorkstation}
          onClick={props.onWorkstation}
          className={BAR_BUTTON_CLASS}
          title="Frame the selected agent’s workstation from the screen side"
        >
          Workstation
        </button>
      )}
      <CompanyLensToggle isDisabled={!isShowing3D} />
    </div>
  )
}
