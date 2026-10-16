import type { LayoutMap } from '../../office/sim/layout'
import type { SessionRef } from '../../shared/office/types'
import { mergeActiveWorldDocument } from '../../shared/office/world-document-layout'
import { placeWorldFootprint } from '../../shared/office/world-document-packing'
import {
  createWorldDocument,
  parseWorldDocument,
  validateWorldDocument,
  validateWorldIdentityBindings,
  type WorldDocument,
  type WorldValidationError
} from '../../shared/office/world-document'
import {
  browserWorldDocumentLock,
  readStoredWorld,
  subscribeWorldStorage,
  WORLD_DOCUMENT_STORAGE_KEY,
  type WorldDocumentLock,
  type WorldDocumentStorage
} from './world-document-storage'
import {
  saveWorldTransaction,
  type WorldSaveFailure,
  type WorldSaveResult,
  type WorldTransactionOptions
} from './world-document-transactions'

export { WORLD_DOCUMENT_STORAGE_KEY } from './world-document-storage'
export interface WorldDocumentStoreOptions {
  storage: WorldDocumentStorage | null
  lock?: WorldDocumentLock | null
  getLayout: () => LayoutMap
  getSessions: () => readonly SessionRef[]
  knownThemeIds?: readonly string[]
}
interface WorldDocumentState {
  document: WorldDocument
  draft: WorldDocument | null
  errors: WorldValidationError[]
  error: WorldSaveFailure | null
  unsaved: boolean
  revision: number
}
type WorldPreviewResult =
  | { success: true; document: WorldDocument }
  | { success: false; errors: WorldValidationError[] }
export interface WorldDocumentStore {
  get(): WorldDocumentState
  subscribe(listener: (state: WorldDocumentState) => void): () => void
  preview(draft: WorldDocument): WorldPreviewResult
  cancel(): void
  reconcile(): void
  save(draft: WorldDocument, expectedRevision: number): Promise<WorldSaveResult>
  undo(expectedRevision?: number): Promise<WorldSaveResult>
  dispose(): void
}
const UNDO_LIMIT = 20

