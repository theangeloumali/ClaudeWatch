import { World } from '../../office/sim/world'
import { buildLayout, type LayoutMap } from '../../office/sim/layout'
import { effectiveWorldKey, resolveEffectiveWorld } from '../../office/sim/effective-world'
import { createWorldDocument, parseWorldDocument } from '../../shared/office/world-document'
import { createWorldDocumentStore, type WorldDocumentStore } from './world-document-store'
import { hostWorldStorage, type HostWorldStorage } from './host-world-storage'
import type { WorldSaveReply } from '../../shared/office/world-sync'
import { listThemes } from '../office/themes/registry'
import { isJsonObject } from '../../shared/json-object'
import { applyFeed } from '../../shared/office/apply-feed'
import type {
  AgentView,
  FocusResult,
  FeedMessage,
  InteractionResult,
  OfficeSnapshot,
  PeekResult,
  PermissionDecision,
  ProviderId,
  SessionRef
} from '../../shared/office/types'
import { officeSettings, type OfficeSettingsStore } from '../office/logic/office-settings'
import { browserVisibilityEnv, type VisibilityEnv } from '../office/logic/frame-governor'
import type { FloorGeometry, OfficeFeed, OfficeFrame } from '../office/scene-model'
import { cityEvents, type CityEventLog } from './city-events'
import { toFloorGeometry } from './layout-geometry'
import { officePoses, poseOf, structuralKey, type PoseStore } from './pose-store'
import { createGamingCheck } from '../office/scene/worker-seat-presence'

export interface FeedSource {
  ready(): Promise<void>
  onFeedMessage(listener: (message: FeedMessage) => void): () => void
  focus(agentKey: string): Promise<FocusResult>
  send(sessionKey: string, text: string): Promise<InteractionResult>
  respond(
    sessionKey: string,
    decision: PermissionDecision,
    fingerprint: string
  ): Promise<InteractionResult>
  peek(sessionKey: string): Promise<PeekResult>
  start(projectKey: string, provider: ProviderId): Promise<InteractionResult>
  // Saves the city on the host every page shares; a source without it keeps the page's own.
  saveWorld?(document: unknown): Promise<WorldSaveReply>
}

interface LayoutStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

const LAYOUT_KEY = 'claudewatch.office.layout'
const TICK_MS = 100
// The governor's blurred idle rate (5 fps): a background window needs React frames no faster.
const BLURRED_FRAME_GAP_MS = 200

export interface LiveFeed extends OfficeFeed {
  // Every agent's pose at the latest sim step; frames are sent only when structure changes.
  poses: PoseStore
}

const isObjectArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isJsonObject)

// Only the outline the sim reads order and bays through is checked; the sim never trusts more.
function isLayoutMap(value: unknown): value is LayoutMap {
  if (!isJsonObject(value) || value.version !== 1 || !isJsonObject(value.reservations)) return false
  const { floors } = value
  return (
    isObjectArray(floors) &&
    floors.every(
      (floor) =>
        isObjectArray(floor.rooms) &&
        isObjectArray(floor.zones) &&
        floor.zones.every((zone) => isObjectArray(zone.children))
    )
  )
}

// A host that keeps the city sends it in its hello, null while it holds none. It is checked here
// like any document read from storage.
function receiveHostWorld(storage: HostWorldStorage | null, snapshot: OfficeSnapshot): void {
  if (!storage || !('world' in snapshot)) return
  const parsed = snapshot.world === null ? null : parseWorldDocument(snapshot.world)
  if (parsed === null || parsed.success) storage.receive(parsed?.document ?? null)
}

// A layout saved before the world document, so an upgraded office keeps its desks. Storage is
// null, or throws, where site data is blocked; anything else in it is not a layout.
function loadLayout(storage: LayoutStorage | null): LayoutMap | undefined {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(LAYOUT_KEY) ?? 'null')
    return isLayoutMap(saved) ? saved : undefined
  } catch {
    return undefined
  }
}

