import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { session } from '../../../office/sim/fixtures'
import { LOUNGE_DELAY_MS } from '../../../office/sim/behaviour'
import type { AgentView, FeedMessage, SessionRef, SourceHealth } from '../../../shared/office/types'
import { createOfficeSettingsStore } from '../../office/logic/office-settings'
import type { PageVisibility } from '../../office/logic/frame-governor'
import type { OfficeFrame } from '../../office/scene-model'
import { createLiveFeed, type FeedSource } from '../live-feed'
import { createPoseStore, officePoses, poseOf, structuralKey, withLivePose } from '../pose-store'

const agent = (overrides: Partial<AgentView> = {}): AgentView => ({
  agentKey: 'claude:a',
  floorId: 'hq',
  roomId: 'room-a',
  slotId: 'desk_main',
  x: 1,
  z: 2,
  heading: 0,
  activity: 'editing',
  attention: 'none',
  provider: 'claude',
  isSubagent: false,
  label: 'app',
  ...overrides
})

describe('createPoseStore', () => {
  it('reads back the last pose written for an agent', () => {
    const poses = createPoseStore()
    poses.write('claude:a', { x: 1, z: 2, heading: 0.5, elevation: 0 })
    poses.write('claude:a', { x: 3, z: 4, heading: 1, elevation: 5.5 })
    expect(poses.read('claude:a')).toEqual({ x: 3, z: 4, heading: 1, elevation: 5.5 })
    expect(poses.read('claude:b')).toBeUndefined()
  })

  it('counts a version only when a pose moves', () => {
    const poses = createPoseStore()
    poses.write('claude:a', { x: 1, z: 2, heading: 0, elevation: 0 })
    const moved = poses.version()
    poses.write('claude:a', { x: 1, z: 2, heading: 0, elevation: 0 })
    expect(poses.version()).toBe(moved)
    poses.write('claude:a', { x: 1.1, z: 2, heading: 0, elevation: 0 })
    expect(poses.version()).toBe(moved + 1)
  })

  // The frame loop reads the reseat with the desk pose it explains, before React hears of it.
  it('keeps a reseat even where the pose it lands with has not moved', () => {
    const poses = createPoseStore()
    poses.write('claude:a', poseOf(agent()))
    const before = poses.version()
    poses.write('claude:a', poseOf(agent({ reseats: 1 })))
    expect({ reseats: poses.read('claude:a')?.reseats, version: poses.version() }).toEqual({
      reseats: 1,
      version: before + 1
    })
  })

  it('forgets agents that left the roster', () => {
    const poses = createPoseStore()
    poses.write('claude:a', { x: 1, z: 2, heading: 0, elevation: 0 })
    poses.write('claude:b', { x: 1, z: 2, heading: 0, elevation: 0 })
    poses.retain(new Set(['claude:b']))
    expect(poses.read('claude:a')).toBeUndefined()
    expect(poses.read('claude:b')).toBeDefined()
  })
})

describe('withLivePose', () => {
  afterEach(() => officePoses.retain(new Set()))

  it('gives an agent its live pose and keeps everything else from the frame', () => {
    officePoses.write('claude:a', { x: 7, z: -1, heading: 2, elevation: 5.5 })
    expect(withLivePose(agent())).toEqual(agent({ x: 7, z: -1, heading: 2, elevation: 5.5 }))
  })

  it('hands back the frame’s own agent when no pose was written for it', () => {
    const frameAgent = agent({ agentKey: 'claude:none' })
    expect(withLivePose(frameAgent)).toBe(frameAgent)
  })
})

describe('structuralKey', () => {
  const reference = structuralKey([agent()])

  it('stays the same when only an agent’s pose or fade progress changes', () => {
    expect(structuralKey([agent({ x: 9, z: -3, heading: 2, elevation: 5.5 })])).toBe(reference)
    expect(structuralKey([agent({ fade: 0.2 })])).toBe(structuralKey([agent({ fade: 0.7 })]))
  })

  it.each<[string, Partial<AgentView>]>([
    ['room', { roomId: 'room-b' }],
    ['seat', { slotId: 'guest_1' }],
    ['place', { place: 'lounge' }],
    ['activity', { activity: 'idle' }],
    ['attention', { attention: 'permission' }],
    ['label', { label: 'renamed' }],
    ['physical floor', { physicalFloorId: null }],
    ['fade start', { fade: 0 }],
    ['reseat count', { reseats: 1 }]
  ])('changes with the %s', (_name, change) => {
    expect(structuralKey([agent(change)])).not.toBe(reference)
  })

  it('changes with the roster', () => {
    expect(structuralKey([agent(), agent({ agentKey: 'claude:b' })])).not.toBe(reference)
  })
})

