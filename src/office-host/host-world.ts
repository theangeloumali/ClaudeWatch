import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FeedMessage, OfficeSnapshot } from '../shared/office/types'
import { parseWorldDocument, type WorldDocument } from '../shared/office/world-document'
import type { WorldSaveReply, WorldSnapshot } from '../shared/office/world-sync'
import { lockFile } from './file-lock'

// One saved city per host, on a file every process of this user shares, so the app window,
// the Browser Office and each standalone port show the same arrangement (health-13).
// Beside the standalone Office's launch files, so the app and every port find the same one.
export const SHARED_WORLD_PATH = join(
  homedir(),
  '.claude',
  'state',
  'office',
  'world-document.json'
)

export interface HostWorld {
  // Read from the file each time: another process may have saved since.
  current(): WorldDocument | null
  save(candidate: unknown): WorldSaveReply
  onChange(listener: (document: WorldDocument) => void): () => void
}

export function createHostWorld(path: string): HostWorld {
  const listeners = new Set<(document: WorldDocument) => void>()
  const current = (): WorldDocument | null => {
    try {
      const parsed = parseWorldDocument(JSON.parse(readFileSync(path, 'utf8')))
      return parsed.success ? parsed.document : null
    } catch {
      // Missing or unreadable: no city is saved, and the next save replaces the file.
      return null
    }
  }
  return {
    current,
    save(candidate) {
      const parsed = parseWorldDocument(candidate)
      if (!parsed.success)
        return { success: false, reason: 'invalid-document', document: current() }
      // Another host process may save the same file: its check and write go under one lock.
      const release = makeFolder(path) ? lockFile(`${path}.lock`) : null
      if (!release) return { success: false, reason: 'storage-write', document: current() }
      try {
        const reply = compareAndWrite(path, parsed.document, current())
        if (reply.success) for (const listener of listeners) listener(reply.document)
        return reply
      } finally {
        release()
      }
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function makeFolder(path: string): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true })
    return true
  } catch {
    return false
  }
}

// The first city comes from whichever page held one; after that, compare and swap.
function compareAndWrite(
  path: string,
  document: WorldDocument,
  saved: WorldDocument | null
): WorldSaveReply {
  if (saved && document.revision !== saved.revision + 1)
    return { success: false, reason: 'conflict', document: saved }
  try {
    const pending = `${path}.${process.pid}.tmp`
    writeFileSync(pending, JSON.stringify(document), { mode: 0o600 })
    renameSync(pending, path)
  } catch {
    return { success: false, reason: 'storage-write', document: saved }
  }
  return { success: true, document }
}

interface FeedHost {
  snapshot(): OfficeSnapshot | null
  onMessage(listener: (message: FeedMessage) => void): () => void
}

// The feed with the saved city in every hello, the bridge's own included: it sends the first
// one itself when a page starts it. A save sends every watcher a fresh hello.
export function withWorld(host: FeedHost, world: HostWorld): FeedHost {
  const withCity = (current: OfficeSnapshot): WorldSnapshot => ({
    ...current,
    world: world.current()
  })
  const snapshot = (): WorldSnapshot | null => {
    const current = host.snapshot()
    return current && withCity(current)
  }
  return {
    snapshot,
    onMessage(listener) {
      const offWorld = world.onChange(() => {
        const current = snapshot()
        if (current) listener({ type: 'hello', v: 1, snapshot: current })
      })
      const offFeed = host.onMessage((message) =>
        listener(
          message.type === 'hello' ? { ...message, snapshot: withCity(message.snapshot) } : message
        )
      )
      return () => {
        offWorld()
        offFeed()
      }
    }
  }
}
