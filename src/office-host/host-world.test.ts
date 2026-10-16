import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLayout } from '../office/sim/layout'
import { session } from '../office/sim/fixtures'
import { createWorldDocument, type WorldDocument } from '../shared/office/world-document'
import { createHostWorld } from './host-world'

const sessions = [session('claude:a')]
const city = (revision: number): WorldDocument => ({
  ...createWorldDocument(buildLayout(sessions, undefined), sessions),
  revision
})

describe('createHostWorld (health-13)', () => {
  let folder: string
  let path: string
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'host-world-'))
    path = join(folder, 'office', 'world-document.json')
  })
  afterEach(() => rmSync(folder, { recursive: true, force: true }))

  it('has no saved city until one is saved', () => {
    expect(createHostWorld(path).current()).toBeNull()
  })

  it('shares a saved city with every store on the same file', () => {
    expect(createHostWorld(path).save(city(1))).toMatchObject({ success: true })
    expect(createHostWorld(path).current()).toEqual(city(1))
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('takes the first city from any revision, then only the next revision', () => {
    const world = createHostWorld(path)
    expect(world.save(city(7))).toMatchObject({ success: true })
    expect(world.save(city(7))).toEqual({ success: false, reason: 'conflict', document: city(7) })
    expect(world.save(city(9))).toMatchObject({ success: false, reason: 'conflict' })
    expect(world.save(city(8))).toMatchObject({ success: true })
  })

  it('refuses what is not a world document and keeps the saved one', () => {
    const world = createHostWorld(path)
    world.save(city(1))
    expect(world.save({ version: 2, revision: 2, buildings: 'many' })).toMatchObject({
      success: false,
      reason: 'invalid-document'
    })
    expect(world.current()).toEqual(city(1))
  })

  it('reads an unreadable file as no saved city, so the next save replaces it', () => {
    const world = createHostWorld(path)
    world.save(city(1))
    writeFileSync(path, '{ not json')
    expect(world.current()).toBeNull()
    expect(world.save(city(4))).toMatchObject({ success: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(city(4))
  })

  it('tells its listeners about each save it makes', () => {
    const world = createHostWorld(path)
    const listener = vi.fn()
    const stop = world.onChange(listener)
    world.save(city(1))
    world.save(city(1))
    stop()
    world.save(city(2))
    expect(listener.mock.calls).toEqual([[city(1)]])
  })
})
