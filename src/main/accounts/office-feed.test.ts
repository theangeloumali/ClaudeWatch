import { describe, expect, it, vi } from 'vitest'
import { session } from '../../bridge/__fixtures__/helpers'
import type { FeedMessage, OfficeSnapshot, SessionRef } from '../../shared/office/types'
import { withAccounts, withoutAccounts } from './office-feed'

it('strips every account from a feed that has no ledger behind it', () => {
  const codex: SessionRef = {
    ...session('c'),
    key: 'codex:c',
    provider: 'codex',
    accountKey: 'codex:cccccccccccc',
    accountConfidence: 'exact'
  }
  const snapshot: OfficeSnapshot = { rev: 1, generatedAtMs: 1, sessions: [codex], sources: [] }
  const listeners = new Set<(message: FeedMessage) => void>()
  const feed = withoutAccounts({
    snapshot: () => snapshot,
    onMessage: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  })
  const received: FeedMessage[] = []
  feed.onMessage((message) => received.push(message))
  for (const listener of listeners) {
    listener({ type: 'hello', v: 1, snapshot })
    listener({ type: 'patch', v: 1, seq: 2, upserts: [codex], removed: [] })
  }
  expect(JSON.stringify([feed.snapshot(), received])).not.toMatch(/cccccccccccc|exact/)
  expect(feed.snapshot()?.sessions[0]).toMatchObject({ key: 'codex:c', accountKey: null })
})

const ACCOUNT = {
  key: 'claude:aaaaaaaaaaaa',
  provider: 'claude' as const,
  label: 'Work',
  plan: null
}

function setup(snapshot: OfficeSnapshot | null) {
  const host = {
    current: snapshot,
    listeners: new Set<(message: FeedMessage) => void>(),
    snapshot: () => host.current,
    onMessage: (listener: (message: FeedMessage) => void) => {
      host.listeners.add(listener)
      return () => {
        host.listeners.delete(listener)
      }
    }
  }
  const accounts = {
    isActive: true,
    today: [{ projectKey: 'p_1', tokens: 10 }],
    officeListeners: new Set<() => void>(),
    decorateSession: (value: SessionRef): SessionRef => ({
      ...value,
      accountKey: ACCOUNT.key,
      accountConfidence: 'inferred'
    }),
    decorate: (value: OfficeSnapshot): OfficeSnapshot => ({
      ...value,
      sessions: value.sessions.map(accounts.decorateSession),
      accounts: [{ ...ACCOUNT, isActive: accounts.isActive }],
      projectsToday: accounts.today
    }),
    projectsToday: () => accounts.today,
    onOfficeChange: (listener: () => void) => {
      accounts.officeListeners.add(listener)
      return () => {
        accounts.officeListeners.delete(listener)
      }
    }
  }
  const feed = withAccounts(host, accounts)
  const received: FeedMessage[] = []
  const unsubscribe = feed.onMessage((message) => received.push(message))
  const say = (message: FeedMessage): void =>
    host.listeners.forEach((listener) => listener(message))
  const accountsChanged = (): void => accounts.officeListeners.forEach((listener) => listener())
  return { host, accounts, feed, received, unsubscribe, say, accountsChanged }
}
const snapshot = (): OfficeSnapshot => ({
  rev: 3,
  generatedAtMs: 1,
  sources: [],
  sessions: [session('a')]
})
const attributed = { accountKey: ACCOUNT.key, accountConfidence: 'inferred' }

