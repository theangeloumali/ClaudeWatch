import { Canvas, type RootState } from '@react-three/fiber'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import type { AgentView, SessionRef, SourceHealth } from '../../../shared/office/types'
import { cityVenueSite } from '../../../shared/office/city-access'
import type { FrameMetrics } from '../frame-metrics'
import { usePrefersReducedMotion } from '../hooks'
import { BAND_ZOOM, ISO_POLAR, ISO_START_AZIMUTH, type ZoomBand } from '../logic/camera-bands'
import type { NameCard, ProjectStack } from '../logic/name-cards'
import { useOfficeSettings } from '../logic/office-settings'
import type { CameraRequest } from '../logic/office-reducer'
import type { InspectorLayout } from '../logic/hud-layout'
import type { WallsMode } from '../logic/room-layout'
import { SCENE_BACKGROUND } from '../office-palette'
import type { FloorGeometry } from '../scene-model'
import { CameraRig } from './CameraRig'
import { FloorView } from './FloorView'
import { Horizon } from './Horizon'
import { CardProjector, type CardAnchors } from './CardProjector'
import { NameCardLayer } from './NameCards'
import { FrameGovernor, MetricsProbe } from './RenderLoop'
import { RobotCrew } from './Robot'
import { BatchedScene } from './BatchedScene'
import { TowerView } from './WorldView'
import { ZonePickers, type SceneEditTarget } from './ZonePickers'
import { MultiFloorLayer } from './MultiFloorLayer'
import { VenueLayer } from './VenueLayer'
import { visibleWorkstationDisplays } from './scene-density'
import type { WorldVenue } from '../../../shared/office/world-document'
import { floorEnvelope, groundEnvelope } from './all-floor-model'
import { useSceneFloorData } from './use-scene-floor-data'
import { MoverLayer } from '../citizens/MoverLayer'
import { PlayerLayer } from '../player/PlayerLayer'
import { PlayerLabels, PlayerLabelProjector } from '../player/PlayerLabels'
import { sendPlayer, type Player } from '../player/walking'
import { useQualitySettings } from '../quality-store'
import { TOWER_STOREY_M } from '../themes/layout'
import { GROUND_Y, MAX_LOT_HEIGHT_M, sceneExtent } from '../themes/surroundings'
import type { OfficeTheme, TowerFloor, WorkstationSpec } from '../themes/types'
import { TownGround } from '../town/TownGround'
import { dressOf, TownAmbient, TownView } from '../town/TownView'
import { useTownPlan } from '../town/use-town-plan'
import { WorkstationScreens } from './WorkstationScreens'
import { OfficeNameLayer, OfficeNameProjector, type OfficeNameAnchors } from './OfficeNames'
import { SceneBodies } from './BodySpace'
import { BodyObstacleSync } from './BodyObstacleSync'
import { ShaderPrewarm } from './ShaderPrewarm'
import type { BodyFootprint } from '../../../shared/office/body-footprints'

