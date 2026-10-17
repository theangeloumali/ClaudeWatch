import { describe, expect, it } from 'vitest'
import type { WorldDocument } from '../../../shared/office/world-document'
import type { WorldSaveReply } from '../../../shared/office/world-sync'
import { hostWorldStorage } from '../host-world-storage'
import { WORLD_DOCUMENT_STORAGE_KEY } from '../world-document-storage'

const city = (revision: number): WorldDocument => ({
  version: 2,
  revision,
  buildings: [],
  rooms: [],
  venues: []
})
const serialized = (revision: number): string => JSON.stringify(city(revision))
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))

// A host that answers saves only when the test says so, in any order.
function slowHost() {
  const replies: { resolve(reply: WorldSaveReply): void; reject(error: Error): void }[] = []
  const save = (): Promise<WorldSaveReply> =>
    new Promise((resolve, reject) => replies.push({ resolve, reject }))
  const reply = (index: number) => {
    const pending = replies[index]
    if (!pending) throw new Error(`no save ${index} was sent`)
    return pending
  }
  return { save, reply }
}

const lateFailures: [string, (host: ReturnType<typeof slowHost>) => void][] = [
  [
    'refused with an older city',
    (host) => host.reply(0).resolve({ success: false, reason: 'conflict', document: city(1) })
  ],
  ['unreachable', (host) => host.reply(0).reject(new Error('offline'))]
]

describe('a late failure of an older save does not replace a newer city', () => {
  it.each(lateFailures)('after a newer save landed (%s)', async (_label, fail) => {
    const host = slowHost()
    const storage = hostWorldStorage(null, host.save)
    storage.receive(city(1))
    storage.setItem(WORLD_DOCUMENT_STORAGE_KEY, serialized(2))
    storage.setItem(WORLD_DOCUMENT_STORAGE_KEY, serialized(3))
    host.reply(1).resolve({ success: true, document: city(3) })
    fail(host)
    await settle()
    expect(storage.getItem(WORLD_DOCUMENT_STORAGE_KEY)).toBe(serialized(3))
  })

  it.each(lateFailures)('after a newer hello (%s)', async (_label, fail) => {
    const host = slowHost()
    const storage = hostWorldStorage(null, host.save)
    storage.receive(city(1))
    storage.setItem(WORLD_DOCUMENT_STORAGE_KEY, serialized(2))
    storage.receive(city(5))
    fail(host)
    await settle()
    expect(storage.getItem(WORLD_DOCUMENT_STORAGE_KEY)).toBe(serialized(5))
  })
})
