import { World } from '../../office/sim/world'
import { buildLayout, type LayoutMap } from '../../office/sim/layout'
import { effectiveWorldKey, resolveEffectiveWorld } from '../../office/sim/effective-world'
import { createWorldDocument } from '../../shared/office/world-document'
import { createWorldDocumentStore, type WorldDocumentStore } from './world-document-store'
import { listThemes } from '../office/themes/registry'
import { isJsonObject } from '../../shared/json-object'
import { applyFeed } from '../../shared/office/apply-feed'
import type {
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
import { toFloorGeometry } from './layout-geometry'
import { officePoses, poseOf, structuralKey, type PoseStore } from './pose-store'

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
}

interface LayoutStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
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

// Storage is null, or throws, where site data is blocked, and anything else in it is not a
// layout: the office then starts from a fresh one.
function loadLayout(storage: LayoutStorage | null): LayoutMap | undefined {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(LAYOUT_KEY) ?? 'null')
    return isLayoutMap(saved) ? saved : undefined
  } catch {
    return undefined
  }
}

function saveLayout(storage: LayoutStorage | null, serialised: string): void {
  try {
    storage?.setItem(LAYOUT_KEY, serialised)
  } catch {
    // Not remembered; the feed listener that called this must keep running.
  }
}

// Runs the office sim in the renderer on top of the bridge feed and emits a frame when it changes.
export function createLiveFeed(
  source: FeedSource,
  options: {
    storage: LayoutStorage | null
    worldEditing?: boolean
    now?: () => number
    // The owner's switches; the sim reads only the lounge trips.
    settings?: Pick<OfficeSettingsStore, 'get' | 'subscribe'>
    visibility?: VisibilityEnv
    poses?: PoseStore
  }
): LiveFeed {
  const now = options.now ?? Date.now
  const settings = options.settings ?? officeSettings
  const visibility = options.visibility ?? browserVisibilityEnv()
  const listeners = new Set<(frame: OfficeFrame) => void>()
  const poses = options.poses ?? officePoses
  let stop: (() => void) | null = null
  let currentWorld: World | null = null
  let documentStore: WorldDocumentStore | null = null

  const start = (): (() => void) => {
    const saved = loadLayout(options.storage)
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
      ...(options.worldEditing
        ? {
            resolveLayout,
            getVenueTargets: () =>
              (resolvedLayout?.effectiveVenues ?? []).map((venue) => ({
                id: venue.id,
                kind: venue.kind,
                capacity: venue.capacity,
                entrance: {
                  x: venue.footprint.x + venue.entrance.x,
                  z: venue.footprint.z + venue.entrance.z
                },
                slots: venue.slots.map((slot) => ({
                  ...slot,
                  x: slot.x + venue.footprint.x,
                  z: slot.z + venue.footprint.z
                }))
              }))
          }
        : {})
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
    let savedLayout = ''
    let lastAgents = ''
    let lastFrameAtMs = Number.NEGATIVE_INFINITY
    let isDirty = true
    let offDocument: (() => void) | undefined
    let documentRevision = -1
    let documentKey = ''
    const updateFloors = (): void => {
      const nextFloors = toFloorGeometry(
        world.layout(),
        snapshot?.sessions ?? lastKnownSnapshot?.sessions ?? [],
        { keepEmptyHeadquarters: !options.worldEditing }
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
        return
      }
      const nextSnapshot = applyFeed(snapshot, message)
      if (nextSnapshot === null || nextSnapshot === snapshot) return
      snapshot = nextSnapshot
      lastKnownSnapshot = snapshot
      feedReceivedAtMs = now()
      feedRevision = snapshot.rev
      if (options.worldEditing && !documentStore) {
        const initialLayout = buildLayout(snapshot.sessions, saved)
        documentStore = createWorldDocumentStore({
          storage: options.storage,
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
        keepEmptyHeadquarters: !options.worldEditing
      })
      const nextFloorsKey = JSON.stringify(nextFloors)
      if (nextFloorsKey !== floorsKey) {
        floors = nextFloors
        floorsKey = nextFloorsKey
      }
      isDirty = true
      const serialised = JSON.stringify(layout)
      if (serialised !== savedLayout) {
        if (!options.worldEditing) saveLayout(options.storage, serialised)
        savedLayout = serialised
      }
    })
    let isStopped = false
    void source.ready().catch(() => {
      if (isStopped) return
      snapshot = null
      world.apply({ type: 'resync' })
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
      if (!isDirty && agentsKey === lastAgents) return
      if (!visibility.read().isFocused && tick - lastFrameAtMs < BLURRED_FRAME_GAP_MS) return
      isDirty = false
      lastAgents = agentsKey
      lastFrameAtMs = tick
      poses.retain(new Set(agents.map((agent) => agent.agentKey)))
      const frame: OfficeFrame = {
        floors,
        agents,
        sessions: lastKnownSnapshot?.sessions ?? [],
        connected: snapshot !== null,
        sources: lastKnownSnapshot?.sources ?? [],
        accounts: lastKnownSnapshot?.accounts,
        feedReceivedAtMs,
        feedRevision,
        worldRevision: options.worldEditing ? documentRevision : undefined,
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
