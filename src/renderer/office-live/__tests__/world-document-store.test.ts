import { expect, it } from 'vitest'
import { buildLayout } from '../../../office/sim/layout'
import { session } from '../../../office/sim/fixtures'
import { createWorldDocumentStore, WORLD_DOCUMENT_STORAGE_KEY } from '../world-document-store'
import type { WorldDocumentLock } from '../world-document-storage'

function environment() {
  const sessions = [session('one')]
  const layout = buildLayout(sessions, undefined)
  const bytes = new Map<string, string>([['claudewatch.office.layout', JSON.stringify(layout)]])
  let tail: Promise<unknown> = Promise.resolve()
  const lock: WorldDocumentLock = {
    runExclusive(operation) {
      const pending = tail.then(operation)
      tail = pending.catch(() => undefined)
      return pending
    }
  }
  const storage = {
    getItem: (key: string) => bytes.get(key) ?? null,
    setItem: (key: string, text: string) => {
      bytes.set(key, text)
    }
  }
  return { bytes, storage, lock, getLayout: () => layout, getSessions: () => sessions }
}

it('reconciles a new project around saved plots without moving them or writing saved bytes', async () => {
  const options = environment()
  let sessions = options.getSessions()
  const store = createWorldDocumentStore({
    ...options,
    getSessions: () => sessions,
    getLayout: () => buildLayout(sessions, options.getLayout())
  })
  const initial = store.get().document
  initial.buildings[0].floors = 3
  initial.rooms[0].floorNumber = 3
  initial.rooms[0].displayName = 'Saved upper studio'
  expect((await store.save(initial, 0)).success).toBe(true)
  const previous = store.get().document
  const bytes = options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)
  sessions = [...sessions, session('new-project-agent', 'p_b')]
  store.reconcile()
  expect(store.get().document.buildings[0]).toEqual(previous.buildings[0])
  expect(store.preview(store.get().document).success).toBe(true)
  expect(store.get().document.rooms).toEqual(expect.arrayContaining(previous.rooms))
  expect(options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(bytes)
  store.dispose()
})

it('previews and cancels without writing either key', () => {
  const options = environment()
  const store = createWorldDocumentStore(options)
  const before = new Map(options.bytes)
  const draft = store.get().document
  draft.rooms[0].displayName = 'Preview only'
  expect(store.preview(draft).success).toBe(true)
  expect(store.get().document.rooms[0].displayName).toBeUndefined()
  expect(store.get().draft?.rooms[0].displayName).toBe('Preview only')
  store.cancel()
  expect(store.get().draft).toBeNull()
  expect(options.bytes).toEqual(before)
  store.dispose()
})

it('reserves inactive saved offices while reconciling a replacement project', async () => {
  const options = environment()
  let sessions = options.getSessions()
  const store = createWorldDocumentStore({
    ...options,
    getSessions: () => sessions,
    getLayout: () => buildLayout(sessions, undefined)
  })
  expect((await store.save(store.get().document, 0)).success).toBe(true)
  const saved = store.get().document
  const before = options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)
  sessions = [session('replacement', 'p_b')]
  store.reconcile()
  expect(store.get().document.buildings).toEqual(expect.arrayContaining(saved.buildings))
  expect(store.preview(store.get().document).success).toBe(true)
  expect(options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(before)
  store.dispose()
})

it('places regenerated venues around a saved office instead of invalidating its layout', async () => {
  const options = environment()
  const store = createWorldDocumentStore(options)
  const draft = store.get().document
  const site = draft.venues[0].footprint
  draft.buildings[0].footprint.x = site.x
  draft.buildings[0].footprint.z = site.z
  draft.venues = []
  expect((await store.save(draft, 0)).success).toBe(true)
  const saved = store.get().document
  const before = options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)
  store.reconcile()
  expect(store.get().document.venues.length).toBeGreaterThan(0)
  expect(store.preview(store.get().document).success).toBe(true)
  expect(store.get().document.buildings).toEqual(saved.buildings)
  expect(options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(before)
  store.dispose()
})

