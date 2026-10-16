import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, stat, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FeedMessage } from '../../shared/office/types'
import { loadStaticFiles } from '../../office-web/static-files'
import { createBrowserOffice } from '../office-browser'

let folder: string
let browser: ReturnType<typeof createBrowserOffice>
const openExternal = vi.fn<(url: string) => Promise<void>>()
const listeners = new Set<(message: FeedMessage) => void>()
const service = {
  subscribe: (listener: (message: FeedMessage) => void) => {
    listeners.add(listener)
    listener({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1, sessions: [], sources: [] }
    })
    return () => {
      listeners.delete(listener)
    }
  },
  focus: vi.fn(),
  send: vi.fn(),
  respond: vi.fn(),
  peek: vi.fn(),
  startAgent: vi.fn(),
  saveWorld: vi.fn()
}

beforeEach(async () => {
  vi.clearAllMocks()
  listeners.clear()
  openExternal.mockResolvedValue()
  folder = await mkdtemp(join(tmpdir(), 'office-browser-test-'))
  await mkdir(join(folder, 'web'))
  const html = '<!doctype html><title>Office</title>'
  await writeFile(join(folder, 'web/office.html'), html)
  await writeFile(
    join(folder, 'MANIFEST.json'),
    JSON.stringify({
      files: [{ path: 'web/office.html', sha256: createHash('sha256').update(html).digest('hex') }]
    })
  )
  browser = createBrowserOffice({
    loadFiles: () => loadStaticFiles(folder),
    launchFolder: join(folder, 'private'),
    service,
    openExternal,
    port: 0
  })
})

afterEach(async () => {
  await browser.close()
  await rm(folder, { recursive: true, force: true })
})

async function launch() {
  await browser.open()
  const url = openExternal.mock.calls.at(-1)?.[0]
  if (!url) throw new Error('No browser launch')
  const filename = fileURLToPath(url)
  const html = await readFile(filename, 'utf8')
  const address = /url=(http:\/\/127\.0\.0\.1:\d+\/office\.html#t=[\w-]{43}&view)/.exec(html)?.[1]
  if (!address) throw new Error('No local launch code')
  const page = new URL(address)
  const code = new URLSearchParams(page.hash.slice(1)).get('t')
  const trade = await fetch(`${page.origin}/api/session`, {
    method: 'POST',
    headers: { Origin: page.origin, Authorization: `Bearer ${code}` }
  })
  expect(trade.status).toBe(200)
  const session: unknown = await trade.json()
  const token = session && typeof session === 'object' ? Reflect.get(session, 'token') : null
  if (typeof token !== 'string') throw new Error('No session token')
  return { filename, origin: page.origin, token }
}

it('opens only a private launch file and removes its spent code', async () => {
  const opened = await launch()
  expect(openExternal.mock.calls[0][0]).toMatch(/^file:/)
  expect(openExternal.mock.calls[0][0]).not.toContain('#t=')
  expect((await stat(join(folder, 'private'))).mode & 0o777).toBe(0o700)
  await vi.waitFor(async () => expect(await stat(opened.filename).catch(() => null)).toBeNull())
})

it('coalesces concurrent opens and retains authorized sessions across a later launch', async () => {
  await Promise.all([browser.open(), browser.open()])
  expect(openExternal).toHaveBeenCalledOnce()
  const first = await launch()
  const second = await launch()
  expect(second.origin).toBe(first.origin)
  expect(second.token).toBe(first.token)
  for (const route of ['send', 'respond', 'peek', 'start']) {
    const denied = await fetch(`${second.origin}/api/${route}`, {
      method: 'POST',
      headers: {
        Origin: second.origin,
        Authorization: `Bearer ${first.token}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    })
    expect(denied.status).toBe(403)
  }
  for (const action of [service.send, service.respond, service.peek, service.startAgent])
    expect(action).not.toHaveBeenCalled()
})

it('streams live records without taking bridge ownership and cleans up on stop', async () => {
  const opened = await launch()
  const abort = new AbortController()
  const response = await fetch(`${opened.origin}/api/feed`, {
    headers: { Authorization: `Bearer ${opened.token}` },
    signal: abort.signal
  })
  const reader = response.body?.getReader()
  expect(new TextDecoder().decode((await reader?.read())?.value)).toContain('"type":"hello"')
  expect(browser.hasWatchers()).toBe(true)
  await browser.close()
  abort.abort()
  await vi.waitFor(() => expect(listeners.size).toBe(0))
  expect(browser.hasWatchers()).toBe(false)
  expect(await browser.open().catch(() => 'stopped')).toBe('stopped')
})

it('retries a failed browser launch without leaking the unused launch file', async () => {
  openExternal.mockRejectedValueOnce(new Error('browser unavailable'))
  await expect(browser.open()).rejects.toThrow('browser unavailable')
  const filename = fileURLToPath(openExternal.mock.calls[0][0])
  expect(await stat(filename).catch(() => null)).toBeNull()
  await expect(launch()).resolves.toMatchObject({
    origin: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/)
  })
})

it('reports a busy stable port without stopping the existing listener', async () => {
  const occupied = createServer()
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
  try {
    const address = occupied.address()
    if (!address || typeof address === 'string') throw new Error('No test port')
    browser = createBrowserOffice({
      loadFiles: () => loadStaticFiles(folder),
      launchFolder: join(folder, 'private'),
      service,
      openExternal,
      port: address.port
    })
    await expect(browser.open()).rejects.toThrow(`port ${address.port} is busy`)
    expect(occupied.listening).toBe(true)
    expect(openExternal).not.toHaveBeenCalled()
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()))
  }
})

it('preserves an authorized feed when a renewed browser launch fails', async () => {
  const opened = await launch()
  const abort = new AbortController()
  const response = await fetch(`${opened.origin}/api/feed`, {
    headers: { Authorization: `Bearer ${opened.token}` },
    signal: abort.signal
  })
  const reader = response.body?.getReader()
  await reader?.read()
  openExternal.mockRejectedValueOnce(new Error('browser unavailable'))
  await expect(browser.open()).rejects.toThrow('browser unavailable')
  expect(browser.hasWatchers()).toBe(true)
  expect(listeners.size).toBe(1)
  const retry = await fetch(`${opened.origin}/api/send`, {
    method: 'POST',
    headers: { Origin: opened.origin, Authorization: `Bearer ${opened.token}` }
  })
  expect(retry.status).toBe(403)
  abort.abort()
})

it('does not start a listener when stopped while loading the page assets', async () => {
  const files = await loadStaticFiles(folder)
  let finishLoading: (() => void) | undefined
  const loaded = new Promise<typeof files>((resolve) => {
    finishLoading = () => resolve(files)
  })
  browser = createBrowserOffice({
    loadFiles: () => loaded,
    launchFolder: join(folder, 'private'),
    service,
    openExternal,
    port: 0
  })
  const opening = browser.open().catch((error: unknown) => error)
  const closing = browser.close()
  finishLoading?.()
  expect(await opening).toBeInstanceOf(Error)
  await closing
  expect(openExternal).not.toHaveBeenCalled()
  expect(browser.hasWatchers()).toBe(false)
})
