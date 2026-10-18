import type { IncomingMessage, ServerResponse } from 'node:http'
import { jsonObject } from '../bridge/io'
import type { OfficeService } from '../office-host/office-service'
import type { InteractionResult } from '../shared/office/types'

const MAX_BODY_BYTES = 16 * 1024
// A watcher this far behind has stopped reading. It is dropped, and reconnects to a fresh hello.
const MAX_FEED_BACKLOG_BYTES = 1024 * 1024
// A reload closes the feed and opens it again at once. The bridge outlives that gap, so it does
// not start over and count every transcript again.
const BRIDGE_LINGER_MS = 5_000

type ApiService = Pick<
  OfficeService,
  'subscribe' | 'focus' | 'send' | 'respond' | 'peek' | 'startAgent'
>
type Body = Record<string, unknown>
type Route = (service: ApiService, body: Body) => Promise<InteractionResult>

// A view-only page may jump to an agent: the service it is given switches panes and brings
// apps forward, and types nothing (it is built with `isInteractive: false`).
const VIEW_ROUTES: Readonly<Record<string, Route>> = {
  '/api/focus': (service, { agentKey }) => service.focus(agentKey)
}
// Everything that types into, reads from or starts a terminal.
const INTERACTIVE_ROUTES: Readonly<Record<string, Route>> = {
  '/api/send': (service, { sessionKey, text }) => service.send(sessionKey, text),
  '/api/respond': (service, { sessionKey, decision, fingerprint }) =>
    service.respond(sessionKey, decision, fingerprint),
  '/api/peek': (service, { sessionKey }) => service.peek(sessionKey),
  '/api/start': (service, { projectKey, provider }) => service.startAgent(projectKey, provider)
}

const FAILED: InteractionResult = { success: false }
const NOT_PERMITTED: InteractionResult = { success: false, reason: 'not-permitted' }

export interface ApiOptions {
  service: ApiService
  // The bridge runs only while a page is watching the feed.
  bridge?: { start(): void; stop(): void }
  interactive: boolean
  onWatchers: (count: number) => void
}

export type ApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  path: string
) => Promise<void>

function sendJson(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

// The body as a JSON object, or the status to refuse it with.
async function readBody(request: IncomingMessage): Promise<Body | 400 | 413 | 415> {
  if (!request.headers['content-type']?.startsWith('application/json')) return 415
  const chunks: Buffer[] = []
  let bytes = 0
  // An oversized body is read to its end but not kept: breaking off would reset the connection
  // before the refusal could be sent.
  for await (const chunk of request) {
    if (!(chunk instanceof Buffer)) return 400
    bytes += chunk.length
    if (bytes <= MAX_BODY_BYTES) chunks.push(chunk)
  }
  if (bytes > MAX_BODY_BYTES) return 413
  return jsonObject(Buffer.concat(chunks).toString('utf8')) ?? 400
}

// Requests reach this only after the guard has checked Host, Origin and the launch token.
export function createApi(
  { service, bridge, interactive, onWatchers }: ApiOptions,
  lingerMs = BRIDGE_LINGER_MS
): ApiHandler {
  // Built once: without --interactive the routes that touch a terminal do not exist.
  const routes = new Map(
    Object.entries(interactive ? { ...VIEW_ROUTES, ...INTERACTIVE_ROUTES } : VIEW_ROUTES)
  )
  let watchers = 0
  let stopping: NodeJS.Timeout | null = null

  function watch(response: ServerResponse): void {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' })
    response.flushHeaders()
    const unsubscribe = service.subscribe((message) => {
      response.write(`${JSON.stringify(message)}\n`)
      if (response.writableLength > MAX_FEED_BACKLOG_BYTES) response.destroy()
    })
    response.on('close', () => {
      unsubscribe()
      if (--watchers === 0) {
        stopping = setTimeout(() => {
          stopping = null
          bridge?.stop()
        }, lingerMs)
        // A pending stop must not hold the process open once the server has closed.
        stopping.unref()
      }
      onWatchers(watchers)
    })
    if (++watchers === 1) {
      if (stopping) clearTimeout(stopping)
      else bridge?.start()
      stopping = null
    }
    onWatchers(watchers)
  }

  return async (request, response, path) => {
    if (path === '/api/feed') {
      return request.method === 'GET' ? watch(response) : sendJson(response, 405, FAILED)
    }
    const route = routes.get(path)
    if (!route) {
      return Object.hasOwn(INTERACTIVE_ROUTES, path)
        ? sendJson(response, 403, NOT_PERMITTED)
        : sendJson(response, 404, FAILED)
    }
    if (request.method !== 'POST') return sendJson(response, 405, FAILED)
    const body = await readBody(request)
    if (typeof body === 'number') return sendJson(response, body, FAILED)
    try {
      sendJson(response, 200, await route(service, body))
    } catch {
      // The cause may name local paths; the page learns only that it failed.
      sendJson(response, 500, FAILED)
    }
  }
}