it('serializes latest read, validation, one write and publish across two windows', async () => {
  const options = environment()
  const first = createWorldDocumentStore(options)
  const second = createWorldDocumentStore(options)
  const firstDraft = first.get().document
  const secondDraft = second.get().document
  firstDraft.rooms[0].displayName = 'First'
  secondDraft.rooms[0].displayName = 'Second'
  const outcomes = await Promise.all([first.save(firstDraft, 0), second.save(secondDraft, 0)])
  expect(outcomes.map((outcome) => outcome.success)).toEqual([true, false])
  expect(outcomes[1]).toMatchObject({ success: false, reason: 'conflict', revision: 1 })
  expect(JSON.parse(options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)!)).toMatchObject({ revision: 1 })
  expect(options.bytes.get('claudewatch.office.layout')).toBe(JSON.stringify(options.getLayout()))
})

it('fails closed on unavailable locks, quota errors and corrupt future bytes', async () => {
  const options = environment()
  const unlocked = createWorldDocumentStore({ ...options, lock: null })
  expect(await unlocked.save(unlocked.get().document, 0)).toMatchObject({
    success: false,
    reason: 'lock-unavailable'
  })
  expect(unlocked.get().unsaved).toBe(true)
  const quota = createWorldDocumentStore({
    ...options,
    storage: {
      ...options.storage,
      setItem: () => {
        throw new Error('quota')
      }
    }
  })
  expect(await quota.save(quota.get().document, 0)).toMatchObject({
    success: false,
    reason: 'storage-write'
  })
  expect(quota.get().revision).toBe(0)
  const futureBytes = '{"version":99,"revision":7}'
  options.bytes.set(WORLD_DOCUMENT_STORAGE_KEY, futureBytes)
  const future = createWorldDocumentStore(options)
  expect(await future.save(future.get().document, 0)).toMatchObject({
    success: false,
    reason: 'stored-document-invalid'
  })
  expect(options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(futureBytes)
})

it('undo validates against latest occupancy and never restores old session records', async () => {
  const options = environment()
  const store = createWorldDocumentStore(options)
  const draft = store.get().document
  draft.rooms[0].displayName = 'Local label'
  expect((await store.save(draft, 0)).success).toBe(true)
  expect((await store.undo(1)).success).toBe(true)
  expect(store.get().revision).toBe(2)
  expect(store.get().document.rooms[0].displayName).toBeUndefined()
  expect(store.get().document).not.toHaveProperty('sessions')
})

it('revalidates after waiting for the writer lock against current member capacity', async () => {
  const options = environment()
  let members = options.getSessions()
  const store = createWorldDocumentStore({ ...options, getSessions: () => members })
  const draft = store.get().document
  draft.rooms[0].desks = draft.rooms[0].desks.filter((desk) => desk.id === 'desk_main')
  expect(store.preview(draft).success).toBe(true)
  members = [{ ...members[0], subagents: [{ id: 'guest', type: 'Explore', activity: 'idle' }] }]
  expect(await store.save(draft, 0)).toMatchObject({
    success: false,
    reason: 'invalid-draft',
    errors: expect.arrayContaining([expect.objectContaining({ reason: 'occupied-capacity' })])
  })
  expect(options.bytes.has(WORLD_DOCUMENT_STORAGE_KEY)).toBe(false)
})

it('keeps committed overrides when quota makes undo fail', async () => {
  const options = environment()
  let hasQuota = true
  const store = createWorldDocumentStore({
    ...options,
    storage: {
      ...options.storage,
      setItem(key, serialized) {
        if (!hasQuota) throw new Error('quota')
        options.storage.setItem(key, serialized)
      }
    }
  })
  const draft = store.get().document
  draft.rooms[0].displayName = 'Saved label'
  await store.save(draft, 0)
  hasQuota = false
  expect(await store.undo(1)).toMatchObject({ success: false, reason: 'storage-write' })
  expect(store.get().document.rooms[0].displayName).toBe('Saved label')
  expect(store.get().revision).toBe(1)
  expect(store.get().unsaved).toBe(true)
})

it('follows storage revisions without losing a local draft, and disposes the subscription', async () => {
  const options = environment()
  const events = new Set<(event: { key: string | null; newValue: string | null }) => void>()
  const storage = {
    ...options.storage,
    subscribe(listener: (event: { key: string | null; newValue: string | null }) => void) {
      events.add(listener)
      return () => {
        events.delete(listener)
      }
    }
  }
  const first = createWorldDocumentStore({ ...options, storage })
  const second = createWorldDocumentStore({ ...options, storage })
  const localDraft = second.get().document
  localDraft.rooms[0].displayName = 'Unsaved local'
  second.preview(localDraft)
  const remoteDraft = first.get().document
  remoteDraft.rooms[0].displayName = 'Other window'
  await first.save(remoteDraft, 0)
  for (const listener of events)
    listener({
      key: WORLD_DOCUMENT_STORAGE_KEY,
      newValue: options.bytes.get(WORLD_DOCUMENT_STORAGE_KEY)!
    })
  expect(second.get()).toMatchObject({ revision: 1, error: 'conflict', unsaved: true })
  expect(second.get().draft?.rooms[0].displayName).toBe('Unsaved local')
  expect(second.get().document.rooms[0].displayName).toBe('Other window')
  first.dispose()
  second.dispose()
  expect(events.size).toBe(0)
})

it('supports successive undo revisions', async () => {
  const options = environment()
  const store = createWorldDocumentStore(options)
  const first = store.get().document
  first.rooms[0].displayName = 'First label'
  await store.save(first, 0)
  const second = store.get().document
  second.rooms[0].displayName = 'Second label'
  await store.save(second, 1)
  expect((await store.undo(2)).success).toBe(true)
  expect(store.get().document.rooms[0].displayName).toBe('First label')
  expect((await store.undo(3)).success).toBe(true)
  expect(store.get().document.rooms[0].displayName).toBeUndefined()
})

it('rejects identity rebinding in both preview and the locked save', async () => {
  const options = environment()
  const store = createWorldDocumentStore(options)
  await store.save(store.get().document, 0)
  const draft = store.get().document
  draft.buildings[0].projectKey = 'different-actual-project'
  expect(store.preview(draft)).toMatchObject({
    success: false,
    errors: expect.arrayContaining([expect.objectContaining({ reason: 'identity-binding' })])
  })
  expect(await store.save(draft, 1)).toMatchObject({ success: false, reason: 'invalid-draft' })
  expect(store.get().revision).toBe(1)
})

it('does not pretend a no-op storage write persisted the document', async () => {
  const options = environment()
  const store = createWorldDocumentStore({
    ...options,
    storage: { ...options.storage, setItem: () => undefined }
  })
  expect(await store.save(store.get().document, 0)).toMatchObject({
    success: false,
    reason: 'storage-readback'
  })
  expect(store.get()).toMatchObject({ revision: 0, unsaved: true, error: 'storage-readback' })
})

it('undo preserves the latest stable allocation seed', async () => {
  const options = environment()
  const store = createWorldDocumentStore(options)
  const draft = store.get().document
  draft.rooms[0].displayName = 'Local label'
  await store.save(draft, 0)
  const seeded = store.get().document
  seeded.allocation!.order[0].index = 2
  await store.save(seeded, 1)
  expect((await store.undo(2)).success).toBe(true)
  expect((await store.undo(3)).success).toBe(true)
  expect(store.get().document.rooms[0].displayName).toBeUndefined()
  expect(store.get().document.allocation!.order[0].index).toBe(2)
})

it('does not commit a queued writer after disposal', async () => {
  const options = environment()
  const store = createWorldDocumentStore(options)
  const pending = store.save(store.get().document, 0)
  store.dispose()
  expect(await pending).toMatchObject({ success: false, reason: 'disposed' })
  expect(options.bytes.has(WORLD_DOCUMENT_STORAGE_KEY)).toBe(false)
})
