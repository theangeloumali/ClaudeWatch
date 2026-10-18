import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { session } from '../office/sim/fixtures'
import { buildLayout } from '../office/sim/layout'
import { createWorldDocument, type WorldDocument } from '../shared/office/world-document'
import type { FeedMessage, OfficeSnapshot } from '../shared/office/types'
import { createHostWorld, type HostWorld } from './host-world'
import { createOfficeService } from './office-service'

const sessions = [session('claude:a')]
const city = (revision: number): WorldDocument => ({
  ...createWorldDocument(buildLayout(sessions, undefined), sessions),
  revision
})
const snapshot: OfficeSnapshot = { rev: 3, generatedAtMs: 1, sessions, sources: [] }

function serviceOn(world: HostWorld | undefined, isInteractive = true) {
  return createOfficeService({
    host: { snapshot: () => snapshot, onMessage: () => () => undefined },
    run: vi.fn(),
    terminalOf: async () => undefined,
    isInteractive,
    world
  })
}

describe('the office service serves one saved city (health-13)', () => {
  let folder: string
  let world: HostWorld
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'service-world-'))
    world = createHostWorld(join(folder, 'world-document.json'))
  })
  afterEach(() => rmSync(folder, { recursive: true, force: true }))

  it('sends the saved city in every hello', () => {
    world.save(city(1))
    const messages: FeedMessage[] = []
    serviceOn(world).subscribe((message) => messages.push(message))
    expect(messages).toEqual([{ type: 'hello', v: 1, snapshot: { ...snapshot, world: city(1) } }])
  })

  it('sends a fresh hello to every watcher when a page saves', async () => {
    const watcher: FeedMessage[] = []
    const viewer = serviceOn(world, false)
    viewer.subscribe((message) => watcher.push(message))
    expect(await serviceOn(world).saveWorld(city(1))).toMatchObject({ success: true })
    expect(watcher.at(-1)).toEqual({
      type: 'hello',
      v: 1,
      snapshot: { ...snapshot, world: city(1) }
    })
  })

  it('refuses a save from a view-only page and keeps the saved city', async () => {
    world.save(city(1))
    expect(await serviceOn(world, false).saveWorld(city(2))).toEqual({
      success: false,
      reason: 'not-permitted',
      document: city(1)
    })
    expect(world.current()).toEqual(city(1))
  })

  it('adds the city to a hello the bridge sends itself, as it does when the first page starts it', () => {
    world.save(city(1))
    let bridgeSays: (message: FeedMessage) => void = () => undefined
    const service = createOfficeService({
      host: { snapshot: () => null, onMessage: (listener) => ((bridgeSays = listener), () => {}) },
      run: vi.fn(),
      terminalOf: async () => undefined,
      isInteractive: false,
      world
    })
    const messages: FeedMessage[] = []
    service.subscribe((message) => messages.push(message))
    bridgeSays({ type: 'hello', v: 1, snapshot })
    bridgeSays({ type: 'resync' })
    expect(messages).toEqual([
      { type: 'hello', v: 1, snapshot: { ...snapshot, world: city(1) } },
      { type: 'resync' }
    ])
  })

  it('adds no city to the hello of a service with no host world', () => {
    const messages: FeedMessage[] = []
    serviceOn(undefined).subscribe((message) => messages.push(message))
    expect(messages).toEqual([{ type: 'hello', v: 1, snapshot }])
  })
})
