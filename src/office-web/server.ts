import { createServer, STATUS_CODES, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { guardRequest, SECURITY_HEADERS, SESSION_PATH } from './http-guard'
import { createLaunchToken } from './launch-token'
import { createApi, type ApiOptions } from './routes'
import type { StaticFile } from './static-files'

interface OfficeServerOptions extends Omit<ApiOptions, 'onWatchers'> {
  files: ReadonlyMap<string, StaticFile>
  // What the launch address carries. It is traded once for a session token and then refused,
  // so a copy left in browser history opens nothing.
  launchCode: string
  // How long the server may sit with no page watching before onIdle is called.
  idleMs: number
  onIdle: () => void
  // Called once, when the launch code is traded.
  onFirstUse: () => void
  onWatchers?: ApiOptions['onWatchers']
}

export interface OfficeServer {
  listen(port: number): Promise<AddressInfo>
  close(): Promise<void>
  renewLaunchCode(): string
}

// Any local program or page can open sockets here, so they are few and cannot idle half-sent.
// A feed is a finished request with an open-ended response: these waits do not end it.
export const SERVER_LIMITS = {
  maxConnections: 32,
  headersTimeoutMs: 10_000,
  requestTimeoutMs: 30_000,
  // How often Node looks for connections past those two waits.
  checkEveryMs: 5_000
}

function refuse(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end(STATUS_CODES[status])
}

export function createOfficeServer(
  options: OfficeServerOptions,
  limits = SERVER_LIMITS
): OfficeServer {
  const { files, idleMs, onIdle, onFirstUse } = options
  let port = 0
  let launchCode: string | null = options.launchCode
  let sessionToken: string | null = null
  let isClosed = false
  let idleTimer: NodeJS.Timeout | null = null
  let watcherCount = 0

  const countIdleTime = (watchers: number): void => {
    watcherCount = watchers
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = watchers === 0 && !isClosed ? setTimeout(onIdle, idleMs) : null
    options.onWatchers?.(watchers)
  }
  const api = createApi({ ...options, onWatchers: countIdleTime })

  // The guard has matched the launch code. It is spent before anything is sent, so two
  // racing requests cannot both be answered with a token.
  function openSession(response: ServerResponse): void {
    launchCode = null
    // New native launches authorize another tab without disconnecting existing watchers.
    sessionToken ??= createLaunchToken()
    onFirstUse()
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ success: true, token: sessionToken }))
  }

  const server = createServer(
    { connectionsCheckingInterval: limits.checkEveryMs },
    (request, response) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value)
      const verdict = guardRequest(request, { port, launchCode, sessionToken })
      if (!verdict.allowed) return refuse(response, verdict.status)
      if (!verdict.isApi) {
        // A lookup by exact path: nothing a request says is ever joined to a folder.
        const file = files.get(verdict.path)
        if (!file) return refuse(response, 404)
        response.writeHead(200, { 'Content-Type': file.contentType })
        return response.end(file.body)
      }
      if (verdict.path === SESSION_PATH) return openSession(response)
      api(request, response, verdict.path).catch(() => response.destroy())
    }
  )
  server.maxConnections = limits.maxConnections
  server.headersTimeout = limits.headersTimeoutMs
  server.requestTimeout = limits.requestTimeoutMs

  return {
    renewLaunchCode: () => {
      if (isClosed) throw new Error('Office server is closed')
      launchCode = createLaunchToken()
      countIdleTime(watcherCount)
      return launchCode
    },
    listen: (requestedPort) =>
      new Promise((resolve, reject) => {
        server.once('error', reject)
        // IPv4 loopback by address: never a hostname, never every interface.
        server.listen({ port: requestedPort, host: '127.0.0.1', exclusive: true }, () => {
          const address = server.address()
          if (address === null || typeof address === 'string') {
            return reject(new Error('Office server has no TCP address'))
          }
          port = address.port
          countIdleTime(0)
          resolve(address)
        })
      }),
    close: () =>
      new Promise((resolve) => {
        isClosed = true
        countIdleTime(0)
        server.close(() => resolve())
        // Feeds are open-ended responses; without this, close would wait on them for ever.
        server.closeAllConnections()
      })
  }
}
