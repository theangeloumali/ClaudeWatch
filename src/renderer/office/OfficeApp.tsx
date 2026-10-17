import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react'
import { Plate } from '../components/deck/Plate'
import { BUTTON_QUIET_COMPACT_CLASS } from '../components/deck/deck-styles'
import { cn } from '../lib/utils'
import { OFFICE_BLURRED_TICK_MS, useOfficeNow } from './use-office-now'
import { useOfficeTheme } from './hooks'
import { mainAgentForSession } from './logic/floor-model'
import { canRespond } from './logic/interactions'
import { INITIAL_OFFICE_STATE, officeReducer } from './logic/office-reducer'
import { buildThemeRows, countThemeChoices, useThemeAssignments } from './logic/office-themes'
import { findZone } from './logic/zone-model'
import { HUD_GRID_STYLE } from './logic/hud-layout'
import { buildOperationsModel } from './logic/operations-model'
import { createFrameMetrics } from './frame-metrics'
import { AgentActions } from './hud/AgentActions'
import { PlayerControls } from './hud/PlayerControls'
import { AttentionRail } from './hud/AttentionRail'
import { BottomBar } from './hud/BottomBar'
import { EmptyState } from './hud/EmptyState'
import { FocusNotice } from './hud/FocusNotice'
import { HealthBanner } from './hud/HealthBanner'
import { Inspector } from './hud/Inspector'
import { useInspectorPanel } from './hud/use-inspector-panel'
import { ListView } from './hud/ListView'
import { MetricsOverlay } from './hud/MetricsOverlay'
import { Minimap } from './hud/Minimap'
import { OfficesPanel } from './hud/OfficesPanel'
import { OperationsHeader } from './hud/OperationsHeader'
import { WorkAreaNavigation } from './hud/WorkAreaNavigation'
import { OfficeContext } from './hud/OfficeContext'
import { CurrentEvidenceStrip } from './hud/CurrentEvidenceStrip'
import { ThemesList } from './hud/ThemesList'
import { useWalking } from './player/use-walking'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import type { OfficeFeed } from './scene-model'
import {
  useAttentionAnnouncement,
  useFeedSubscription,
  useFocusTerminal
} from './use-office-effects'
import { useOfficeFeatures } from './use-office-features'
import { selectionOf, useOfficeLists, useVisibleFrame } from './use-office-model'
import { canCreateWebGL2 } from './webgl-support'
import { PlayerCharacterPicker } from './player/PlayerCharacterPicker'
import { choosePlayerCharacter, usePlayerCharacter } from './player/character-choice'
import { playerCharacterGeometryFactory } from './themes/character-geometry'
import { PlayerFloorControls } from './player/PlayerFloorControls'
import { useWorldEditing } from './editor/use-world-editing'
import { VenuesPanel } from './hud/VenuesPanel'
import { browserStorage } from '../office-live/browser-storage'
import { readViewPreference, saveViewPreference } from './logic/view-preference'

// The scene component loads separately so the HUD can paint before Canvas mounts.
const OfficeScene = lazy(() => import('./scene/OfficeScene'))
const SPEECH_BUBBLE_MS = 1500

interface OfficeAppProps {
  feed: OfficeFeed
  // The app's window draws no title bar, so the page supplies the strip it is dragged by.
  hasHiddenTitleBar?: boolean
}

