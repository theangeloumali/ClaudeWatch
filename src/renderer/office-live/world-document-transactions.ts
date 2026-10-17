import type { LayoutMap } from '../../office/sim/layout'
import type { SessionRef } from '../../shared/office/types'
import {
  createWorldDocument,
  parseWorldDocument,
  validateWorldDocument,
  validateWorldIdentityBindings,
  type WorldDocument,
  type WorldValidationError
} from '../../shared/office/world-document'
import type { WorldSaveRefusal } from '../../shared/office/world-sync'
import {
  readStoredWorld,
  WORLD_DOCUMENT_STORAGE_KEY,
  type WorldDocumentLock,
  type WorldDocumentStorage,
  type WorldStorageFailure
} from './world-document-storage'

export type WorldSaveFailure =
  | WorldStorageFailure
  | WorldSaveRefusal
  | 'lock-unavailable'
  | 'lock-failed'
  | 'conflict'
  | 'revision-mismatch'
  | 'invalid-draft'
  | 'live-validation'
  | 'storage-write'
  | 'storage-readback'
  | 'nothing-to-undo'
  | 'disposed'
export type WorldSaveResult =
  | { success: true; document: WorldDocument; revision: number }
  | {
      success: false
      reason: WorldSaveFailure
      revision: number
      errors: WorldValidationError[]
      document?: WorldDocument
    }
export interface WorldTransactionOptions {
  storage: WorldDocumentStorage | null
  lock: WorldDocumentLock | null
  getLayout: () => LayoutMap
  getSessions: () => readonly SessionRef[]
  knownThemeIds?: readonly string[]
}
export interface WorldTransactionRequest {
  draft: WorldDocument
  expectedRevision: number
}
export interface WorldTransactionHooks {
  publish: (document: WorldDocument, previous: WorldDocument) => void
  isDisposed: () => boolean
}

// dry-new: the legacy layout writer has no compare-and-swap or cross-window lock.
export async function saveWorldTransaction(
  options: WorldTransactionOptions,
  request: WorldTransactionRequest & WorldTransactionHooks
): Promise<WorldSaveResult> {
  const failed = (
    reason: WorldSaveFailure,
    revision = request.expectedRevision,
    errors: WorldValidationError[] = []
  ): WorldSaveResult => ({ success: false, reason, revision, errors })
  if (!options.lock) return failed('lock-unavailable')
  if (!options.storage) return failed('storage-unavailable')
  const storage = options.storage
  // Snapshot before awaiting the lock so a caller cannot alter the queued transaction.
  const parsed = parseWorldDocument(request.draft)
  if (!parsed.success) return failed('invalid-draft', request.expectedRevision, parsed.errors)
  let outcome: WorldSaveResult
  // The city before this save: what a refusal goes back to when the storage holds none.
  let before: WorldDocument | null = null
  try {
    outcome = await options.lock.runExclusive((): WorldSaveResult => {
      if (request.isDisposed()) return failed('disposed')
      const latest = readStoredWorld(storage)
      if (!latest.success) return failed(latest.reason)
      const revision = latest.document?.revision ?? 0
      if (revision !== request.expectedRevision)
        return {
          success: false,
          reason: 'conflict',
          revision,
          errors: [],
          ...(latest.document ? { document: latest.document } : {})
        }
      if (parsed.document.revision !== request.expectedRevision)
        return failed('revision-mismatch', revision)
      let layout: LayoutMap
      let sessions: readonly SessionRef[]
      let errors: WorldValidationError[]
      try {
        layout = options.getLayout()
        sessions = options.getSessions()
        errors = [
          ...validateWorldIdentityBindings(latest.document, parsed.document),
          ...validateWorldDocument(parsed.document, {
            layout,
            sessions,
            knownThemeIds: options.knownThemeIds
          })
        ]
      } catch {
        return failed('live-validation', revision)
      }
      if (errors.length) return failed('invalid-draft', revision, errors)
      const previous = latest.document ?? createWorldDocument(layout, sessions)
      const document = { ...parsed.document, revision: revision + 1 }
      const encoded = parseWorldDocument(document)
      if (!encoded.success) return failed('invalid-draft', revision, encoded.errors)
      const serialized = JSON.stringify(encoded.document)
      if (request.isDisposed()) return failed('disposed', revision)
      try {
        storage.setItem(WORLD_DOCUMENT_STORAGE_KEY, serialized)
      } catch {
        return failed('storage-write', revision)
      }
      try {
        if (storage.getItem(WORLD_DOCUMENT_STORAGE_KEY) !== serialized)
          return failed('storage-readback', revision)
      } catch {
        return failed('storage-readback', revision)
      }
      before = previous
      request.publish(encoded.document, previous)
      return { success: true, document: encoded.document, revision: encoded.document.revision }
    })
  } catch {
    return failed('lock-failed')
  }
  return outcome.success ? await landed(storage, outcome, before) : outcome
}

// A write the storage passes on can still be refused there; the refusal is the outcome, with
// the city the storage went back to.
async function landed(
  storage: WorldDocumentStorage,
  outcome: WorldSaveResult,
  before: WorldDocument | null
): Promise<WorldSaveResult> {
  const refusal = await storage.confirm?.()
  if (!refusal) return outcome
  const held = readStoredWorld(storage)
  const document = (held.success ? held.document : null) ?? before
  return {
    success: false,
    reason: refusal,
    revision: document?.revision ?? 0,
    errors: [],
    ...(document ? { document } : {})
  }
}
