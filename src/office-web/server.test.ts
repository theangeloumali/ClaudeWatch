import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { connect, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedMessage } from '../shared/office/types'
import { createOfficeServer, type OfficeServer, SERVER_LIMITS } from './server'

const CODE = 'k'.repeat(43)
const files = new Map([
  [
    '/office.html',
    { body: Buffer.from('<!doctype html>'), contentType: 'text/html; charset=utf-8' }
  ]
])

interface Reply {
  status: number
  headers: IncomingHttpHeaders
  body: string
}

it('ships with a connection cap and short waits for headers and bodies', () => {
  expect(SERVER_LIMITS).toMatchObject({
    maxConnections: 32,
    headersTimeoutMs: 10_000,
    requestTimeoutMs: 30_000
  })
})

describe('createOfficeServer', () => {
  let server: OfficeServer
  let port: number
  // The session token the launch code was traded for.
  let token: string
  const onIdle = vi.fn()
  const onFirstUse = vi.fn()
  const bridge = { start: vi.fn(), stop: vi.fn() }
  const service = {
    subscribe: vi.fn(),
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    startAgent: vi.fn()
  }

  // Sent over a real socket with the headers exactly as given, Host included.
  function send(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: string
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port,
          method,
          path,
          headers: { host: `127.0.0.1:${port}`, ...headers },
          // One connection per request, so none is left open to count against the cap.
          agent: false
        },
        (response) => {
          let text = ''
          response.setEncoding('utf8')
          response.on('data', (chunk: string) => (text += chunk))
          response.on('end', () =>
            resolve({ status: response.statusCode ?? 0, headers: response.headers, body: text })
          )
        }
      )
      request.on('error', reject)
      request.end(body)
    })
  }
  const pageHeaders = (bearer = token): Record<string, string> => ({
    authorization: `Bearer ${bearer}`,
    origin: `http://127.0.0.1:${port}`,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json'
  })
  const openSession = (headers = pageHeaders(CODE)): Promise<Reply> =>
    send('POST', '/api/session', headers)
  const focus = (headers: Record<string, string>): Promise<Reply> =>
    send('POST', '/api/focus', headers, '{"agentKey":"claude:s1"}')

  async function start(
    options: {
      interactive?: boolean
      idleMs?: number
      limits?: typeof SERVER_LIMITS
      // Leave the launch code untraded, as before the page has loaded.
      unopened?: boolean
    } = {}
  ): Promise<void> {
    server = createOfficeServer(
      {
        files,
        launchCode: CODE,
        service,
        bridge,
        interactive: options.interactive ?? false,
        idleMs: options.idleMs ?? 60_000,
        onIdle,
        onFirstUse
      },
      options.limits
    )
    const address = await server.listen(0)
    port = address.port
    expect(address).toMatchObject({ address: '127.0.0.1', family: 'IPv4' })
    token = ''
    if (!options.unopened) token = JSON.parse((await openSession()).body).token
  }

  beforeEach(() => {
    vi.resetAllMocks()
    service.subscribe.mockReturnValue(() => undefined)
    service.focus.mockResolvedValue({ success: true, target: 'pane' })
    service.send.mockResolvedValue({ success: true })
  })

  afterEach(() => server.close())

  it('listens on the IPv4 loopback address and nowhere else', async () => {
    await start()
    expect(port).toBeGreaterThan(0)
  })

  it('serves the page with headers that forbid framing and cross-origin use', async () => {
    await start()
    const reply = await send('GET', '/office.html')

    expect(reply).toMatchObject({ status: 200, body: '<!doctype html>' })
    expect(reply.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(reply.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(reply.headers['x-frame-options']).toBe('DENY')
    expect(reply.headers['x-content-type-options']).toBe('nosniff')
    expect(reply.headers['cache-control']).toBe('no-store')
  })

  it.each([
    '/..%2f..%2fetc/passwd',
    '/../server.mjs',
    '/assets/../../MANIFEST.json',
    '/office.html/../../server.mjs',
    '/%2e%2e/office.html',
    '/MANIFEST.json',
    '/server.mjs',
    '/'
  ])('answers 404 to %s, which is not a listed page file', async (path) => {
    await start()
    expect((await send('GET', path)).status).toBe(404)
  })

  it.each(['localhost', 'evil.test'])('refuses a request addressed to %s', async (name) => {
    await start()
    const host = `${name}:${port}`

    expect((await send('GET', '/office.html', { host })).status).toBe(403)
    expect((await focus({ ...pageHeaders(), host })).status).toBe(403)
    expect(service.focus).not.toHaveBeenCalled()
  })

  it('refuses an API call from another origin, even one on this machine', async () => {
    await start()

    expect((await focus({ ...pageHeaders(), origin: 'http://127.0.0.1:5173' })).status).toBe(403)
    expect((await focus({ ...pageHeaders(), 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect(service.focus).not.toHaveBeenCalled()
  })

  describe('the launch code', () => {
    it('gives a renewed launch a full idle interval instead of expiring during page startup', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        await start({ idleMs: 100, unopened: true })
        await vi.advanceTimersByTimeAsync(75)
        server.renewLaunchCode()
        await vi.advanceTimersByTimeAsync(50)
        expect(onIdle).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(50)
        expect(onIdle).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    })
    it('renews one-use launches without revoking an already authorized page', async () => {
      await start()
      const firstToken = token
      const renewed = server.renewLaunchCode()
      expect(renewed).not.toBe(CODE)
      expect((await openSession(pageHeaders(renewed))).status).toBe(200)
      expect((await openSession(pageHeaders(renewed))).status).toBe(401)
      expect((await focus(pageHeaders(firstToken))).status).toBe(200)
    })

    it('is traded once for a session token, and refused from then on', async () => {
      await start({ unopened: true })
      const first = await openSession()
      expect(first.status).toBe(200)
      const session = JSON.parse(first.body)
      expect(session).toEqual({ success: true, token: expect.stringMatching(/^[\w-]{43}$/) })
      expect(session.token).not.toBe(CODE)

      expect((await openSession()).status).toBe(401)
      expect((await focus(pageHeaders(CODE))).status).toBe(401)
      expect((await focus(pageHeaders(session.token))).status).toBe(200)
      // The session token opens no second session either.
      expect((await openSession(pageHeaders(session.token))).status).toBe(401)
    })

    it('opens nothing itself: before it is traded no call is served, the feed included', async () => {
      await start({ unopened: true })
      expect((await focus(pageHeaders(CODE))).status).toBe(401)
      expect((await send('GET', '/api/feed', { authorization: `Bearer ${CODE}` })).status).toBe(401)
      expect(service.focus).not.toHaveBeenCalled()
      expect(service.subscribe).not.toHaveBeenCalled()
    })

    it('is not spent by a request that could not have come from the page', async () => {
      await start({ unopened: true })
      const refused = await Promise.all([
        send('GET', '/api/session', pageHeaders(CODE)),
        openSession({ ...pageHeaders(CODE), origin: 'https://evil.test' }),
        openSession({ ...pageHeaders(CODE), host: `localhost:${port}` }),
        openSession(pageHeaders('x'.repeat(43)))
      ])
      expect(refused.map((reply) => reply.status)).toEqual([405, 403, 403, 401])
      expect(onFirstUse).not.toHaveBeenCalled()
      expect((await openSession()).status).toBe(200)
    })

    it('reports its trade once, so the launch file can be removed', async () => {
      await start({ unopened: true })
      await send('GET', '/office.html')
      await openSession(pageHeaders('wrong'))
      expect(onFirstUse).not.toHaveBeenCalled()

      await openSession()
      await openSession()
      await focus(pageHeaders())
      expect(onFirstUse).toHaveBeenCalledOnce()
    })
  })

  describe('limits on a local tool or page that holds connections open', () => {
    const limits = {
      ...SERVER_LIMITS,
      maxConnections: 3,
      headersTimeoutMs: 150,
      requestTimeoutMs: 300,
      checkEveryMs: 50
    }
    const sockets: Socket[] = []
    const open = (): Promise<Socket> =>
      new Promise((resolve) => {
        const socket = connect(port, '127.0.0.1', () => resolve(socket))
        socket.on('error', () => undefined)
        // Reads what the server sends, so its closing the connection is seen.
        socket.resume()
        sockets.push(socket)
      })
    const closed = (socket: Socket): Promise<true> =>
      new Promise((resolve) => socket.on('close', () => resolve(true)))

    afterEach(() => {
      for (const socket of sockets.splice(0)) socket.destroy()
    })

    it('drops connections beyond its cap', async () => {
      await start({ limits })
      const held = [await open(), await open(), await open()]
      const extra = await open()
      expect(await closed(extra)).toBe(true)
      expect(held.every((socket) => !socket.destroyed)).toBe(true)
    })

    it('drops a connection whose headers never finish', async () => {
      await start({ limits })
      const slow = await open()
      slow.write('GET /office.html HTTP/1.1\r\nHost: 127.0.0.1\r\n')
      expect(await closed(slow)).toBe(true)
    })

    it('drops a request whose body never arrives', async () => {
      await start({ limits })
      const slow = await open()
      const head = Object.entries({ host: `127.0.0.1:${port}`, ...pageHeaders() })
        .map(([name, value]) => `${name}: ${value}`)
        .join('\r\n')
      slow.write(`POST /api/focus HTTP/1.1\r\n${head}\r\nContent-Length: 50\r\n\r\n{`)
      expect(await closed(slow)).toBe(true)
      expect(service.focus).not.toHaveBeenCalled()
    })

    it('keeps a feed open long past the time it waits for a request', async () => {
      const feed = new Set<(message: FeedMessage) => void>()
      service.subscribe.mockImplementation((listener: (message: FeedMessage) => void) => {
        feed.add(listener)
        return () => void feed.delete(listener)
      })
      await start({ limits })
      const page = await open()
      let received = ''
      page.on('data', (chunk: Buffer) => (received += chunk.toString('utf8')))
      page.write(
        `GET /api/feed HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${token}\r\n\r\n`
      )
      await vi.waitFor(() => expect(feed.size).toBe(1))

      await new Promise((resolve) => setTimeout(resolve, limits.requestTimeoutMs * 4))
      for (const deliver of feed) deliver({ type: 'resync' })

      await vi.waitFor(() => expect(received).toContain('{"type":"resync"}'))
      expect(page.destroyed).toBe(false)
      expect(feed.size).toBe(1)
    })
  })

  it('refuses an API call without the session token, or with another one', async () => {
    await start()
    const { authorization: _omitted, ...withoutToken } = pageHeaders()

    expect((await focus(withoutToken)).status).toBe(401)
    expect(
      (await focus({ ...pageHeaders(), authorization: `Bearer ${'x'.repeat(43)}` })).status
    ).toBe(401)
    expect((await send('GET', '/api/feed')).status).toBe(401)
    expect(service.focus).not.toHaveBeenCalled()
    expect(service.subscribe).not.toHaveBeenCalled()
  })

  it('passes a call from its own page, with the token, to the API', async () => {
    await start()
    const reply = await focus(pageHeaders())

    expect(reply.status).toBe(200)
    expect(JSON.parse(reply.body)).toEqual({ success: true, target: 'pane' })
    expect(service.focus).toHaveBeenCalledExactlyOnceWith('claude:s1')
  })

  it('refuses to type into a terminal unless it was started interactive', async () => {
    await start()
    const reply = await send(
      'POST',
      '/api/send',
      pageHeaders(),
      '{"sessionKey":"claude:s1","text":"hello"}'
    )

    expect(reply.status).toBe(403)
    expect(JSON.parse(reply.body)).toEqual({ success: false, reason: 'not-permitted' })
    expect(service.send).not.toHaveBeenCalled()
  })

  it('types into a terminal when started interactive', async () => {
    await start({ interactive: true })
    const reply = await send(
      'POST',
      '/api/send',
      pageHeaders(),
      '{"sessionKey":"claude:s1","text":"hello"}'
    )

    expect(reply.status).toBe(200)
    expect(service.send).toHaveBeenCalledExactlyOnceWith('claude:s1', 'hello')
  })

  it('answers a preflight with 405 and never sends a cross-origin header', async () => {
    await start()
    const replies = await Promise.all([
      send('OPTIONS', '/api/send', {
        origin: 'https://evil.test',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization'
      }),
      send('GET', '/office.html'),
      send('GET', '/missing.js'),
      focus(pageHeaders()),
      focus({ ...pageHeaders(), origin: 'https://evil.test' })
    ])

    expect(replies[0].status).toBe(405)
    for (const reply of replies) {
      const names = Object.keys(reply.headers).filter((name) => name.startsWith('access-control-'))
      expect(names).toEqual([])
      expect(reply.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    }
  })

  describe('when nobody is watching', () => {
    let feed: Set<(message: FeedMessage) => void>
    const watch = (): { leave: () => void } => {
      const request = httpRequest({
        host: '127.0.0.1',
        port,
        path: '/api/feed',
        headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${token}` }
      })
      request.on('error', () => undefined)
      request.end()
      return { leave: () => request.destroy() }
    }

    beforeEach(() => {
      feed = new Set()
      service.subscribe.mockImplementation((listener: (message: FeedMessage) => void) => {
        feed.add(listener)
        return () => {
          feed.delete(listener)
        }
      })
    })

    it('reports itself idle after the idle time with no page', async () => {
      await start({ idleMs: 40 })
      await vi.waitFor(() => expect(onIdle).toHaveBeenCalledOnce())
    })

    it('stays up while a page watches, and counts the idle time again once it leaves', async () => {
      await start({ idleMs: 40 })
      const page = watch()
      await vi.waitFor(() => expect(feed.size).toBe(1))
      await new Promise((resolve) => setTimeout(resolve, 120))
      expect(onIdle).not.toHaveBeenCalled()

      page.leave()
      await vi.waitFor(() => expect(onIdle).toHaveBeenCalledOnce())
    })

    it('ends open feeds when it closes, and stops counting idle time', async () => {
      await start({ idleMs: 40 })
      watch()
      await vi.waitFor(() => expect(feed.size).toBe(1))

      await server.close()
      await new Promise((resolve) => setTimeout(resolve, 120))

      expect(feed.size).toBe(0)
      expect(onIdle).not.toHaveBeenCalled()
    })
  })
})
