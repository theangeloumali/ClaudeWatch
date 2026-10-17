import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { session } from '../../../office/sim/fixtures'
import type { FeedMessage, OfficeSnapshot } from '../../../shared/office/types'
import { parseWorldDocument, type WorldDocument } from '../../../shared/office/world-document'
import type { WorldSaveReply, WorldSnapshot } from '../../../shared/office/world-sync'
import { createOfficeSettingsStore } from '../../office/logic/office-settings'
import { createLiveFeed, type FeedSource } from '../live-feed'
import { createPoseStore } from '../pose-store'
import { WORLD_DOCUMENT_STORAGE_KEY } from '../world-document-store'

const sessions = [session('claude:a')]
const snapshot: OfficeSnapshot = { rev: 1, generatedAtMs: 1, sessions, sources: [] }

function memoryStorage() {
  const bytes = new Map<string, string>()
  return {
    bytes,
    getItem: (key: string) => bytes.get(key) ?? null,
    setItem: (key: string, value: string) => void bytes.set(key, value)
  }
}

// The host's contract (src/office-host/host-world.ts): one city, compare-and-swap after the
// first, and a fresh hello to every watcher on each save.
function memoryHost() {
  let saved: WorldDocument | null = null
  const watchers = new Set<(message: FeedMessage) => void>()
  const hello = (): FeedMessage => {
    const withCity: WorldSnapshot = { ...snapshot, world: saved }
    return { type: 'hello', v: 1, snapshot: withCity }
  }
  return {
    current: () => saved,
    watch(listener: (message: FeedMessage) => void): () => void {
      listener(hello())
      watchers.add(listener)
      return () => watchers.delete(listener)
    },
    save(document: unknown): WorldSaveReply {
      const parsed = parseWorldDocument(document)
      if (!parsed.success) return { success: false, reason: 'invalid-document', document: saved }
      if (saved && parsed.document.revision !== saved.revision + 1)
        return { success: false, reason: 'conflict', document: saved }
      saved = parsed.document
      for (const watcher of watchers) watcher(hello())
      return { success: true, document: saved }
    }
  }
}
type HostWorld = ReturnType<typeof memoryHost>

// A page on the host: its own storage (its own origin), the host's feed and save.
function pageOn(
  world: HostWorld,
  {
    save = (document: unknown) => world.save(document),
    storage = memoryStorage()
  }: {
    save?: (document: unknown) => WorldSaveReply
    storage?: ReturnType<typeof memoryStorage>
  } = {}
) {
  const source: FeedSource = {
    ready: async () => {},
    onFeedMessage: (listener) => world.watch(listener),
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn(),
    saveWorld: async (document): Promise<WorldSaveReply> => save(document)
  }
  const settings = createOfficeSettingsStore(null)
  settings.set('loungeTrips', false)
  const feed = createLiveFeed(source, {
    storage,
    settings,
    poses: createPoseStore(),
    visibility: { read: () => ({ isHidden: false, isFocused: true }), onChange: () => () => {} }
  })
  const unsubscribe = feed.subscribe(() => {})
  const store = (): NonNullable<ReturnType<NonNullable<typeof feed.getWorldDocumentStore>>> => {
    const current = feed.getWorldDocumentStore?.()
    if (!current) throw new Error('the feed opened no world store')
    return current
  }
  return { storage, store, unsubscribe }
}

const renamed = (document: WorldDocument, displayName: string): WorldDocument => ({
  ...document,
  buildings: document.buildings.map((building) => ({ ...building, displayName }))
})

describe('one saved city per host (health-13)', () => {
  let world: HostWorld
  const pages: { unsubscribe: () => void }[] = []
  beforeEach(() => {
    world = memoryHost()
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: { request: (_name: string, _options: object, run: () => unknown) => run() }
    })
  })
  afterEach(() => {
    for (const page of pages.splice(0)) page.unsubscribe()
    vi.unstubAllGlobals()
  })
  const open = (options?: Parameters<typeof pageOn>[1]) => {
    const page = pageOn(world, options)
    pages.push(page)
    return page
  }

  it('two feeds with different storages but one host see the same saved document', async () => {
    const app = open()
    const browser = open()
    const { document, revision } = app.store().get()
    expect(await app.store().save(renamed(document, 'Arranged'), revision)).toMatchObject({
      success: true
    })
    const arranged = app.store().get().document
    expect(browser.store().get().document).toEqual(arranged)
    expect(open().store().get().document).toEqual(arranged)
    expect(world.current()).toEqual(arranged)
  })

  it('hands the host the city a page kept before the host held one', async () => {
    const template = open()
    const city = { ...renamed(template.store().get().document, 'From before'), revision: 4 }
    const storage = memoryStorage()
    storage.setItem(WORLD_DOCUMENT_STORAGE_KEY, JSON.stringify(city))
    open({ storage })
    await vi.waitFor(() => expect(world.current()).toEqual(city))
    expect(open().store().get().document).toEqual(city)
  })

  it('puts the host’s city back when the host refuses a save', async () => {
    const app = open()
    const shown = app.store().get()
    await app.store().save(renamed(shown.document, 'Arranged'), shown.revision)
    const viewer = open({
      save: () => ({ success: false, reason: 'not-permitted', document: world.current() })
    })
    const { document, revision } = viewer.store().get()
    expect(await viewer.store().save(renamed(document, 'Refused'), revision)).toMatchObject({
      success: true
    })
    await vi.waitFor(() =>
      expect(viewer.store().get().document.buildings[0]?.displayName).toBe('Arranged')
    )
  })
})