describe('withAccounts', () => {
  it('serves the snapshot with its accounts, and nothing while the bridge has none', () => {
    expect(setup(null).feed.snapshot()).toBeNull()
    expect(setup(snapshot()).feed.snapshot()).toMatchObject({
      rev: 3,
      sessions: [{ key: 'claude:a', ...attributed }],
      accounts: [{ ...ACCOUNT, isActive: true }]
    })
  })

  it('adds accounts to a hello and to every session a patch carries', () => {
    const { received, say } = setup(snapshot())
    say({ type: 'hello', v: 1, snapshot: snapshot() })
    say({ type: 'patch', v: 1, seq: 4, upserts: [session('b')], removed: ['claude:a'] })
    say({ type: 'resync' })
    expect(received).toMatchObject([
      { type: 'hello', snapshot: { accounts: [ACCOUNT], sessions: [attributed] } },
      {
        type: 'patch',
        seq: 4,
        removed: ['claude:a'],
        upserts: [{ key: 'claude:b', ...attributed }]
      },
      { type: 'resync' }
    ])
  })

  it('sends the whole snapshot again when the accounts change, since a patch cannot carry them', () => {
    const { accounts, received, accountsChanged } = setup(snapshot())
    accounts.isActive = false
    accountsChanged()
    expect(received).toMatchObject([
      { type: 'hello', v: 1, snapshot: { rev: 3, accounts: [{ ...ACCOUNT, isActive: false }] } }
    ])
  })

  it('has nothing to send for an account change before the bridge has reported', () => {
    const { received, accountsChanged } = setup(null)
    accountsChanged()
    expect(received).toEqual([])
  })

  it('stops both the feed and the account changes when unsubscribed', () => {
    const { received, unsubscribe, say, accountsChanged, host, accounts } = setup(snapshot())
    unsubscribe()
    say({ type: 'resync' })
    accountsChanged()
    expect(received).toEqual([])
    expect(host.listeners.size + accounts.officeListeners.size).toBe(0)
  })
})

describe('today’s tokens per project', () => {
  it('projectsToday rides a patch only when a total changed, never a hello per poll', () => {
    const { accounts, received, say, accountsChanged } = setup(snapshot())
    const patch = (seq: number): FeedMessage => ({
      type: 'patch',
      v: 1,
      seq,
      upserts: [session('a')],
      removed: []
    })
    say({ type: 'hello', v: 1, snapshot: snapshot() })
    say(patch(4))
    accounts.today = [{ projectKey: 'p_1', tokens: 25 }]
    say(patch(5))
    say(patch(6))
    accountsChanged()
    say(patch(7))
    expect(received.map((message) => message.type)).toEqual([
      'hello',
      'patch',
      'patch',
      'patch',
      'hello',
      'patch'
    ])
    expect(received.map((message) => 'projectsToday' in message)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false
    ])
    expect(received[0]).toMatchObject({ snapshot: { projectsToday: [{ tokens: 10 }] } })
    expect(received[2]).toMatchObject({ projectsToday: [{ projectKey: 'p_1', tokens: 25 }] })
    expect(received[4]).toMatchObject({ snapshot: { projectsToday: [{ tokens: 25 }] } })
  })

  it('a patch with unchanged totals does not rebuild the snapshot', () => {
    const { host, accounts, received, say } = setup(snapshot())
    say({ type: 'hello', v: 1, snapshot: snapshot() })
    const hostSnapshot = vi.spyOn(host, 'snapshot')
    const decorate = vi.spyOn(accounts, 'decorate')
    say({ type: 'patch', v: 1, seq: 4, upserts: [session('b')], removed: [] })
    expect(hostSnapshot).not.toHaveBeenCalled()
    expect(decorate).not.toHaveBeenCalled()
    expect(received.at(-1)).not.toHaveProperty('projectsToday')
  })

  it('a listener that took the snapshot first is sent no unchanged totals', () => {
    const { feed, say } = setup(snapshot())
    expect(feed.snapshot()?.projectsToday).toEqual([{ projectKey: 'p_1', tokens: 10 }])
    const later: FeedMessage[] = []
    feed.onMessage((message) => later.push(message))
    say({ type: 'patch', v: 1, seq: 4, upserts: [], removed: [] })
    expect(later).toHaveLength(1)
    expect(later[0]).not.toHaveProperty('projectsToday')
  })
})
