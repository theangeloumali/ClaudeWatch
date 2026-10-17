import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCityEventLog } from './city-events'
import { createLiveFeed, type FeedSource } from './live-feed'
import type { FeedMessage, SessionRef } from '../../shared/office/types'
import { createOfficeSettingsStore } from '../office/logic/office-settings'
import type { OfficeFrame } from '../office/scene-model'

const session = (key: string): SessionRef => ({
  key,
  provider: 'claude',
  sessionId: key,
  pid: 1,
  name: 'app',
  cwd: '/repo/app',
  projectKey: 'p_app',
  projectLabel: 'app',
  projectRoot: '/repo/app',
  companyKey: 'c_test',
  companyLabel: 'Test Co',
  worktree: null,
  host: 'terminal',
  orcaPaneKey: null,
  activity: 'editing',
  attention: 'none',
  currentTool: { name: 'Edit', category: 'edit' },
  subagents: [],
  startedAtMs: 1,
  updatedAtMs: 1
})

describe('createLiveFeed', () => {
  let listener: ((message: FeedMessage) => void) | null
  let source: FeedSource
  const storage = new Map<string, string>()
  const store = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    storage.clear()
    listener = null
    source = {
      ready: vi.fn().mockResolvedValue(undefined),
      onFeedMessage: vi.fn((next: (message: FeedMessage) => void) => {
        listener = next
        return () => {
          listener = null
        }
      }),
      focus: vi.fn().mockResolvedValue({ success: true, target: 'pane' }),
      send: vi.fn().mockResolvedValue({ success: true }),
      respond: vi.fn().mockResolvedValue({ success: true }),
      peek: vi.fn().mockResolvedValue({ success: true, lines: ['ok'] }),
      start: vi.fn().mockResolvedValue({ success: true })
    }
  })

  afterEach(() => vi.useRealTimers())

  it('asks for state once subscribed and emits frames with floors, agents and sessions', () => {
    const frames: OfficeFrame[] = []
    createLiveFeed(source, { storage: store }).subscribe((frame) => frames.push(frame))
    listener?.({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1, sessions: [session('claude:a')], sources: [] }
    })
    vi.advanceTimersByTime(300)

    expect(source.ready).toHaveBeenCalledOnce()
    const last = frames.at(-1)!
    expect(last.floors.map((f) => f.label)).toEqual(['app · Floor 1'])
    expect(last.sessions.map((s) => s.key)).toEqual(['claude:a'])
    expect(last.agents.map((a) => a.agentKey)).toEqual(['claude:a'])
  })

  it.each([
    [
      'storage that refuses every write',
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('site data is blocked')
        }
      }
    ],
    ['no storage at all', null]
  ])('keeps the feed running with %s: the layout is simply not remembered', (_name, blocked) => {
    const frames: OfficeFrame[] = []
    createLiveFeed(source, { storage: blocked }).subscribe((frame) => frames.push(frame))
    const hello = (): void =>
      listener?.({
        type: 'hello',
        v: 1,
        snapshot: { rev: 1, generatedAtMs: 1, sessions: [session('claude:a')], sources: [] }
      })
    expect(hello).not.toThrow()
    vi.advanceTimersByTime(300)
    expect(frames.at(-1)?.agents.map((agent) => agent.agentKey)).toEqual(['claude:a'])
  })

  it('stops ticking and unsubscribes from the bridge when the last listener leaves', () => {
    const frames: OfficeFrame[] = []
    const unsubscribe = createLiveFeed(source, { storage: store }).subscribe((frame) =>
      frames.push(frame)
    )
    unsubscribe()
    const count = frames.length
    vi.advanceTimersByTime(1_000)

    expect(frames).toHaveLength(count)
    expect(listener).toBeNull()
  })

  it('reports not connected until the first hello, then the bridge source health', () => {
    const frames: OfficeFrame[] = []
    createLiveFeed(source, { storage: store }).subscribe((frame) => frames.push(frame))
    vi.advanceTimersByTime(200)
    expect(frames.at(-1)).toMatchObject({ connected: false, sources: [] })
    const sources = [{ id: 'orca', ok: false, detail: 'Orca not running' }]
    listener?.({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1, sessions: [], sources }
    })
    vi.advanceTimersByTime(200)
    expect(frames.at(-1)).toMatchObject({ connected: true, sources })
  })

  it('carries the snapshot’s account labels to the frame', () => {
    const frames: OfficeFrame[] = []
    createLiveFeed(source, { storage: store }).subscribe((frame) => frames.push(frame))
    const accounts = [
      { key: 'acct_1', provider: 'claude' as const, label: 'Work', plan: 'Max', isActive: true }
    ]
    listener?.({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1, sessions: [], sources: [], accounts }
    })
    vi.advanceTimersByTime(200)
    expect(frames.at(-1)?.accounts).toEqual(accounts)
  })

  it('carries today’s totals per project to the frame, and keeps them across a patch without them', () => {
    const frames: OfficeFrame[] = []
    createLiveFeed(source, { storage: store }).subscribe((frame) => frames.push(frame))
    const projectsToday = [{ projectKey: 'p_app', tokens: 2_000_000 }]
    listener?.({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1, sessions: [], sources: [], projectsToday }
    })
    vi.advanceTimersByTime(200)
    expect(frames.at(-1)?.projectsToday).toEqual(projectsToday)
    listener?.({ type: 'patch', v: 1, seq: 2, upserts: [session('claude:a')], removed: [] })
    vi.advanceTimersByTime(200)
    expect(frames.at(-1)?.projectsToday).toEqual(projectsToday)
  })

  it('tells the city event log of every feed message, stamped with the render clock', () => {
    const events = createCityEventLog()
    const observe = vi.spyOn(events, 'observe')
    createLiveFeed(source, { storage: store, events }).subscribe(() => undefined)
    const fresh = (attention: SessionRef['attention']): SessionRef => ({
      ...session('claude:a'),
      attention,
      updatedAtMs: Date.now(),
      observation: {
        sourceId: 'claude',
        observedAtMs: Date.now(),
        staleAfterMs: 60_000,
        coverage: 'own'
      }
    })
    const projectsToday = [{ projectKey: 'p_app', tokens: 5 }]
    listener?.({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1, sessions: [fresh('none')], sources: [], projectsToday }
    })
    listener?.({ type: 'patch', v: 1, seq: 2, upserts: [fresh('done')], removed: [] })
    listener?.({ type: 'patch', v: 1, seq: 2, upserts: [fresh('none')], removed: [] })
    listener?.({ type: 'resync' })
    expect(observe.mock.calls.map(([type, , atMs, today]) => [type, atMs, today])).toEqual([
      ['hello', Date.now(), projectsToday],
      ['patch', Date.now(), projectsToday],
      ['resync', Date.now(), undefined]
    ])
    expect(events.active(Date.now()).map((event) => event.kind)).toEqual(['done'])
  })

  it('emits only when the frame changed, not on every tick', () => {
    const frames: OfficeFrame[] = []
    createLiveFeed(source, { storage: store }).subscribe((frame) => frames.push(frame))
    listener?.({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1, sessions: [session('claude:a')], sources: [] }
    })
    // Robots walk from the arrival gate across the floor first; give them time to sit down.
    vi.advanceTimersByTime(300_000)
    const settled = frames.length
    vi.advanceTimersByTime(5_000)
    expect(frames).toHaveLength(settled)
  })

  it('hands the scene the same floors until the floor itself changes', () => {
    const frames: OfficeFrame[] = []
    createLiveFeed(source, { storage: store }).subscribe((frame) => frames.push(frame))
    listener?.({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1, sessions: [session('claude:a')], sources: [] }
    })
    vi.advanceTimersByTime(300)
    const before = frames.at(-1)!.floors

    // Activity only: nothing about the floor moved, so the scene must not rebuild its world.
    listener?.({
      type: 'patch',
      v: 1,
      seq: 2,
      upserts: [{ ...session('claude:a'), activity: 'editing' }],
      removed: []
    })
    vi.advanceTimersByTime(300)
    expect(frames.at(-1)!.sessions[0].activity).toBe('editing')
    expect(frames.at(-1)!.floors).toBe(before)

    listener?.({ type: 'patch', v: 1, seq: 3, upserts: [session('claude:b')], removed: [] })
    vi.advanceTimersByTime(300)
    expect(frames.at(-1)!.floors).not.toBe(before)
  })

  describe('a saved layout read back from storage', () => {
    const LAYOUT_KEY = 'claudewatch.office.layout'
    // The reverse of the bays a fresh layout gives, so reading it back shows.
    const reservations = {
      'claude:a': { floorId: 'hq', plate: 0, bay: 1, companyKey: 'c_test', projectKey: 'p_app' },
      'claude:b': { floorId: 'hq', plate: 0, bay: 0, companyKey: 'c_test', projectKey: 'p_app' }
    }
    const frames: OfficeFrame[] = []
    const openWith = (saved: unknown): (() => void) => {
      storage.set(LAYOUT_KEY, JSON.stringify(saved))
      frames.length = 0
      createLiveFeed(source, { storage: store }).subscribe((frame) => frames.push(frame))
      return () => {
        listener?.({
          type: 'hello',
          v: 1,
          snapshot: {
            rev: 1,
            generatedAtMs: 1,
            sessions: [session('claude:a'), session('claude:b')],
            sources: []
          }
        })
        vi.advanceTimersByTime(300)
        expect(frames.at(-1)?.agents.map((agent) => agent.agentKey)).toEqual([
          'claude:a',
          'claude:b'
        ])
      }
    }
    // The bay ends the room id an agent sits in.
    const bayOfA = (): number =>
      Number(
        frames
          .at(-1)
          ?.agents.find((agent) => agent.agentKey === 'claude:a')
          ?.roomId?.split(':')
          .at(-1)
      )

    it('is still used when it is well formed', () => {
      const hello = openWith({ version: 1, floors: [], reservations })
      expect(hello).not.toThrow()
      expect(bayOfA()).toBe(1)
    })

    it.each([
      ['a null zone', { version: 1, floors: [{ rooms: [], zones: [null] }], reservations }],
      ['no floors', { version: 1, reservations }],
      ['a floor without rooms', { version: 1, floors: [{ zones: [] }], reservations }],
      ['zones not an array', { version: 1, floors: [{ rooms: [], zones: {} }], reservations }],
      [
        'a null project in a zone',
        {
          version: 1,
          floors: [{ rooms: [], zones: [{ id: 'company:c_test', children: [null] }] }],
          reservations
        }
      ],
      ['reservations not an object', { version: 1, floors: [], reservations: 'bays' }],
      ['a non-object', 7]
    ])('starts a fresh layout from %s and places every agent', (_name, saved) => {
      const hello = openWith(saved)
      expect(hello).not.toThrow()
      expect(bayOfA()).toBe(0)
    })
  })

  describe('lounge trips', () => {
    const LOUNGE_MS = 200_000
    const helloDone = (): void =>
      listener?.({
        type: 'hello',
        v: 1,
        snapshot: {
          rev: 1,
          generatedAtMs: 1,
          sessions: [{ ...session('claude:a'), attention: 'done' }],
          sources: []
        }
      })
    const place = (frames: OfficeFrame[]): string | undefined => frames.at(-1)?.agents[0].place

    it('keeps a finished agent at its desk while the setting is off', () => {
      const settings = createOfficeSettingsStore(null)
      settings.set('loungeTrips', false)
      const frames: OfficeFrame[] = []
      createLiveFeed(source, { storage: store, settings }).subscribe((frame) => frames.push(frame))
      helloDone()
      vi.advanceTimersByTime(LOUNGE_MS)
      expect(place(frames)).toBeUndefined()
    })

    it('follows the setting on a running office, both ways', () => {
      const settings = createOfficeSettingsStore(null)
      const frames: OfficeFrame[] = []
      const unsubscribe = createLiveFeed(source, { storage: store, settings }).subscribe((frame) =>
        frames.push(frame)
      )
      helloDone()
      vi.advanceTimersByTime(LOUNGE_MS)
      expect(place(frames)).toBe('lounge')

      settings.set('loungeTrips', false)
      vi.advanceTimersByTime(200)
      expect(place(frames)).toBeUndefined()

      settings.set('loungeTrips', true)
      // Re-enabling cannot interrupt the physical walk back to the desk.
      vi.advanceTimersByTime(LOUNGE_MS)
      expect(place(frames)).toBe('lounge')

      // A stopped feed no longer listens for the setting.
      unsubscribe()
      const count = frames.length
      settings.set('loungeTrips', false)
      vi.advanceTimersByTime(1_000)
      expect(frames).toHaveLength(count)
    })
  })

  it('forwards a focus request to the bridge and returns where it landed', async () => {
    const landed = await createLiveFeed(source, { storage: store }).focus('claude:a#lena')
    expect(source.focus).toHaveBeenCalledWith('claude:a#lena')
    expect(landed).toEqual({ success: true, target: 'pane' })
  })

  it('forwards talk, respond, peek and start to the bridge and returns its answer', async () => {
    const feed = createLiveFeed(source, { storage: store })
    expect(await feed.send('claude:a', 'hi')).toEqual({ success: true })
    expect(await feed.respond('claude:a', 'deny', 'fp')).toEqual({ success: true })
    expect(await feed.peek('claude:a')).toEqual({ success: true, lines: ['ok'] })
    expect(await feed.start('p_app', 'codex')).toEqual({ success: true })
    expect(source.send).toHaveBeenCalledWith('claude:a', 'hi')
    expect(source.respond).toHaveBeenCalledWith('claude:a', 'deny', 'fp')
    expect(source.start).toHaveBeenCalledWith('p_app', 'codex')
  })
})