export function createWorldDocumentStore(options: WorldDocumentStoreOptions): WorldDocumentStore {
  const transaction: WorldTransactionOptions = {
    ...options,
    lock: options.lock === undefined ? browserWorldDocumentLock() : options.lock
  }
  const stored = readStoredWorld(options.storage)
  let document: WorldDocument
  let initializationError: WorldSaveFailure | null = null
  if (stored.success && stored.document) document = stored.document
  else {
    try {
      document = createWorldDocument(options.getLayout(), options.getSessions())
    } catch {
      document = { version: 2, revision: 0, buildings: [], rooms: [], venues: [] }
      initializationError = 'live-validation'
    }
  }
  let state: WorldDocumentState = {
    document,
    draft: null,
    errors: [],
    error: initializationError ?? (stored.success ? null : stored.reason),
    unsaved: !stored.success || stored.document === null,
    revision: document.revision
  }
  let isDisposed = false
  const listeners = new Set<(state: WorldDocumentState) => void>()
  const history: { document: WorldDocument; savedRevision: number }[] = []
  const notify = (): void => {
    if (!isDisposed)
      for (const listener of listeners) {
        try {
          listener(structuredClone(state))
        } catch {
          console.error('world-document', { event: 'subscriber-failed' })
        }
      }
  }
  const validate = (draft: WorldDocument): WorldValidationError[] => [
    ...validateWorldIdentityBindings(state.document, draft),
    ...validateWorldDocument(draft, {
      layout: options.getLayout(),
      sessions: options.getSessions(),
      knownThemeIds: options.knownThemeIds
    })
  ]
  if (stored.success && stored.document) {
    try {
      const errors = validate(document)
      if (errors.length) state = { ...state, errors, error: 'invalid-draft', unsaved: true }
    } catch {
      state = { ...state, error: 'live-validation', unsaved: true }
    }
  }
  const failure = (reason: WorldSaveFailure): WorldSaveResult => ({
    success: false,
    reason,
    revision: state.revision,
    errors: []
  })
  const persist = async (
    draft: WorldDocument,
    expectedRevision: number,
    isUndo: boolean
  ): Promise<WorldSaveResult> => {
    if (isDisposed) return failure('disposed')
    const outcome = await saveWorldTransaction(transaction, {
      draft,
      expectedRevision,
      isDisposed: () => isDisposed,
      publish(committed, previous) {
        if (isUndo) {
          history.pop()
          const previousUndo = history.at(-1)
          if (previousUndo) previousUndo.savedRevision = committed.revision
        } else {
          history.push({ document: structuredClone(previous), savedRevision: committed.revision })
          if (history.length > UNDO_LIMIT) history.shift()
        }
        state = {
          document: structuredClone(committed),
          revision: committed.revision,
          draft: null,
          errors: [],
          error: null,
          unsaved: false
        }
        notify()
      }
    })
    if (!outcome.success && !isDisposed) {
      const parsed = parseWorldDocument(draft)
      if (outcome.document) {
        state.document = structuredClone(outcome.document)
        state.revision = outcome.revision
        history.length = 0
      }
      state = {
        ...state,
        draft: parsed.success ? parsed.document : null,
        errors: outcome.errors,
        error: outcome.reason,
        unsaved: true
      }
      notify()
    }
    return structuredClone(outcome)
  }
  const offStorage = subscribeWorldStorage(options.storage, (event) => {
    if (isDisposed || (event.key !== null && event.key !== WORLD_DOCUMENT_STORAGE_KEY)) return
    const latest = readStoredWorld(options.storage)
    if (!latest.success) {
      state = { ...state, error: latest.reason, unsaved: true }
      notify()
      return
    }
    if (!latest.document) {
      state = { ...state, error: 'conflict', unsaved: true }
      notify()
      return
    }
    const isSame = JSON.stringify(latest.document) === JSON.stringify(state.document)
    if (isSame || (latest.document.revision <= state.revision && !event.isAuthoritative)) return
    history.length = 0
    state = {
      ...state,
      document: latest.document,
      revision: latest.document.revision,
      error: state.draft ? 'conflict' : null,
      unsaved: state.draft !== null
    }
    try {
      const errors = validate(state.draft ?? state.document)
      state = {
        ...state,
        errors,
        error: state.draft ? 'conflict' : errors.length ? 'invalid-draft' : null,
        unsaved: state.draft !== null || errors.length > 0
      }
    } catch {
      state = { ...state, error: 'live-validation', unsaved: true }
    }
    notify()
  })
  return {
    get: () => structuredClone(state),
    subscribe(listener) {
      if (isDisposed) return () => undefined
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    preview(draft) {
      if (isDisposed)
        return { success: false, errors: [{ field: 'store', target: '', reason: 'invalid-shape' }] }
      const parsed = parseWorldDocument(draft)
      let errors = parsed.success ? [] : parsed.errors
      if (parsed.success) {
        try {
          errors = validate(parsed.document)
        } catch {
          state = { ...state, error: 'live-validation', unsaved: true }
          notify()
          return {
            success: false,
            errors: [{ field: 'source', target: '', reason: 'invalid-shape' }]
          }
        }
      }
      state = {
        ...state,
        draft: parsed.success ? parsed.document : null,
        errors,
        error: errors.length ? 'invalid-draft' : null,
        unsaved: true
      }
      notify()
      return parsed.success && !errors.length
        ? { success: true, document: structuredClone(parsed.document) }
        : { success: false, errors: structuredClone(errors) }
    },
    cancel() {
      if (isDisposed) return
      const latest = readStoredWorld(options.storage)
      state = {
        ...state,
        draft: null,
        errors: [],
        error: latest.success ? null : latest.reason,
        unsaved: !latest.success || latest.document === null
      }
      if (latest.success && latest.document && latest.document.revision >= state.revision) {
        state = { ...state, document: latest.document, revision: latest.document.revision }
        try {
          const errors = validate(state.document)
          state = {
            ...state,
            errors,
            error: errors.length ? 'invalid-draft' : null,
            unsaved: errors.length > 0
          }
        } catch {
          state = { ...state, error: 'live-validation', unsaved: true }
        }
      }
      notify()
    },
    reconcile() {
      if (isDisposed) return
      const defaults = createWorldDocument(options.getLayout(), options.getSessions())
      const merged = mergeActiveWorldDocument(defaults, state.document)
      const targets = new Set(state.document.rooms.map((room) => room.target))
      const buildingIds = new Set(state.document.buildings.map((building) => building.id))
      const buildings = [
        ...state.document.buildings,
        ...merged.buildings.filter((building) => !buildingIds.has(building.id))
      ]
      const occupied = buildings.map((building) => building.footprint)
      const venues = state.document.venues.length
        ? state.document.venues
        : defaults.venues.map((venue) => {
            const footprint = placeWorldFootprint({ footprint: venue.footprint, occupied })
            occupied.push(footprint)
            return { ...venue, footprint }
          })
      const next = {
        ...state.document,
        allocation: defaults.allocation,
        buildings,
        rooms: [
          ...state.document.rooms,
          ...merged.rooms.filter((room) => !targets.has(room.target))
        ],
        venues
      }
      if (JSON.stringify(next) === JSON.stringify(state.document)) return
      state = { ...state, document: next, unsaved: true }
      notify()
    },
    save: (draft, expectedRevision) => persist(draft, expectedRevision, false),
    undo(expectedRevision = state.revision) {
      if (isDisposed) return Promise.resolve(failure('disposed'))
      const previous = history.at(-1)
      if (!previous) return Promise.resolve(failure('nothing-to-undo'))
      if (previous.savedRevision !== expectedRevision) return Promise.resolve(failure('conflict'))
      return persist(
        {
          ...structuredClone(previous.document),
          allocation: structuredClone(state.document.allocation),
          revision: expectedRevision
        },
        expectedRevision,
        true
      )
    },
    dispose() {
      isDisposed = true
      offStorage()
      listeners.clear()
      history.length = 0
    }
  }
}
