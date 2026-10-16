import {
  FOCUS_TARGETS,
  INTERACTION_FAILURES,
  type FeedMessage,
  type FocusResult,
  type InteractionFailure,
  type InteractionResult,
  type PeekResult
} from '../../shared/office/types'
import { isFeedMessage } from '../../shared/office/feed-message'
import { parseWorldSaveReply } from '../../shared/office/world-sync'
import {
  hasValidObservationMetadata,
  hasValidPeekMetadata
} from '../../shared/office/observation-dto'
import { inertTerminalLines, isTerminalProvenance } from '../../shared/office/observation-terminal'

// The preload's own type, read off the global it fills, so the two cannot drift apart.
type OfficeBridgeApi = Omit<
  NonNullable<Window['officeBridge']>,
  'isVisible' | 'onVisibilityChanged'
>

const TOKEN_KEY = 'claudewatch.office.token'
const VIEW_ONLY_KEY = 'claudewatch.office.view-only'
const TOKEN_FRAGMENT = /^#t=([A-Za-z0-9_-]{43})(&view)?$/
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/
const FEED_RETRY_MS = 1000
// This many tries in a row with no answer, and the server is taken to have stopped.
const LOST_AFTER_TRIES = 10

// What this page can show the standalone server: the one-time code in its launch address,
// taken out of the address at once, or the session token this tab stored after trading one.
// Null when the page was not launched by the server.
export function takeLaunchToken(
  page: Pick<Window, 'location' | 'history' | 'sessionStorage'>
): string | null {
  const [, launchCode, viewOnlyMark] = TOKEN_FRAGMENT.exec(page.location.hash) ?? []
  if (!launchCode) return page.sessionStorage.getItem(TOKEN_KEY)
  if (viewOnlyMark) page.sessionStorage.setItem(VIEW_ONLY_KEY, '1')
  else page.sessionStorage.removeItem(VIEW_ONLY_KEY)
  page.history.replaceState(null, '', page.location.pathname + page.location.search)
  return launchCode
}

// Whether the server launched this tab view-only: a hint for what to offer, never a permission.
export function isViewOnlyPage(page: Pick<Window, 'sessionStorage'>): boolean {
  return page.sessionStorage.getItem(VIEW_ONLY_KEY) === '1'
}

function parseFeedLine(line: string): FeedMessage | null {
  try {
    const message: unknown = JSON.parse(line)
    return isFeedMessage(message) && hasValidObservationMetadata(message) ? message : null
  } catch {
    return null
  }
}

const field = (reply: unknown, name: string): unknown =>
  typeof reply === 'object' && reply !== null ? Reflect.get(reply, name) : undefined
const isFailure = (value: unknown): value is InteractionFailure =>
  INTERACTION_FAILURES.some((known) => known === value)

// A reason this page does not know is dropped, so the Office shows its general failure
// wording instead of nothing.
function toResult(reply: unknown): InteractionResult {
  if (field(reply, 'success') === true) return { success: true }
  const reason = field(reply, 'reason')
  return isFailure(reason) ? { success: false, reason } : { success: false }
}

function toFocusResult(reply: unknown): FocusResult {
  const result = toResult(reply)
  const target = FOCUS_TARGETS.find((known) => known === field(reply, 'target'))
  return target ? { ...result, target } : result
}

function toPeekResult(reply: unknown): PeekResult {
  if (!hasValidPeekMetadata(reply)) return { success: false, lines: [] }
  const lines = field(reply, 'lines')
  const fingerprint = field(reply, 'fingerprint')
  const capturedAtMs = field(reply, 'capturedAtMs')
  const targetAgentKey = field(reply, 'targetAgentKey')
  const terminal = field(reply, 'terminal')
  return {
    ...toResult(reply),
    lines: inertTerminalLines(
      Array.isArray(lines) ? lines.filter((line) => typeof line === 'string') : []
    ),
    ...(typeof fingerprint === 'string' ? { fingerprint } : {}),
    ...(typeof capturedAtMs === 'number' ? { capturedAtMs } : {}),
    ...(typeof targetAgentKey === 'string' ? { targetAgentKey } : {}),
    ...(isTerminalProvenance(terminal) ? { terminal } : {})
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    // One signal serves every retry, so each wait takes its listener away again.
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish)
  })
}

