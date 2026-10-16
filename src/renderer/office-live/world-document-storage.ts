import {
  parseWorldDocument,
  WORLD_DOCUMENT_LIMITS,
  type WorldDocument
} from '../../shared/office/world-document'

export const WORLD_DOCUMENT_STORAGE_KEY = 'claudewatch.office.world.v2'
const WORLD_DOCUMENT_LOCK_NAME = 'claudewatch.office.world.v2.writer'
export interface WorldStorageEvent {
  key: string | null
  newValue: string | null
  // From the host that owns the city: it replaces this page's even at an older revision.
  isAuthoritative?: boolean
}
export interface WorldDocumentStorage {
  getItem(key: string): string | null
  setItem(key: string, serialized: string): void
  subscribe?(listener: (event: WorldStorageEvent) => void): () => void
}
export interface WorldDocumentLock {
  runExclusive<T>(operation: () => T | Promise<T>): Promise<T>
}
export type WorldStorageFailure = 'storage-unavailable' | 'storage-read' | 'stored-document-invalid'
export type StoredWorldResult =
  | { success: true; document: WorldDocument | null }
  | { success: false; reason: WorldStorageFailure }

export function readStoredWorld(storage: WorldDocumentStorage | null): StoredWorldResult {
  if (!storage) return { success: false, reason: 'storage-unavailable' }
  let serialized: string | null
  try {
    serialized = storage.getItem(WORLD_DOCUMENT_STORAGE_KEY)
  } catch {
    return { success: false, reason: 'storage-read' }
  }
  if (serialized === null) return { success: true, document: null }
  if (new TextEncoder().encode(serialized).length > WORLD_DOCUMENT_LIMITS.bytes)
    return { success: false, reason: 'stored-document-invalid' }
  try {
    const parsed = parseWorldDocument(JSON.parse(serialized))
    return parsed.success
      ? { success: true, document: parsed.document }
      : { success: false, reason: 'stored-document-invalid' }
  } catch {
    return { success: false, reason: 'stored-document-invalid' }
  }
}

export function browserWorldDocumentLock(): WorldDocumentLock | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null
  const locks = navigator.locks
  return {
    async runExclusive(operation) {
      return await locks.request(WORLD_DOCUMENT_LOCK_NAME, { mode: 'exclusive' }, () => operation())
    }
  }
}

export function subscribeWorldStorage(
  storage: WorldDocumentStorage | null,
  listener: (event: WorldStorageEvent) => void
): () => void {
  if (storage?.subscribe) return storage.subscribe(listener)
  if (typeof window === 'undefined' || !storage) return () => undefined
  // Only native localStorage receives these events; injected stores must supply their own subscription.
  try {
    if (storage !== window.localStorage) return () => undefined
  } catch {
    return () => undefined
  }
  const onStorage = (event: StorageEvent): void => {
    if (event.storageArea === storage) listener({ key: event.key, newValue: event.newValue })
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
