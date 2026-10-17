import type { FeedMessage, OfficeSnapshot } from '../../shared/office/types'
import type { AccountLedger } from './account-ledger'
import { decorateSession, decorateSnapshot } from './accounts-view'

interface FeedSource {
  snapshot(): OfficeSnapshot | null
  onMessage(listener: (message: FeedMessage) => void): () => void
}

export type OfficeAccounts = Pick<AccountLedger, 'decorate' | 'decorateSession' | 'onOfficeChange'>

type PatchMessage = Extract<FeedMessage, { type: 'patch' }>

const todayKey = (snapshot: OfficeSnapshot | null): string =>
  JSON.stringify(snapshot?.projectsToday ?? null)

// For a host with no ledger behind it: every session leaves without an account, exactly as
// when accounts are not watched.
export const withoutAccounts = (host: FeedSource): FeedSource =>
  withAccounts(host, {
    decorate: (snapshot) => decorateSnapshot(null, snapshot),
    decorateSession: (session) => decorateSession(null, session),
    onOfficeChange: () => () => {}
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
      let shownToday = todayKey(snapshot())
      const hello = (decorated: OfficeSnapshot): void => {
        shownToday = todayKey(decorated)
        listener({ type: 'hello', v: 1, snapshot: decorated })
      }
      // A hello resets an Office's event baseline, so changed totals ride the next patch instead.
      const changedToday = (): Pick<PatchMessage, 'projectsToday'> => {
        const current = snapshot()
        const key = todayKey(current)
        if (!current?.projectsToday || key === shownToday) return {}
        shownToday = key
        return { projectsToday: current.projectsToday }
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
