import type {
  FeedMessage,
  MemoryNotes,
  OfficeSnapshot,
  ProjectTokens
} from '../../shared/office/types'
import type { AccountLedger } from './account-ledger'
import { decorateSession, decorateSnapshot } from './accounts-view'

export interface FeedSource {
  snapshot(): OfficeSnapshot | null
  onMessage(listener: (message: FeedMessage) => void): () => void
}

export type OfficeAccounts = Pick<
  AccountLedger,
  'decorate' | 'decorateSession' | 'onOfficeChange' | 'projectsToday'
>

type PatchMessage = Extract<FeedMessage, { type: 'patch' }>

const todayKey = (totals: ProjectTokens[] | undefined): string => JSON.stringify(totals ?? null)

// For a host with no ledger behind it: every session leaves without an account, exactly as
// when accounts are not watched.
export const withoutAccounts = (host: FeedSource): FeedSource =>
  withAccounts(host, {
    decorate: (snapshot) => decorateSnapshot(null, snapshot),
    decorateSession: (session) => decorateSession(null, session),
    onOfficeChange: () => () => {},
    projectsToday: () => undefined
  })

// The bridge knows sessions and main knows accounts: this is the bridge's feed with each
// session's account, and the list of accounts, added on the way to the Office and dashboard.
export function withAccounts(host: FeedSource, accounts: OfficeAccounts): FeedSource {
  const snapshot = (): OfficeSnapshot | null => {
    const current = host.snapshot()
    return current && accounts.decorate(current)
  }
  return {
    snapshot,
    onMessage: (listener) => {
      // What this listener last saw of today's totals: a patch carries them only once changed.
      let shownToday = todayKey(snapshot()?.projectsToday)
      const hello = (decorated: OfficeSnapshot): void => {
        shownToday = todayKey(decorated.projectsToday)
        listener({ type: 'hello', v: 1, snapshot: decorated })
      }
      // A hello resets an Office's event baseline, so changed totals ride the next patch instead.
      const changedToday = (): Pick<PatchMessage, 'projectsToday'> => {
        const totals = accounts.projectsToday()
        const key = todayKey(totals)
        if (!totals || key === shownToday) return {}
        shownToday = key
        return { projectsToday: totals }
      }
      const offFeed = host.onMessage((message) => {
        if (message.type === 'hello') hello(accounts.decorate(message.snapshot))
        else if (message.type === 'patch') {
          listener({
            ...message,
            upserts: message.upserts.map(accounts.decorateSession),
            ...changedToday()
          })
        } else listener(message)
      })
      // A patch has no place for the account list, so a change to it goes out as a hello.
      const offAccounts = accounts.onOfficeChange(() => {
        const current = snapshot()
        if (current) hello(current)
      })
      return () => {
        offFeed()
        offAccounts()
      }
    }
  }
}

// Memory-note counts come from the disk, not the bridge or the ledger.
export interface MemoryNotesSource {
  current(): MemoryNotes | undefined
  onChange(listener: () => void): () => void
}

const notesKey = (notes: MemoryNotes | undefined): string => JSON.stringify(notes ?? null)

// A feed with the memory-note count added. Unlike the ledger's figures it is a bare count, so
// the Browser Office and the standalone Office get it too.
export function withMemoryNotes(host: FeedSource, notes: MemoryNotesSource): FeedSource {
  const withNotes = (snapshot: OfficeSnapshot): OfficeSnapshot => {
    const memory = notes.current()
    return memory ? { ...snapshot, memory } : snapshot
  }
  const snapshot = (): OfficeSnapshot | null => {
    const current = host.snapshot()
    return current && withNotes(current)
  }
  return {
    snapshot,
    onMessage: (listener) => {
      let shown = notesKey(notes.current())
      const hello = (decorated: OfficeSnapshot): void => {
        shown = notesKey(decorated.memory)
        listener({ type: 'hello', v: 1, snapshot: decorated })
      }
      const offFeed = host.onMessage((message) => {
        if (message.type === 'hello') return hello(withNotes(message.snapshot))
        const memory = notes.current()
        if (message.type !== 'patch' || !memory || notesKey(memory) === shown)
          return listener(message)
        shown = notesKey(memory)
        listener({ ...message, memory })
      })
      // A patch needs a bridge change to ride on, and a note can change with no session moving.
      const offNotes = notes.onChange(() => {
        const current = snapshot()
        if (current && notesKey(current.memory) !== shown) hello(current)
      })
      return () => {
        offFeed()
        offNotes()
      }
    }
  }
}
