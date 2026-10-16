import type { WorldDocument } from '../../shared/office/world-document'
import type { WorldSaveReply } from '../../shared/office/world-sync'
import {
  WORLD_DOCUMENT_STORAGE_KEY,
  type WorldDocumentStorage,
  type WorldStorageEvent
} from './world-document-storage'

export interface HostWorldStorage extends WorldDocumentStorage {
  // The city the host holds, from its hello; null when it holds none yet.
  receive(document: WorldDocument | null): void
}

// The page's storage as a cache of the host's city (health-13): a save goes to both, and what the
// host holds replaces the cache. The world store's own compare-and-swap still runs on the cache.
export function hostWorldStorage(
  cache: WorldDocumentStorage | null,
  save: (document: unknown) => Promise<WorldSaveReply>
): HostWorldStorage {
  const listeners = new Set<(event: WorldStorageEvent) => void>()
  let held = readCache(cache)
  // What the host last said it holds; undefined until its first hello.
  let hostHeld: string | null | undefined

  const hold = (serialized: string): void => {
    held = serialized
    try {
      cache?.setItem(WORLD_DOCUMENT_STORAGE_KEY, serialized)
    } catch {
      // Not cached; the host still has it.
    }
  }
  // The host is the source of truth, so its city replaces this page's even when older.
  const adopt = (serialized: string | null): void => {
    if (serialized === held) return
    if (serialized === null) held = null
    else hold(serialized)
    for (const listener of listeners)
      listener({ key: WORLD_DOCUMENT_STORAGE_KEY, newValue: serialized, isAuthoritative: true })
  }
  // A refused save goes back to the host's city, or to what this page held before it.
  const upload = (serialized: string, before: string | null): void => {
    void save(JSON.parse(serialized)).then(
      (reply) => {
        const kept = reply.document ? JSON.stringify(reply.document) : null
        if (reply.success) hostHeld = kept
        else adopt(kept ?? before)
      },
      // Unreachable host: the next hello brings what it holds.
      () => undefined
    )
  }

  return {
    getItem: (key) => (key === WORLD_DOCUMENT_STORAGE_KEY ? held : (cache?.getItem(key) ?? null)),
    setItem(key, serialized) {
      if (key === WORLD_DOCUMENT_STORAGE_KEY) {
        const before = held
        hold(serialized)
        upload(serialized, before)
      } else cache?.setItem(key, serialized)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    receive(document) {
      hostHeld = document ? JSON.stringify(document) : null
      if (hostHeld) adopt(hostHeld)
      // A city this page kept before its host held one becomes the host's first.
      else if (held) upload(held, held)
    }
  }
}

function readCache(cache: WorldDocumentStorage | null): string | null {
  try {
    return cache?.getItem(WORLD_DOCUMENT_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}