// Runs the office sim in the renderer on top of the bridge feed and emits a frame when it changes.
export function createLiveFeed(
  source: FeedSource,
  options: {
    storage: LayoutStorage | null
    now?: () => number
    // The owner's switches; the sim reads only the lounge trips.
    settings?: Pick<OfficeSettingsStore, 'get' | 'subscribe'>
    visibility?: VisibilityEnv
    poses?: PoseStore
    events?: Pick<CityEventLog, 'observe'>
  }
): LiveFeed {
  const now = options.now ?? Date.now
  const settings = options.settings ?? officeSettings
  const visibility = options.visibility ?? browserVisibilityEnv()
  const listeners = new Set<(frame: OfficeFrame) => void>()
  const poses = options.poses ?? officePoses
  const events = options.events ?? cityEvents
  let stop: (() => void) | null = null
  let currentWorld: World | null = null
  let documentStore: WorldDocumentStore | null = null

  const start = (): (() => void) => {
    const saved = loadLayout(options.storage)
    const saveWorld = source.saveWorld?.bind(source)
    const hostStorage = saveWorld ? hostWorldStorage(options.storage, saveWorld) : null
    let resolvedKey = ''
    let resolvedLayout: LayoutMap | undefined
    const resolveLayout = (base: LayoutMap, sessions: readonly SessionRef[]): LayoutMap => {
      const document = documentStore?.get().document ?? createWorldDocument(base, sessions)
      const nextKey = effectiveWorldKey(base, document, sessions)
      if (nextKey !== resolvedKey || !resolvedLayout) {
        resolvedLayout = resolveEffectiveWorld(base, document, sessions)
        resolvedKey = nextKey
      }
      return resolvedLayout
    }
    const world = new World({
      now,
      saved,
      loungeTrips: settings.get().loungeTrips,
      resolveLayout
    })
    currentWorld = world
    // A running office follows the switch: the next step walks agents back, or lets them go.
    const offSettings = settings.subscribe(() => world.setLoungeTrips(settings.get().loungeTrips))
    let snapshot: OfficeSnapshot | null = null
    let lastKnownSnapshot: OfficeSnapshot | null = null
    let feedReceivedAtMs: number | undefined
    let feedRevision: number | undefined
    let floors: FloorGeometry[] = []
    let floorsKey = ''
    let lastTick = now()
    const offVisibility = visibility.onChange(() => {
      lastTick = now()
    })
    let lastAgents = ''
    let lastGamers = ''
    let gaming = { floors, isGaming: createGamingCheck(floors) }
    // A walk moves poses only; a gamer sitting down changes its card, so it needs a frame.
    const gamersOf = (agents: readonly AgentView[]): string => {
      if (gaming.floors !== floors) gaming = { floors, isGaming: createGamingCheck(floors) }
      return agents
        .filter(gaming.isGaming)
        .map((agent) => agent.agentKey)
        .join('\n')
    }
    let structureRevision = 0
    let lastFrameAtMs = Number.NEGATIVE_INFINITY
    let sentFading = new Set<string>()
    let sentKeys = new Set<string>()
    let isDirty = true
    let offDocument: (() => void) | undefined
    let documentRevision = -1
    let documentKey = ''
    const updateFloors = (): void => {
      const nextFloors = toFloorGeometry(
        world.layout(),
        snapshot?.sessions ?? lastKnownSnapshot?.sessions ?? [],
        { keepEmptyHeadquarters: false }
      )
      const nextKey = JSON.stringify(nextFloors)
      if (nextKey !== floorsKey) {
        floors = nextFloors
        floorsKey = nextKey
      }
      isDirty = true
    }

    const offFeed = source.onFeedMessage((message) => {
      if (message.type === 'resync') {
        world.apply(message)
        snapshot = null
        isDirty = true
        events.observe('resync', [], now())
        return
      }
      const nextSnapshot = applyFeed(snapshot, message)
      if (nextSnapshot === null || nextSnapshot === snapshot) return
      snapshot = nextSnapshot
      lastKnownSnapshot = snapshot
      feedReceivedAtMs = now()
      // After the fold, so a duplicate or late patch never reaches the event log.
      events.observe(
        message.type,
        snapshot.sessions,
        feedReceivedAtMs,
        snapshot.projectsToday,
        snapshot.sources
      )
      feedRevision = snapshot.rev
      if (message.type === 'hello') receiveHostWorld(hostStorage, snapshot)
      if (!documentStore) {
        const initialLayout = buildLayout(snapshot.sessions, saved)
        documentStore = createWorldDocumentStore({
          storage: hostStorage ?? options.storage,
          getLayout: () => (world.baseLayout().floors.length ? world.baseLayout() : initialLayout),
          getSessions: () => snapshot?.sessions ?? lastKnownSnapshot?.sessions ?? [],
          knownThemeIds: listThemes().map((theme) => theme.id)
        })
        documentRevision = documentStore.get().revision
        documentKey = JSON.stringify(documentStore.get().document)
        offDocument = documentStore.subscribe((state) => {
          const nextKey = JSON.stringify(state.document)
          if (nextKey === documentKey) return
          documentKey = nextKey
          documentRevision = state.revision
          resolvedKey = ''
          world.refreshLayout()
          updateFloors()
        })
      }
      world.apply(message)
      documentStore?.reconcile()
      const layout = world.layout()
      // Most messages change no geometry: the scene keeps its world while the floors are the same.
      const nextFloors = toFloorGeometry(layout, snapshot?.sessions ?? [], {
        keepEmptyHeadquarters: false
      })
      const nextFloorsKey = JSON.stringify(nextFloors)
      if (nextFloorsKey !== floorsKey) {
        floors = nextFloors
        floorsKey = nextFloorsKey
      }
      isDirty = true
    })
    let isStopped = false
    void source.ready().catch(() => {
      if (isStopped) return
      snapshot = null
      world.apply({ type: 'resync' })
      events.observe('resync', [], now())
      isDirty = true
    })

    const timer = setInterval(() => {
      const tick = now()
      if (visibility.read().isHidden) {
        lastTick = tick
        return
      }
      const agents = world.step(tick - lastTick)
      lastTick = tick
      for (const agent of agents) poses.write(agent.agentKey, poseOf(agent))
      // A walk moves poses only: the scene reads those each drawn frame, without React (perf-2).
      const agentsKey = structuralKey(agents)
      const gamers = gamersOf(agents)
      if (!isDirty && agentsKey === lastAgents && gamers === lastGamers) return
      // A fade on a robot already drawn goes out at once: it shrinks over it, and a leaver held
      // back a tick would unmount before it had shrunk away. A newcomer mounts unseen anyway.
      const fading = new Set(agents.filter((a) => a.fade !== undefined).map((a) => a.agentKey))
      const startsFade = [...fading].some((key) => !sentFading.has(key) && sentKeys.has(key))
      if (
        !startsFade &&
        !visibility.read().isFocused &&
        tick - lastFrameAtMs < BLURRED_FRAME_GAP_MS
      )
        return
      sentFading = fading
      sentKeys = new Set(agents.map((agent) => agent.agentKey))
      isDirty = false
      if (agentsKey !== lastAgents) structureRevision += 1
      lastAgents = agentsKey
      lastGamers = gamers
      lastFrameAtMs = tick
      poses.retain(sentKeys)
      const frame: OfficeFrame = {
        floors,
        agents,
        sessions: lastKnownSnapshot?.sessions ?? [],
        connected: snapshot !== null,
        sources: lastKnownSnapshot?.sources ?? [],
        accounts: lastKnownSnapshot?.accounts,
        projectsToday: lastKnownSnapshot?.projectsToday,
        feedReceivedAtMs,
        feedRevision,
        structureRevision,
        worldRevision: documentRevision,
        venues: resolvedLayout?.effectiveVenues
      }
      for (const listener of listeners) listener(frame)
    }, TICK_MS)

    return () => {
      isStopped = true
      clearInterval(timer)
      offVisibility()
      offFeed()
      offSettings()
      offDocument?.()
      documentStore?.dispose()
      documentStore = null
      if (currentWorld === world) currentWorld = null
    }
  }

  return {
    poses,
    getWorldDocumentStore: () => documentStore,
    setBodyObstacles: (bodies) => currentWorld?.setBodyObstacles(bodies),
    subscribe(listener) {
      listeners.add(listener)
      if (!stop) stop = start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && stop) {
          stop()
          stop = null
        }
      }
    },
    focus: (agentKey) => source.focus(agentKey),
    send: (sessionKey, text) => source.send(sessionKey, text),
    respond: (sessionKey, decision, fingerprint) =>
      source.respond(sessionKey, decision, fingerprint),
    peek: (sessionKey) => source.peek(sessionKey),
    start: (projectKey, provider) => source.start(projectKey, provider)
  }
}
