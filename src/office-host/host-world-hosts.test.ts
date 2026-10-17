import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLayout } from '../office/sim/layout'
import { session } from '../office/sim/fixtures'
import { createWorldDocument, type WorldDocument } from '../shared/office/world-document'
import type { WorldSaveReply } from '../shared/office/world-sync'
import type { OfficeSnapshot } from '../shared/office/types'
import { createHostWorld, withWorld } from './host-world'

// Lets a test run another host's whole save between this host's read and its write.
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return { ...fs, readFileSync: vi.fn(fs.readFileSync) }
})

const sessions = [session('claude:a')]
const city = (revision: number, displayName = 'Town'): WorldDocument => {
  const document = createWorldDocument(buildLayout(sessions, undefined), sessions)
  return {
    ...document,
    revision,
    buildings: document.buildings.map((building) => ({ ...building, displayName }))
  }
}

describe('two host processes on one saved city', () => {
  let folder: string
  let path: string
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'host-world-hosts-'))
    path = join(folder, 'office', 'world-document.json')
  })
  afterEach(() => rmSync(folder, { recursive: true, force: true }))

  it('two hosts saving the same revision: exactly one wins', async () => {
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
    const app = createHostWorld(path)
    const web = createHostWorld(path)
    expect(app.save(city(1))).toMatchObject({ success: true })
    let webReply: WorldSaveReply | null = null
    vi.mocked(readFileSync).mockImplementationOnce((...args: Parameters<typeof readFileSync>) => {
      const read = fs.readFileSync(...args)
      webReply = web.save(city(2, 'From the browser'))
      return read
    })
    const appReply = app.save(city(2, 'From the app'))

    const winners = [appReply, webReply].filter((reply) => reply?.success)
    expect(winners).toHaveLength(1)
    expect(app.current()).toEqual(winners[0]?.document)
  })

  it('gives up on a lock another host holds: the save fails and the city stays', () => {
    const world = createHostWorld(path)
    world.save(city(1))
    writeFileSync(`${path}.lock`, '')
    expect(world.save(city(2))).toEqual({
      success: false,
      reason: 'storage-write',
      document: city(1)
    })
  })

  it('takes over a lock left by a host that died holding it', () => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(`${path}.lock`, '')
    const longAgo = new Date(Date.now() - 60_000)
    utimesSync(`${path}.lock`, longAgo, longAgo)
    const world = createHostWorld(path)
    expect(world.save(city(1))).toMatchObject({ success: true })
    expect(world.save(city(2))).toMatchObject({ success: true })
  })

  it('a save by another host reaches this host’s pages', async () => {
    const snapshot: OfficeSnapshot = { rev: 1, generatedAtMs: 1, sessions, sources: [] }
    const app = createHostWorld(path)
    const web = createHostWorld(path)
    const pages = vi.fn()
    const stop = withWorld({ snapshot: () => snapshot, onMessage: () => () => {} }, app).onMessage(
      pages
    )
    web.save(city(1, 'From the browser'))
    await vi.waitFor(() =>
      expect(pages).toHaveBeenCalledWith({
        type: 'hello',
        v: 1,
        snapshot: { ...snapshot, world: city(1, 'From the browser') }
      })
    )
    stop()
  })

  it('tells its pages of its own save once, not again when the file changes', async () => {
    const app = createHostWorld(path)
    const heard = vi.fn()
    const stop = app.onChange(heard)
    app.save(city(1))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(heard).toHaveBeenCalledExactlyOnceWith(city(1))
    stop()
  })
})