interface OfficeSceneProps {
  // The floor's default: zones without a company or project theme inherit it.
  theme: OfficeTheme
  floors: readonly TowerFloor[]
  sessions: readonly SessionRef[]
  sources?: readonly SourceHealth[]
  connected?: boolean
  onFlyToZone: (zoneId: string) => void
  floor: FloorGeometry
  visibleFloors?: readonly FloorGeometry[]
  allFloors?: readonly FloorGeometry[]
  isLayoutPreview?: boolean
  venues?: readonly WorldVenue[]
  previewVenues?: readonly WorldVenue[]
  onSelectVenue?: (id: string) => void
  agents: readonly AgentView[]
  cards: readonly NameCard[]
  stacks: readonly ProjectStack[]
  selectedAgentKey: string | null
  wallsMode: WallsMode
  areRoofsVisible?: boolean
  viewMode?: 'city' | 'office'
  focusedFloorId?: string | null
  focusedRoomId?: string | null
  cameraRequest: CameraRequest | null
  onFit?: () => void
  onManualCameraMove?: () => void
  isCameraManuallyOwned?: boolean
  selectedWorkstation?: WorkstationSpec
  metrics: FrameMetrics
  onSelectAgent: (agentKey: string | null) => void
  onFlyToAgent: (agentKey: string) => void
  reviewableKeys: ReadonlySet<string>
  onReview: (sessionKey: string) => void
  speakingAgentKey: string | null
  // The owner's own character; null until the floor it stands on is known.
  player?: Player | null
  playerGeometry?: OfficeTheme['playerGeometry']
  isWalking?: boolean
  inspectorLayout?: InspectorLayout
  onNearPlayerAgent?: (agentKey: string | null) => void
  onBodyObstacles?: (bodies: readonly BodyFootprint[]) => void
  onEditTarget?: (target: SceneEditTarget) => void
  onFocusFloor?: (floorId: string) => void
}

// Orthographic distance only sets clipping, not size; zoom sets size.
const CAMERA_DISTANCE = 60
const INITIAL_CAMERA_POSITION: [number, number, number] = [
  CAMERA_DISTANCE * Math.sin(ISO_POLAR) * Math.sin(ISO_START_AZIMUTH),
  CAMERA_DISTANCE * Math.cos(ISO_POLAR),
  CAMERA_DISTANCE * Math.sin(ISO_POLAR) * Math.cos(ISO_START_AZIMUTH)
]

