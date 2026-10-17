import type { WorldDocument } from '../../shared/office/world-document'
import type { WorldSaveRefusal, WorldSaveReply } from '../../shared/office/world-sync'
import {
  readStoredWorld,
  WORLD_DOCUMENT_STORAGE_KEY,
  type WorldDocumentStorage,
  type WorldStorageEvent
} from './world-document-storage'

export interface HostWorldStorage extends WorldDocumentStorage {
  // The city the host holds, from its hello; null when it holds none yet.
  receive(document: WorldDocument | null): void
}

// A page's own copy, from before its host kept the city; read once, then removed.
type LegacyWorldStorage = Pick<WorldDocumentStorage, 'getItem' | 'setItem'> & {
  removeItem?(key: string): void
}

// The host's city, held in memory (health-13): the host is the source of truth, so nothing lands
// in the page's storage, a fixed-origin store any page there could read.
export function hostWorldStorage(
  legacy: LegacyWorldStorage | null,
  save: (document: unknown) => Promise<WorldSaveReply>
): HostWorldStorage {
  const listeners = new Set<(event: WorldStorageEvent) => void>()
  let held = readLegacy(legacy)
  // How the last save this page made ended at the host.
  let landing: Promise<WorldSaveRefusal | null> = Promise.resolve(null)
  // What the host last said it holds; undefined until its first hello.
  let hostHeld: string | null | undefined

  // Once the host holds a city, the page's old copy has nothing left to hand over.
  const forgetLegacy = (): void => {
    try {
      legacy?.removeItem?.(WORLD_DOCUMENT_STORAGE_KEY)
    } catch {
      // Left in place; it is never read again on a host-backed page.
    }
  }
  // The host is the source of truth, so its city replaces this page's even when older.
  const adopt = (serialized: string | null): void => {
    if (serialized === held) return
    held = serialized
    for (const listener of listeners)
      listener({ key: WORLD_DOCUMENT_STORAGE_KEY, newValue: serialized, isAuthoritative: true })
  }
  // A refused save goes back to the host's city, or to what this page held before it.
  const upload = (serialized: string, before: string | null): Promise<WorldSaveRefusal | null> =>
    save(JSON.parse(serialized)).then(
      (reply) => {
        const kept = reply.document ? JSON.stringify(reply.document) : null
        if (reply.success) {
          hostHeld = kept
          forgetLegacy()
        } else adopt(kept ?? before)
        return reply.success ? null : reply.reason
      },
      // Unreachable host: it holds no such city, and the next hello brings what it does hold.
      () => {
        adopt(before)
        return 'storage-write'
      }
    )

  return {
    getItem: (key) => (key === WORLD_DOCUMENT_STORAGE_KEY ? held : null),
    setItem(key, serialized) {
      if (key !== WORLD_DOCUMENT_STORAGE_KEY) return
      const before = held
      held = serialized
      landing = upload(serialized, before)
    },
    confirm: () => landing,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    receive(document) {
      hostHeld = document ? JSON.stringify(document) : null
      if (hostHeld) {
        adopt(hostHeld)
        forgetLegacy()
      }
      // A city this page kept before its host held one becomes the host's first.
      else if (held) void upload(held, held)
    }
  }
}

// A corrupt or foreign copy is dropped here, so it never reaches the host.
function readLegacy(legacy: LegacyWorldStorage | null): string | null {
  const stored = readStoredWorld(legacy)
  return stored.success && stored.document ? JSON.stringify(stored.document) : null
}