// Trades the launch code for the session token and stores it for a reload of this tab.
// Null when the server refuses: the code works once, so there is nothing to retry.
async function openSession(launchCode: string): Promise<string | null> {
  try {
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${launchCode}` }
    })
    const token = field(await response.json(), 'token')
    if (typeof token !== 'string' || !SESSION_TOKEN.test(token)) return null
    window.sessionStorage.setItem(TOKEN_KEY, token)
    return token
  } catch {
    return null
  }
}

// The preload's bridge, for a page served by the standalone Office server: the feed is one
// long response read line by line, and every call carries the session token in a header.
// `credential` is what takeLaunchToken found: this tab's stored token, or a launch code.
// `onLost` fires once, when the server has stopped or no longer accepts this tab.
export function createWebBridge(credential: string, onLost?: () => void): OfficeBridgeApi {
  let sessionToken = window.sessionStorage.getItem(TOKEN_KEY) === credential ? credential : null
  const opening = sessionToken
    ? null
    : openSession(credential).then((token) => {
        sessionToken = token
      })
  // Null when no session could be opened: then nothing is sent.
  const authorization = async (): Promise<{ Authorization: string } | null> => {
    if (opening) await opening
    return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : null
  }
  const listeners = new Set<(message: FeedMessage) => void>()
  let feed: AbortController | null = null

  const deliver = (message: FeedMessage): void => {
    for (const listener of listeners) listener(message)
  }

  let failedTries = 0

  // Resolves when the stream ends: true when reconnecting could help.
  async function readFeed(signal: AbortSignal): Promise<boolean> {
    const headers = await authorization()
    // The token is per launch: without one, or once it is refused, no retry can succeed.
    if (!headers) return false
    const response = await fetch('/api/feed', { headers, signal })
    if (response.status === 401 || response.status === 403) return false
    const reader = response.ok ? response.body?.getReader() : undefined
    if (!reader) return true
    failedTries = 0
    const decoder = new TextDecoder()
    let unfinished = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return true
      const lines = (unfinished + decoder.decode(value, { stream: true })).split('\n')
      unfinished = lines.pop() ?? ''
      for (const line of lines) {
        const message = parseFeedLine(line)
        if (message) deliver(message)
      }
    }
  }

  async function followFeed(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const canRetry = await readFeed(signal).catch(() => true)
      if (signal.aborted) return
      // What the Office shows may be out of date until the next hello.
      deliver({ type: 'resync' })
      failedTries += 1
      if (!canRetry || failedTries >= LOST_AFTER_TRIES) return onLost?.()
      await pause(FEED_RETRY_MS, signal)
    }
  }

  async function post(path: string, body: object): Promise<unknown> {
    try {
      const headers = await authorization()
      if (!headers) return null
      const response = await fetch(path, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      return await response.json()
    } catch {
      return null
    }
  }
  const focus = async (agentKey: string): Promise<FocusResult> =>
    toFocusResult(await post('/api/focus', { agentKey }))

  return {
    ready: async () => {
      if (feed) return
      feed = new AbortController()
      void followFeed(feed.signal)
    },
    onFeedMessage: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        feed?.abort()
        feed = null
      }
    },
    focus,
    send: async (sessionKey, text) => toResult(await post('/api/send', { sessionKey, text })),
    respond: async (sessionKey, decision, fingerprint) =>
      toResult(await post('/api/respond', { sessionKey, decision, fingerprint })),
    peek: async (sessionKey) => toPeekResult(await post('/api/peek', { sessionKey })),
    start: async (projectKey, provider) =>
      toResult(await post('/api/start', { projectKey, provider })),
    // A view-only server answers 403 with no city; that reads as a refusal like any other.
    saveWorld: async (document) => parseWorldSaveReply(await post('/api/world', { document }))
  }
}