export function OfficeApp({ feed, hasHiddenTitleBar = false }: OfficeAppProps) {
  const [state, dispatch] = useReducer(officeReducer, INITIAL_OFFICE_STATE, (initialState) => ({
    ...initialState,
    ...readViewPreference(browserStorage())
  }))
  const lastViewPreference = useRef({
    viewMode: state.viewMode,
    isListView: state.isListView,
    areRoofsVisible: state.areRoofsVisible
  })
  useEffect(() => {
    const previous = lastViewPreference.current
    if (
      previous.viewMode === state.viewMode &&
      previous.isListView === state.isListView &&
      previous.areRoofsVisible === state.areRoofsVisible
    )
      return
    const preference = {
      viewMode: state.viewMode,
      isListView: state.isListView,
      areRoofsVisible: state.areRoofsVisible
    }
    lastViewPreference.current = preference
    saveViewPreference(browserStorage(), preference)
  }, [state.viewMode, state.isListView, state.areRoofsVisible])
  const [hasWebGL] = useState(canCreateWebGL2)
  const [hasSceneFailed, setHasSceneFailed] = useState(false)
  const [metrics] = useState(createFrameMetrics)
  const playerCharacter = usePlayerCharacter()
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  const [isContextOpen, setIsContextOpen] = useState(false)
  const contextDetailsRef = useRef<HTMLDetailsElement>(null)
  const [speakingAgentKey, setSpeakingAgentKey] = useState<string | null>(null)
  const [nearPlayerAgentKey, setNearPlayerAgentKey] = useState<string | null>(null)
  const { notice, focusTerminal, dismissNotice } = useFocusTerminal(feed)
  const inspectorController = useInspectorPanel(state.selectedAgentKey, 0)
  const inspectorPanel = {
    ...inspectorController,
    isNarrow: inspectorController.layout.viewportWidth < 1100
  }
  const navigationRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const [navigationHeight, setNavigationHeight] = useState(0)
  const nowMs = useOfficeNow(OFFICE_BLURRED_TICK_MS)

  const is3DAvailable = hasWebGL && !hasSceneFailed
  const isShowingList = state.isListView || !is3DAvailable
  useFeedSubscription(feed, dispatch)

  const frame = useVisibleFrame(state.frame)
  const offices = useMemo(
    () => (frame ? buildOperationsModel({ frame, nowMs }) : []),
    [frame, nowMs]
  )
  const currentOffice =
    state.viewMode === 'office'
      ? (offices.find((office) => office.floor.floorId === state.focusedFloorId) ?? null)
      : null
  const selectedWorker = offices
    .flatMap((office) => office.workers)
    .find((worker) => worker.key === state.selectedAgentKey)
  const focusedRoomId =
    currentOffice?.workAreas.find(
      (area) =>
        area.room.id === state.focusedZoneId ||
        (!state.focusedZoneId && area.room.id === selectedWorker?.roomId)
    )?.room.id ?? null
  useEffect(() => {
    const navigation = navigationRef.current
    const footer = footerRef.current
    if (!navigation || !footer) return
    const measure = (): void => {
      setNavigationHeight(navigation.getBoundingClientRect().height)
      inspectorPanel.measureControls(footer.getBoundingClientRect().height)
    }
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(navigation)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [inspectorPanel.measureControls])
  const focusedZone = useMemo(() => {
    const zoneId = state.focusedZoneId
    if (!frame || !zoneId) return undefined
    return frame.floors.flatMap((floor) => findZone(floor, zoneId) ?? [])[0]
  }, [frame, state.focusedZoneId])
  const officeTheme = useOfficeTheme(focusedZone)
  const { theme, cycleTheme } = officeTheme
  const themeAssignments = useThemeAssignments()

  const floorId = state.focusedFloorId
  const lists = useOfficeLists(frame, floorId, state.selectedAgentKey)
  const { sessions, queue, towerFloors, companies, ledger, agentFacts, activity } = lists
  const { floorAgents, cards, stacks, companyList } = lists
  const announcement = useAttentionAnnouncement(queue)
  const themeRows = useMemo(
    () => buildThemeRows(companies, themeAssignments, theme.id),
    [companies, themeAssignments, theme.id]
  )
  const isConnecting = !frame || (!frame.connected && frame.sessions.length === 0)
  const focusedFloor = frame?.floors.find((floor) => floor.floorId === floorId)
  // Floor focus belongs to the HUD; it must not remove other offices or remount their crews.
  const visibleFloors = frame?.floors ?? []
  const isWalking = state.isWalking && !inspectorPanel.layout.isExpanded
  const { player, goToZone } = useWalking({
    floor: focusedFloor,
    dispatch,
    allFloors: frame?.floors
  })
  const {
    agent: selectedAgent,
    session: selectedSession,
    member: selectedMember,
    target: selectedTarget,
    character: selectedCharacter,
    workstation: selectedWorkstation,
    canWorkstation
  } = selectionOf(frame, state.selectedAgentKey, themeAssignments, theme.id)
  const selectedTargetKey = selectedTarget?.key
  const isViewOnly = feed.isViewOnly === true
  const reviewableKeys = useMemo(
    () =>
      new Set(isViewOnly ? [] : (sessions ?? []).filter(canRespond).map((session) => session.key)),
    [sessions, isViewOnly]
  )

  const focusSelected = useCallback(() => {
    if (selectedTargetKey) focusTerminal(selectedTargetKey)
  }, [selectedTargetKey, focusTerminal])
  const hotkeyHandlers = { onCycleTheme: cycleTheme, onFocusTerminal: focusSelected }
  const features = useOfficeFeatures(dispatch, !is3DAvailable, state.isWalking, hotkeyHandlers)

  useEffect(() => {
    if (!speakingAgentKey) return
    const timer = setTimeout(() => setSpeakingAgentKey(null), SPEECH_BUBBLE_MS)
    return () => clearTimeout(timer)
  }, [speakingAgentKey])

  const selectAgent = useCallback((agentKey: string | null) => {
    setIsContextOpen(false)
    dispatch({ type: 'agent-selected', agentKey })
  }, [])
  const chooseOffice = (floorId: string | null): void => {
    selectAgent(null)
    if (floorId) dispatch({ type: 'floor-flown', floorId })
    else dispatch({ type: 'view-set', view: 'city' })
  }
  const chooseRoom = (roomId: string): void => {
    selectAgent(null)
    dispatch({ type: 'zone-flown', zoneId: roomId })
  }
  // The editor works on real names, so a rebuilt city never saves a role.
  const editing = useWorldEditing({ feed, frame: state.frame, onSelectAgent: selectAgent })
  const { previewFloors, worldStore } = editing
  const flyToAgent = useCallback(
    (agentKey: string) => dispatch({ type: 'agent-flown', agentKey }),
    []
  )
  const onSceneError = useCallback(() => setHasSceneFailed(true), [])
  const fitCamera = useCallback(() => dispatch({ type: 'camera-fit' }), [])
  const openFloor = useCallback(
    (floorId: string) => dispatch({ type: 'floor-opened', floorId }),
    []
  )
  const onManualCameraMove = useCallback(() => dispatch({ type: 'camera-manually-moved' }), [])
  const frameWorkstation = useCallback(() => dispatch({ type: 'camera-workstation' }), [])
  const flyToZone = useCallback((zoneId: string) => dispatch({ type: 'zone-flown', zoneId }), [])
  const openReview = useCallback(
    (sessionKey: string) => dispatch({ type: 'review-opened', sessionKey }),
    []
  )
  const closeReview = useCallback(() => dispatch({ type: 'review-closed' }), [])
  // A teammate speaks for itself; a message to a session shows on its lead.
  const onSent = (agentKey: string): void => {
    const speaker =
      frame?.agents.find((agent) => agent.isSubagent && agent.agentKey === agentKey) ??
      (frame ? mainAgentForSession(frame, agentKey) : undefined)
    if (speaker) setSpeakingAgentKey(speaker.agentKey)
  }
  const hudGridStyle = {
    ...HUD_GRID_STYLE,
    '--office-right-rail': `${inspectorPanel.layout.width}px`,
    '--office-summary-offset': `${inspectorPanel.layout.hudTopHeight}px`,
    '--office-summary-top': `${inspectorPanel.layout.topInset + HUD_GRID_STYLE.padding}px`,
    '--office-mobile-rail-height': `${selectedAgent ? 100 : 200}px`,
    '--office-footer-height': `${inspectorPanel.layout.hudBottomHeight}px`
  }
  const sceneInspectorLayout = useMemo(
    () => ({
      ...inspectorController.layout,
      isContextVisible: true,
      navigationHeight:
        inspectorController.layout.hudTopHeight + navigationHeight + HUD_GRID_STYLE.gap
    }),
    [inspectorController.layout, navigationHeight]
  )

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-surface text-text-primary">
      <h1 tabIndex={-1} className="sr-only">
        Office
      </h1>
      {!isShowingList && focusedFloor && frame && (
        <SceneErrorBoundary onError={onSceneError}>
          <Suspense fallback={null}>
            <OfficeScene
              theme={theme}
              floors={towerFloors}
              sessions={frame.sessions}
              sources={frame.sources}
              connected={frame.connected}
              onFlyToZone={flyToZone}
              floor={focusedFloor}
              visibleFloors={previewFloors ?? visibleFloors}
              allFloors={frame.floors}
              venues={frame.venues}
              previewVenues={editing.previewDocument?.venues}
              onSelectVenue={setSelectedVenueId}
              agents={frame.agents}
              isLayoutPreview={previewFloors !== null}
              cards={cards}
              stacks={stacks}
              selectedAgentKey={state.selectedAgentKey}
              wallsMode={state.wallsMode}
              areRoofsVisible={state.areRoofsVisible}
              viewMode={state.viewMode}
              focusedFloorId={state.focusedFloorId}
              focusedRoomId={focusedRoomId}
              cameraRequest={state.cameraRequest}
              onFit={fitCamera}
              onManualCameraMove={onManualCameraMove}
              isCameraManuallyOwned={state.isCameraManuallyOwned}
              selectedWorkstation={selectedWorkstation}
              metrics={metrics}
              onSelectAgent={selectAgent}
              onFlyToAgent={flyToAgent}
              reviewableKeys={reviewableKeys}
              onReview={openReview}
              speakingAgentKey={speakingAgentKey}
              player={player}
              playerGeometry={playerCharacterGeometryFactory(playerCharacter)}
              isWalking={isWalking}
              inspectorLayout={sceneInspectorLayout}
              onNearPlayerAgent={setNearPlayerAgentKey}
              onBodyObstacles={feed.setBodyObstacles}
              onFocusFloor={openFloor}
              onEditTarget={editing.openMenu}
            />
          </Suspense>
        </SceneErrorBoundary>
      )}

      <div
        className={cn(
          'pointer-events-none absolute inset-0 grid grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] min-[1100px]:grid-cols-[var(--office-left-rail)_minmax(0,1fr)_var(--office-right-rail)] min-[1100px]:grid-rows-[auto_minmax(0,1fr)_auto]'
        )}
        style={hudGridStyle}
      >
        <div className="pointer-events-auto min-w-0 min-[1100px]:col-span-full">
          <OperationsHeader
            offices={offices}
            focusedFloorId={floorId}
            isCityView={state.viewMode === 'city'}
            agentCount={frame?.agents.length ?? 0}
            tokens={ledger.office}
            isPartial={ledger.isOfficePartial}
            activity={activity.office}
            isConnected={frame?.connected ?? false}
            isListView={isShowingList}
            hasHiddenTitleBar={hasHiddenTitleBar}
            onChooseFloor={chooseOffice}
            onToggleList={() => dispatch({ type: 'list-toggled' })}
            onHeightChange={inspectorPanel.measureTotals}
          />
        </div>
        <div
          ref={navigationRef}
          className="pointer-events-auto flex min-h-0 min-w-0 flex-col gap-3 self-start overflow-y-auto max-[1099px]:max-h-[var(--office-mobile-rail-height)] min-[1100px]:max-h-full"
        >
          {frame && (
            <Minimap
              frame={previewFloors ? { ...frame, floors: previewFloors } : frame}
              viewMode={state.viewMode}
              focusedFloorId={state.focusedFloorId}
              focusedRoomId={focusedRoomId}
              selectedAgentKey={state.selectedAgentKey}
              isNarrow={inspectorPanel.isNarrow}
              isPreview={previewFloors !== null}
              player={
                player && player.physicalFloorId !== undefined && !player.connectorId
                  ? { ...player.position, physicalFloorId: player.physicalFloorId }
                  : undefined
              }
              onChooseFloor={chooseOffice}
              onChooseRoom={chooseRoom}
              onChooseWorker={selectAgent}
            />
          )}
          {(currentOffice || inspectorPanel.isNarrow) && (
            <WorkAreaNavigation
              office={currentOffice}
              focusedRoomId={focusedRoomId}
              onChooseRoom={chooseRoom}
              onChooseWorker={selectAgent}
            />
          )}
          <details open={!inspectorPanel.isNarrow} className="min-w-0">
            <summary className={`${BUTTON_QUIET_COMPACT_CLASS} min-[1100px]:hidden`}>
              Projects & offices
            </summary>
            <OfficesPanel
              companies={companies}
              activity={activity}
              ledger={ledger}
              themeRows={themeRows}
              onChooseTheme={officeTheme.chooseTheme}
              focusedZoneId={state.focusedZoneId}
              onFlyToZone={goToZone}
              onStart={
                isViewOnly ? null : (projectKey, provider) => feed.start(projectKey, provider)
              }
            />
          </details>
          <div className="max-[1099px]:hidden">
            <AttentionRail
              queue={queue}
              activeSessionKey={selectedSession?.key ?? null}
              onOpen={(sessionKey) => dispatch({ type: 'session-opened', sessionKey })}
              onNext={() => dispatch({ type: 'next-attention' })}
              reviewableKeys={reviewableKeys}
              onReview={openReview}
              onFocusTerminal={focusTerminal}
            />
          </div>
          {frame && (
            <details className="min-w-0">
              <summary className={BUTTON_QUIET_COMPACT_CLASS}>Community & source health</summary>
              <VenuesPanel
                frame={frame}
                selectedVenueId={selectedVenueId}
                onSelectVenue={setSelectedVenueId}
                onSelectAgent={selectAgent}
              />
              <HealthBanner sources={frame.sources} />
            </details>
          )}
          {!is3DAvailable && (
            <Plate faceClassName="px-3 py-2 text-xs text-text-secondary">
              <p>The 3D view is unavailable on this device, so the office is shown as a list.</p>
            </Plate>
          )}
        </div>

        <div className="flex min-h-0 flex-col items-center gap-3">
          <div className="pointer-events-auto flex min-w-0 max-w-full flex-col items-center gap-2">
            <FocusNotice message={notice} onDismiss={dismissNotice} />
            {previewFloors && (
              <p className="rounded bg-surface-raised px-3 py-2 text-sm">
                Layout preview — live agents hidden; nothing saved.
              </p>
            )}
            <FocusNotice message={officeTheme.notice} onDismiss={officeTheme.dismissNotice} />
            {state.isMetricsVisible && !isShowingList && <MetricsOverlay metrics={metrics} />}
          </div>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            {isConnecting || (frame && frame.sessions.length === 0) ? (
              <div className="pointer-events-auto">
                <EmptyState isConnecting={isConnecting} />
              </div>
            ) : (
              isShowingList &&
              frame && (
                <div data-camera-guard className="pointer-events-auto h-full w-full">
                  <ListView
                    frame={frame}
                    companies={companyList}
                    agentFacts={agentFacts}
                    selectedAgentKey={state.selectedAgentKey}
                    onSelectAgent={selectAgent}
                    onFocusTerminal={focusTerminal}
                  />
                </div>
              )
            )}
          </div>
        </div>

        <div className="pointer-events-auto min-h-0 min-w-0 self-start max-[1099px]:contents min-[1100px]:max-h-full min-[1100px]:overflow-y-auto">
          {selectedAgent ? (
            <Inspector
              panel={inspectorPanel}
              agent={selectedAgent}
              session={selectedSession}
              member={selectedMember}
              character={selectedCharacter}
              accounts={frame?.accounts}
              canFly={!isShowingList}
              onFocusTerminal={focusSelected}
              onFly={() => dispatch({ type: 'fly-to-selected' })}
              canWorkstation={canWorkstation && !isShowingList && !inspectorPanel.layout.isExpanded}
              onWorkstation={frameWorkstation}
              onClose={() => selectAgent(null)}
              evidenceSlot={
                <div className="space-y-1 text-sm text-text-secondary">
                  <p>{selectedWorker?.detail ?? 'Activity unavailable · no own observation'}</p>
                </div>
              }
            >
              {selectedSession && selectedTarget && (
                <AgentActions
                  key={selectedTarget.key}
                  session={selectedSession}
                  target={selectedTarget}
                  feed={feed}
                  isReviewing={state.reviewingSessionKey === selectedSession.key}
                  onReview={() => openReview(selectedSession.key)}
                  onReviewClose={closeReview}
                  onFocusTerminal={focusSelected}
                  onSent={onSent}
                  selectedAgentKey={selectedAgent.agentKey}
                />
              )}
            </Inspector>
          ) : (
            <details
              ref={contextDetailsRef}
              open={!inspectorPanel.isNarrow || isContextOpen}
              className="max-[1099px]:fixed max-[1099px]:inset-x-3 max-[1099px]:z-10"
              style={
                inspectorPanel.isNarrow
                  ? {
                      bottom: inspectorPanel.layout.hudBottomHeight,
                      maxHeight: '35vh',
                      overflowY: 'auto'
                    }
                  : undefined
              }
            >
              <summary
                className={`${BUTTON_QUIET_COMPACT_CLASS} bg-surface min-[1100px]:hidden`}
                onClick={(event) => {
                  if (!inspectorPanel.isNarrow) return
                  event.preventDefault()
                  setIsContextOpen((isOpen) => !isOpen)
                }}
              >
                Office context
              </summary>
              {(!inspectorPanel.isNarrow || isContextOpen) && (
                <OfficeContext
                  office={currentOffice}
                  offices={offices}
                  themeLabel={theme.label}
                  focusedRoomId={focusedRoomId}
                  onSelectWorker={selectAgent}
                  onFocusOffice={chooseOffice}
                  onClose={
                    inspectorPanel.isNarrow
                      ? () => {
                          setIsContextOpen(false)
                          contextDetailsRef.current?.querySelector('summary')?.focus()
                        }
                      : undefined
                  }
                />
              )}
            </details>
          )}
        </div>

        <div
          ref={footerRef}
          className="pointer-events-auto flex min-w-0 max-w-full flex-col gap-2 min-[1100px]:col-span-full"
        >
          {frame && (
            <CurrentEvidenceStrip frame={frame} agentKey={state.selectedAgentKey} feed={feed} />
          )}
          <BottomBar
            isCompact
            isNarrow={inspectorPanel.isNarrow}
            floorThemeLabel={theme.label}
            renderThemes={(id, close) => (
              <ThemesList
                id={id}
                companies={themeRows}
                floorTheme={theme}
                choiceCount={countThemeChoices(themeAssignments)}
                cycleScope={officeTheme.cycleScope}
                onChoose={officeTheme.chooseTheme}
                onChooseMapTheme={officeTheme.chooseMapTheme}
                onClose={close}
              />
            )}
            wallsMode={state.wallsMode}
            areRoofsVisible={state.areRoofsVisible}
            onToggleRoofs={() => dispatch({ type: 'roofs-toggled' })}
            isListView={state.isListView}
            is3DAvailable={is3DAvailable}
            isMetricsVisible={state.isMetricsVisible}
            isWalking={state.isWalking}
            onToggleWalk={() => dispatch({ type: 'walk-toggled' })}
            hasPlayer={features.hasPlayer}
            onFindPlayer={() => {
              if (player) dispatch({ type: 'camera-player', position: { ...player.position } })
            }}
            playerControls={
              <>
                <PlayerCharacterPicker value={playerCharacter} onChange={choosePlayerCharacter} />
                {frame && player && <PlayerFloorControls player={player} floors={frame.floors} />}
                <PlayerControls
                  player={player}
                  nearAgent={floorAgents.find((agent) => agent.agentKey === nearPlayerAgentKey)}
                  onInspect={selectAgent}
                />
              </>
            }
            isSettingsOpen={features.isSettingsOpen}
            isDistributedCity={frame?.floors.some((floor) => Boolean(floor.buildingId))}
            onToggleSettings={features.toggleSettings}
            onWallsMode={(mode) => dispatch({ type: 'walls-set', mode })}
            onToggleList={() => dispatch({ type: 'list-toggled' })}
            onToggleMetrics={() => dispatch({ type: 'metrics-toggled' })}
            onRotate={(direction) => dispatch({ type: 'camera-rotated', direction })}
            onTilt={(direction) => dispatch({ type: 'camera-tilted', direction })}
            onZoom={(direction) => dispatch({ type: 'camera-zoomed', direction })}
            onFit={fitCamera}
            onReset={() => dispatch({ type: 'camera-reset' })}
            onEditLayout={worldStore ? editing.open : undefined}
            canWorkstation={canWorkstation && !inspectorPanel.layout.isExpanded}
            onWorkstation={frameWorkstation}
            viewMode={state.viewMode}
            onView={(view) => dispatch({ type: 'view-set', view })}
          />
        </div>
      </div>

      <div role="status" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {editing.overlays}
    </main>
  )
}
