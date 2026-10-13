import { createServer, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedMessage, OfficeSnapshot } from '../shared/office/types'
import { createApi } from './routes'

const snapshot: OfficeSnapshot = { rev: 3, generatedAtMs: 1, sessions: [], sources: [] }
const hello: FeedMessage = { type: 'hello', v: 1, snapshot }
const patch = (seq: number): FeedMessage => ({ type: 'patch', v: 1, seq, upserts: [], removed: [] })
const JSON_BODY = { 'Content-Type': 'application/json' }

describe('createApi', () => {
  let server: Server
  let origin: string
  let listeners: Set<(message: FeedMessage) => void>
  const bridge = { start: vi.fn(), stop: vi.fn() }
  const onWatchers = vi.fn()
  const service = {
    subscribe: vi.fn(),
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    startAgent: vi.fn()
  }
  const emit = (message: FeedMessage): void => {
    for (const listener of listeners) listener(message)
  }
  const post = (path: string, body: unknown, headers = JSON_BODY): Promise<Response> =>
    fetch(origin + path, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })

  async function serve(interactive: boolean, lingerMs = 10): Promise<void> {
    const api = createApi({ service, bridge, interactive, onWatchers }, lingerMs)
    server = createServer((request, response) => {
      void api(request, response, (request.url ?? '').split('?')[0])
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  beforeEach(() => {
    vi.resetAllMocks()
    listeners = new Set()
    service.subscribe.mockImplementation((listener: (message: FeedMessage) => void) => {
      listener(hello)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    })
    for (const action of [service.focus, service.send, service.respond, service.startAgent]) {
      action.mockResolvedValue({ success: true })
    }
    service.peek.mockResolvedValue({ success: true, lines: ['$ npm test'], fingerprint: 'f1' })
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    // A closed stream reports itself a tick later; it must not land in the next test.
    await vi.waitFor(() => expect(listeners.size).toBe(0))
  })

  describe('the feed', () => {
    // Reads feed lines until `count` have arrived; the stream stays open for the caller to end.
    async function watch(count: number): Promise<{ lines: unknown[]; leave: () => void }> {
      const abort = new AbortController()
      const response = await fetch(`${origin}/api/feed`, { signal: abort.signal })
      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader()
      let text = ''
      while (reader && text.split('\n').length <= count) {
        const { value, done } = await reader.read()
        if (done) break
        text += value
      }
      const lines = text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown)
      return { lines, leave: () => abort.abort() }
    }

    beforeEach(() => serve(false))

    it('streams the current state first, then each change, one JSON message per line', async () => {
      const watching = watch(2)
      await vi.waitFor(() => expect(listeners.size).toBe(1))
      emit(patch(4))

      expect((await watching).lines).toEqual([hello, patch(4)])
    })

    it('gives a second page its own current state', async () => {
      const first = await watch(1)
      const second = await watch(1)

      expect(first.lines).toEqual([hello])
      expect(second.lines).toEqual([hello])
    })

    it('runs the bridge from the first watcher to the last, and reports the count', async () => {
      const first = await watch(1)
      const second = await watch(1)
      expect(bridge.start).toHaveBeenCalledOnce()
      expect(bridge.stop).not.toHaveBeenCalled()

      first.leave()
      await vi.waitFor(() => expect(listeners.size).toBe(1))
      expect(bridge.stop).not.toHaveBeenCalled()

      second.leave()
      await vi.waitFor(() => expect(bridge.stop).toHaveBeenCalledOnce())
      expect(listeners.size).toBe(0)
      expect(onWatchers.mock.calls.map(([count]) => count)).toEqual([1, 2, 1, 0])
    })

    it('keeps the bridge running across a reload, which closes the feed and opens it again', async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await serve(false, 300)
      const page = await watch(1)
      page.leave()
      await vi.waitFor(() => expect(listeners.size).toBe(0))
      const reloaded = await watch(1)
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(bridge.start).toHaveBeenCalledOnce()
      expect(bridge.stop).not.toHaveBeenCalled()
      reloaded.leave()
      await vi.waitFor(() => expect(bridge.stop).toHaveBeenCalledOnce())
    })

    it('drops a watcher that stops reading instead of buffering its feed without limit', async () => {
      const socket = connect((server.address() as AddressInfo).port, '127.0.0.1')
      socket.write('GET /api/feed HTTP/1.1\r\nHost: test\r\n\r\n')
      socket.pause()
      await vi.waitFor(() => expect(listeners.size).toBe(1))
      const closed = new Promise((resolve) => socket.on('close', resolve))

      const large = { ...hello, snapshot: { ...snapshot, sources: [filler()] } }
      for (let sent = 0; sent < 64 && listeners.size > 0; sent++) emit(large)
      socket.resume()

      await closed
      // The client can see the socket close before the server runs its own close handler.
      await vi.waitFor(() => expect(listeners.size).toBe(0))
    })

    it('answers 405 to anything but a GET', async () => {
      expect((await post('/api/feed', {})).status).toBe(405)
      expect(service.subscribe).not.toHaveBeenCalled()
    })
  })

  describe('view-only', () => {
    beforeEach(() => serve(false))

    it('jumps to an agent’s terminal, which types nothing', async () => {
      service.focus.mockResolvedValue({ success: true, target: 'pane' })
      const response = await post('/api/focus', { agentKey: 'claude:s1#lena' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true, target: 'pane' })
      expect(service.focus).toHaveBeenCalledExactlyOnceWith('claude:s1#lena')
    })

    it.each(['/api/send', '/api/respond', '/api/peek', '/api/start'])(
      'refuses %s and reaches no agent',
      async (path) => {
        const response = await post(path, {
          sessionKey: 'claude:s1',
          text: 'rm -rf ~',
          decision: 'approve',
          fingerprint: 'f1',
          projectKey: 'p_app',
          provider: 'claude'
        })

        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ success: false, reason: 'not-permitted' })
        for (const action of [service.send, service.respond, service.peek, service.startAgent]) {
          expect(action).not.toHaveBeenCalled()
        }
      }
    )
  })

  describe('interactive', () => {
    beforeEach(() => serve(true))

    it('passes each action to the office service, which checks it', async () => {
      await post('/api/send', { sessionKey: 'claude:s1', text: 'run the tests' })
      await post('/api/respond', { sessionKey: 'claude:s1', decision: 'deny', fingerprint: 'f1' })
      await post('/api/start', { projectKey: 'p_app', provider: 'codex' })
      const peeked = await post('/api/peek', { sessionKey: 'claude:s1' })

      expect(service.send).toHaveBeenCalledExactlyOnceWith('claude:s1', 'run the tests')
      expect(service.respond).toHaveBeenCalledExactlyOnceWith('claude:s1', 'deny', 'f1')
      expect(service.startAgent).toHaveBeenCalledExactlyOnceWith('p_app', 'codex')
      expect(service.peek).toHaveBeenCalledExactlyOnceWith('claude:s1')
      expect(await peeked.json()).toEqual({
        success: true,
        lines: ['$ npm test'],
        fingerprint: 'f1'
      })
    })

    it('hands missing fields on as they are, for the service to refuse', async () => {
      service.send.mockResolvedValue({ success: false, reason: 'invalid-input' })
      const response = await post('/api/send', { sessionKey: 7 })

      expect(await response.json()).toEqual({ success: false, reason: 'invalid-input' })
      expect(service.send).toHaveBeenCalledExactlyOnceWith(7, undefined)
    })

    it.each([
      ['a body over 16 KB', JSON.stringify({ text: 'x'.repeat(17 * 1024) }), JSON_BODY, 413],
      ['a body that is not JSON', '{"sessionKey":', JSON_BODY, 400],
      ['a JSON body that is not an object', '["claude:s1"]', JSON_BODY, 400],
      ['a form post', 'sessionKey=claude:s1', { 'Content-Type': 'text/plain' }, 415]
    ])('refuses %s before anything acts on it', async (_name, body, headers, status) => {
      const response = await post('/api/send', body, headers)

      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ success: false })
      expect(service.send).not.toHaveBeenCalled()
    })

    it('answers 405 to a GET on an action, and 404 to a route it does not have', async () => {
      expect((await fetch(`${origin}/api/send`)).status).toBe(405)
      expect((await post('/api/shell', { command: 'id' })).status).toBe(404)
      expect(service.send).not.toHaveBeenCalled()
    })

    it('reports a failure inside the service without saying what it was', async () => {
      service.send.mockRejectedValue(new Error('/Users/dev/secret path'))
      const response = await post('/api/send', { sessionKey: 'claude:s1', text: 'hi' })

      expect(response.status).toBe(500)
      expect(await response.text()).toBe('{"success":false}')
    })
  })
})

// About 256 KB in one feed message.
function filler(): { id: string; ok: boolean; detail: string } {
  return { id: 'filler', ok: true, detail: 'x'.repeat(256 * 1024) }
}