const unsubscribes: (() => void)[] = []

function createEnvironment(
  visibility: PageVisibility = { isHidden: false, isFocused: true },
  hasGameCorner = false
) {
  const frames: OfficeFrame[] = []
  let listener: ((message: FeedMessage) => void) | undefined
  const source: FeedSource = {
    ready: vi.fn().mockResolvedValue(undefined),
    onFeedMessage: (next) => {
      listener = next
      return () => (listener = undefined)
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  const settings = createOfficeSettingsStore(null)
  settings.set('loungeTrips', hasGameCorner)
  const feed = createLiveFeed(source, {
    storage: null,
    settings,
    visibility: { read: () => visibility, onChange: () => () => {} },
    poses: createPoseStore()
  })
  unsubscribes.push(feed.subscribe((frame) => frames.push(frame)))
  let seq = 1
  return {
    feed,
    frames,
    hello: (sessions: SessionRef[], sources: SourceHealth[] = []) =>
      listener?.({
        type: 'hello',
        v: 1,
        snapshot: { rev: seq, generatedAtMs: Date.now(), sessions, sources }
      }),
    patch: (upserts: SessionRef[], removed: string[] = []) =>
      listener?.({ type: 'patch', v: 1, seq: ++seq, upserts, removed })
  }
}

describe('live feed frames and poses (perf-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })
  afterEach(() => {
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe()
    vi.useRealTimers()
  })

  // Newcomers fade in at their desks, so the walker is an idle agent heading for its game corner.
  it('emits no frame while only poses change', () => {
    const environment = createEnvironment(undefined, true)
    const idle: SessionRef = {
      ...session('claude:a'),
      observation: {
        sourceId: 'claude',
        coverage: 'own',
        observedAtMs: Date.now(),
        staleAfterMs: 3_600_000
      }
    }
    environment.hello([idle], [{ id: 'claude', ok: true, detail: '' }])
    const isGaming = () => environment.frames.at(-1)?.agents[0]?.place === 'lounge'
    for (let waited = 0; waited < LOUNGE_DELAY_MS + 5_000 && !isGaming(); waited += 100)
      vi.advanceTimersByTime(100)
    expect(isGaming()).toBe(true)
    const setOut = environment.frames.length
    const start = environment.feed.poses.read('claude:a')
    vi.advanceTimersByTime(1_000)
    const walked = environment.feed.poses.read('claude:a')
    if (!start || !walked) throw new Error('the idle agent has no pose')
    expect(Math.hypot(walked.x - start.x, walked.z - start.z)).toBeGreaterThan(0.5)
    expect(environment.frames).toHaveLength(setOut)
  })

  it('emits a frame when an agent’s activity changes', () => {
    const environment = createEnvironment()
    const lead = session('claude:a')
    environment.hello([lead])
    vi.advanceTimersByTime(100)
    const before = environment.frames.length
    environment.patch([{ ...lead, activity: 'idle' }])
    vi.advanceTimersByTime(100)
    expect(environment.frames.length).toBe(before + 1)
    expect(environment.frames.at(-1)?.agents[0]?.activity).toBe('idle')
  })

  it('coalesces frames to the blurred rate while out of focus', () => {
    const environment = createEnvironment({ isHidden: false, isFocused: false })
    const lead = session('claude:a')
    environment.hello([lead])
    vi.advanceTimersByTime(100)
    const before = environment.frames.length
    environment.patch([{ ...lead, activity: 'idle' }])
    vi.advanceTimersByTime(100)
    expect(environment.frames).toHaveLength(before)
    environment.patch([{ ...lead, activity: 'idle', attention: 'permission' }])
    vi.advanceTimersByTime(100)
    expect(environment.frames).toHaveLength(before + 1)
    expect(environment.frames.at(-1)?.agents[0]?.attention).toBe('permission')
  })

  // Its robot shrinks over the fade; held back a tick, a leaver unmounts before it has shrunk.
  it('sends the first view of a fade at once while out of focus', () => {
    const environment = createEnvironment({ isHidden: false, isFocused: false })
    environment.hello([session('claude:a'), session('claude:b')])
    vi.advanceTimersByTime(100)
    const before = environment.frames.length
    environment.patch([], ['claude:b'])
    vi.advanceTimersByTime(100)
    expect(environment.frames).toHaveLength(before + 1)
    const leaver = environment.frames.at(-1)?.agents.find((a) => a.agentKey === 'claude:b')
    expect(leaver?.fade).toBeDefined()
  })
})