// One canvas consumes physical positions from the feed; the legacy scene remains a single plate.
function OfficeScene(props: OfficeSceneProps) {
  const isReducedMotion = usePrefersReducedMotion()
  const [band, setBand] = useState<ZoomBand>('floor')
  const [anchors] = useState<CardAnchors>(() => ({
    cards: new Map(),
    dots: new Map(),
    stacks: new Map()
  }))
  // Serialising the floor is costly; redo it only when an input to the batches changes.
  const { theme, floor, agents, selectedAgentKey, speakingAgentKey, isWalking = false } = props
  const isCyberpunkTheme = theme.id === 'cyberpunk-city'
  const isOpeningCyberpunkOffices = isCyberpunkTheme && props.areRoofsVisible === false
  // The owner's switches: a feature that is off is not mounted, so it costs no frame work.
  const settings = useOfficeSettings()
  const player = settings.player ? props.player : null
  const playerMarker = useRef<HTMLDivElement>(null)
  const playerPrompt = useRef<HTMLDivElement>(null)
  const playerAnchors = useMemo(() => ({ marker: playerMarker, prompt: playerPrompt }), [])
  const [nearPlayerKey, setNearPlayerKey] = useState<string | null>(null)
  const nearPlayerAgent = isWalking
    ? agents.find((agent) => agent.agentKey === nearPlayerKey)
    : undefined
  const onNearPlayerAgent = props.onNearPlayerAgent
  const updateNearPlayer = useCallback(
    (key: string | null) => {
      setNearPlayerKey(key)
      onNearPlayerAgent?.(key)
    },
    [onNearPlayerAgent]
  )
  const [bodies] = useState(() => new SceneBodies())
  bodies.setWorkers(agents)
  const [officeAnchors] = useState<OfficeNameAnchors>(() => new Map())
  const [canvasRoot, setCanvasRoot] = useState<RootState | null>(null)
  const { surfaces, groups, zoneGroups, townFloor, officeLabels, displays, revision } =
    useSceneFloorData(props)
  const visibleCards = useMemo(() => {
    const isCityView = props.viewMode === 'city'
    const roomWorkers = props.focusedRoomId
      ? new Set(
          agents
            .filter((agent) => agent.roomId === props.focusedRoomId)
            .map((agent) => agent.agentKey)
        )
      : null
    return props.cards.filter(
      (card) =>
        card.agentKey === selectedAgentKey ||
        (isCityView
          ? card.status === 'permission' || card.status === 'waiting' || card.status === 'error'
          : !roomWorkers || roomWorkers.has(card.agentKey))
    )
  }, [props.cards, props.viewMode, props.focusedRoomId, agents, selectedAgentKey])
  const visibleStacks = props.viewMode === 'city' || props.focusedRoomId ? [] : props.stacks
  const visibleOfficeLabels = useMemo(
    () =>
      officeLabels.filter((label) =>
        props.viewMode === 'city'
          ? label.kind !== 'room'
          : label.isSelected || label.kind !== 'room'
      ),
    [officeLabels, props.viewMode]
  )
  // The detail level in use: how sharply and how often the scene is drawn. The plan thins the
  // town by that level itself.
  const quality = useQualitySettings()
  const protectedSites = useMemo(
    () =>
      props.allFloors
        ? [
            ...props.allFloors.filter((floor) => (floor.elevation ?? 0) === 0),
            ...(props.venues?.map(cityVenueSite) ?? [])
          ]
        : undefined,
    [props.allFloors, props.venues]
  )
  const previewSites = useMemo(
    () =>
      props.isLayoutPreview
        ? {
            floor: groundEnvelope(surfaces, floor),
            protectedSites: [
              ...surfaces.filter((surface) => (surface.elevation ?? 0) === 0),
              ...(props.previewVenues?.map(cityVenueSite) ?? [])
            ]
          }
        : undefined,
    [props.isLayoutPreview, surfaces, floor, props.previewVenues]
  )
  const town = useTownPlan(townFloor, { protectedSites, preview: previewSites })
  const displayedVenues = props.isLayoutPreview ? props.previewVenues : props.venues
  // In walk mode the owner's character may set off at any moment, so the walking rate holds.
  const pace = useMemo(
    () => ({ idleFps: isWalking ? quality.walkFps : quality.idleFps, walkFps: quality.walkFps }),
    [isWalking, quality.idleFps, quality.walkFps]
  )
  // What the player and the citizens go round: the town's lots and the plots of the belt.
  const solids = useMemo(
    () => (settings.town ? [...town.plan.lots, ...town.green] : []),
    [town, settings.town]
  )
  // How far the scene reaches: the town to its last road, or the floor alone without one.
  const reach = useMemo(
    () => (settings.town ? town.plan.extent : sceneExtent(townFloor, [])),
    [town.plan, townFloor, settings.town]
  )
  const walkTo = useMemo(
    () =>
      isWalking && player
        ? (point: { x: number; z: number }) => sendPlayer(player, point)
        : undefined,
    [isWalking, player]
  )
  const storeyCount = props.floors.length
  const sceneBox = useMemo(
    () => ({
      ...reach,
      minY: props.visibleFloors ? 0 : GROUND_Y,
      maxY: props.visibleFloors
        ? Math.max(
            MAX_LOT_HEIGHT_M,
            floorEnvelope(surfaces)?.maxY ?? 0,
            ...town.plan.lots.map((lot) => lot.maxHeight)
          )
        : MAX_LOT_HEIGHT_M + storeyCount * TOWER_STOREY_M
    }),
    [reach, storeyCount, surfaces, props.visibleFloors, town.plan.lots]
  )
  const liveSessionKeys = useMemo(
    () => new Set(props.sessions.map((session) => session.key)),
    [props.sessions]
  )
  return (
    <div className="absolute inset-0" data-scene-root="">
      {/* The image role sits on the canvas alone: around the card layer it would hide its buttons. */}
      <Canvas
        role="img"
        aria-label={
          props.visibleFloors
            ? `Isometric view of ${surfaces.length} physical office floors`
            : `Isometric view of the ${props.floor.label} floor`
        }
        orthographic
        frameloop="demand"
        flat
        dpr={[1, quality.maxPixelRatio]}
        gl={{ powerPreference: 'low-power', alpha: false, antialias: true }}
        camera={{ zoom: BAND_ZOOM.floor, near: 1, far: 200, position: INITIAL_CAMERA_POSITION }}
        onPointerMissed={() => props.onSelectAgent(null)}
        onCreated={setCanvasRoot}
      >
        <color
          attach="background"
          args={[isCyberpunkTheme ? theme.palette.ink : SCENE_BACKGROUND]}
        />
        <hemisphereLight
          args={
            isCyberpunkTheme
              ? [theme.palette.paper, theme.palette.ink, isOpeningCyberpunkOffices ? 1.45 : 0.8]
              : ['#FFF3DD', '#3A3A40', 2.2]
          }
        />
        <directionalLight position={[10, 20, 6]} intensity={isCyberpunkTheme ? 0.85 : 1.8} />
        <Horizon
          box={sceneBox}
          color={isCyberpunkTheme ? theme.palette.ink : theme.palette.stone}
        />
        {settings.town && <TownGround plan={town.plan} dress={dressOf(theme)} />}
        {settings.town && displayedVenues && (
          <VenueLayer
            venues={displayedVenues}
            palette={theme.palette}
            theme={theme}
            areRoofsVisible={props.areRoofsVisible}
            onSelect={props.onSelectVenue}
          />
        )}
        <BatchedScene revision={revision}>
          {props.visibleFloors ? (
            <MultiFloorLayer
              floors={surfaces}
              agents={props.isLayoutPreview ? [] : agents}
              floorTheme={theme}
              groups={groups}
              wallsMode={props.wallsMode}
              areRoofsVisible={props.areRoofsVisible}
              viewMode={props.viewMode}
              focusedFloorId={props.focusedFloorId}
              focusedRoomId={props.focusedRoomId}
              venues={displayedVenues}
              isReducedMotion={isReducedMotion}
              selectedAgentKey={selectedAgentKey}
              speakingAgentKey={speakingAgentKey}
              onSelect={props.onSelectAgent}
              onFly={props.onFlyToAgent}
              onFlyToZone={props.onFlyToZone}
              onWalk={walkTo}
              onEditTarget={props.onEditTarget}
              onFocusFloor={props.onFocusFloor}
            />
          ) : (
            <>
              <FloorView
                floorTheme={theme}
                zoneGroups={zoneGroups}
                floor={floor}
                wallsMode={props.wallsMode}
                isReducedMotion={isReducedMotion}
                focusedRoomId={props.focusedRoomId}
              />
              <RobotCrew
                agents={agents}
                zoneGroups={zoneGroups}
                floorTheme={theme}
                selectedAgentKey={selectedAgentKey}
                speakingAgentKey={speakingAgentKey}
                isReducedMotion={isReducedMotion}
                onSelect={props.onSelectAgent}
                onFly={props.onFlyToAgent}
              />
            </>
          )}
        </BatchedScene>
        {!props.isLayoutPreview && band !== 'building' && (
          <WorkstationScreens displays={visibleWorkstationDisplays(displays, selectedAgentKey)} />
        )}
        {settings.town && (
          <>
            {!props.visibleFloors && (
              <TowerView plan={town.plan} theme={theme} floors={props.floors} band={band} />
            )}
            <TownView
              town={town}
              floor={townFloor}
              floorTheme={theme}
              zoneGroups={zoneGroups}
              viewMode={props.viewMode}
              focusedFloor={props.floor}
            />
            {settings.ambient && (
              <TownAmbient
                town={town}
                floor={townFloor}
                floorTheme={theme}
                zoneGroups={zoneGroups}
                share={quality.ambientShare}
                isReducedMotion={isReducedMotion}
              />
            )}
          </>
        )}
        {!props.visibleFloors && (
          <ZonePickers
            floor={props.floor}
            onFly={props.onFlyToZone}
            onMiss={() => props.onSelectAgent(null)}
            onWalk={walkTo}
            onEditTarget={props.onEditTarget}
            onFocusFloor={props.onFocusFloor}
          />
        )}
        {!props.isLayoutPreview && settings.citizens && settings.town && (
          <MoverLayer
            floor={townFloor}
            plan={town.plan}
            owners={town.owners}
            floorTheme={theme}
            zoneGroups={zoneGroups}
            player={player}
            isReducedMotion={isReducedMotion}
            hasVehicles={settings.vehicles}
            bodies={bodies}
          />
        )}
        {!props.isLayoutPreview && player && (
          <PlayerLayer
            player={player}
            isWalking={isWalking}
            floor={floor}
            allFloors={props.allFloors ?? props.visibleFloors}
            solids={solids}
            extent={reach}
            agents={agents}
            palette={theme.palette}
            geometryFactory={props.playerGeometry ?? theme.playerGeometry}
            isReducedMotion={isReducedMotion}
            onSelectAgent={props.onSelectAgent}
            isCameraManuallyOwned={props.isCameraManuallyOwned}
            hasInspector={selectedAgentKey !== null}
            inspectorLayout={props.inspectorLayout}
            onNearAgent={updateNearPlayer}
            bodies={bodies}
          />
        )}
        <CardProjector
          cards={visibleCards}
          stacks={visibleStacks}
          anchors={anchors}
          band={band}
          selectedAgentKey={props.selectedAgentKey}
          inspectorLayout={props.inspectorLayout}
          agents={agents}
          visibleFloors={props.visibleFloors}
        />
        <OfficeNameProjector
          labels={visibleOfficeLabels}
          anchors={officeAnchors}
          cardAnchors={anchors}
          band={band}
          hasInspector={selectedAgentKey !== null}
          inspectorLayout={props.inspectorLayout}
          cards={visibleCards}
          showsPhysicalFloors={props.visibleFloors !== undefined}
        />
        <CameraRig
          floorCount={props.floors.length}
          scene={sceneBox}
          floor={props.floor}
          visibleFloors={props.visibleFloors}
          agents={props.agents}
          liveSessionKeys={liveSessionKeys}
          request={props.cameraRequest}
          onFit={props.onFit}
          onManualMove={props.onManualCameraMove}
          workstation={props.selectedWorkstation}
          isReducedMotion={isReducedMotion}
          isWalking={isWalking}
          hasInspector={selectedAgentKey !== null}
          inspectorLayout={props.inspectorLayout}
          onBandChange={setBand}
          viewMode={props.viewMode}
          focusedFloorId={props.focusedFloorId}
        />
        <FrameGovernor pace={pace} agents={agents} />
        <MetricsProbe metrics={props.metrics} />
        {player && (
          <PlayerLabelProjector
            anchors={playerAnchors}
            player={player}
            floor={floor}
            nearAgent={nearPlayerAgent}
          />
        )}
        {!props.isLayoutPreview && (
          <BodyObstacleSync bodies={bodies} onChange={props.onBodyObstacles} />
        )}
        <ShaderPrewarm root={canvasRoot} viewMode={props.viewMode} />
      </Canvas>
      {!props.isLayoutPreview && (
        <NameCardLayer
          cards={visibleCards}
          stacks={visibleStacks}
          onFlyToZone={props.onFlyToZone}
          reviewableKeys={props.reviewableKeys}
          onReview={props.onReview}
          band={band}
          selectedAgentKey={props.selectedAgentKey}
          anchors={anchors}
        />
      )}
      <OfficeNameLayer labels={visibleOfficeLabels} anchors={officeAnchors} />
      {!props.isLayoutPreview && player && (
        <PlayerLabels anchors={playerAnchors} nearAgent={nearPlayerAgent} />
      )}
    </div>
  )
}

// Selecting, notices and the HUD's own state re-render the app; the scene follows its props.
export default memo(OfficeScene)
