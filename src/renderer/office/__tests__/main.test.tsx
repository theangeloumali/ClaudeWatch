import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OfficeFeed } from '../scene-model'

const TOKEN = 'k'.repeat(43)
const ELECTRON_AGENT = 'Mozilla/5.0 (Macintosh) Chrome/140.0.0.0 Electron/44.7.0 Safari/537.36'

const { feeds, shown } = vi.hoisted(() => {
  const feed = (): OfficeFeed => ({
    subscribe: () => () => undefined,
    focus: async () => ({ success: false }),
    send: async () => ({ success: false }),
    respond: async () => ({ success: false }),
    peek: async () => ({ success: false, lines: [] }),
    start: async () => ({ success: false })
  })
  return {
    feeds: { fixture: feed(), live: feed() },
    shown: { feed: null as OfficeFeed | null }
  }
})
const createFixtureFeed = vi.fn(() => feeds.fixture)
const createLiveFeed = vi.fn((_source: object, _options: { storage: Storage | null }) => feeds.live)

vi.mock('../fixture/fixture-feed', () => ({ createFixtureFeed }))
vi.mock('../../office-live/live-feed', () => ({ createLiveFeed }))
vi.mock('../OfficeApp', () => ({
  OfficeApp: ({ feed }: { feed: OfficeFeed }) => {
    shown.feed = feed
    return <p>The office</p>
  }
}))

interface Page {
  isPreviewBuild?: boolean
  userAgent?: string
  hash?: string
}

async function openPage(page: Page = {}): Promise<void> {
  vi.stubEnv('DEV', page.isPreviewBuild ?? false)
  if (page.userAgent) vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(page.userAgent)
  window.history.replaceState(null, '', `/office.html${page.hash ?? ''}`)
  document.body.innerHTML = '<div id="root"></div>'
  vi.resetModules()
  await act(async () => {
    await import('../main')
  })
}

beforeEach(() => {
  shown.feed = null
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  Reflect.deleteProperty(window, 'officeBridge')
  document.body.innerHTML = ''
})

describe('the Office page entry point', () => {
  it('opened in a new tab without its launch token, says so instead of showing the fixture', async () => {
    await openPage()
    expect(await screen.findByRole('heading', { name: 'Not connected' })).toBeInTheDocument()
    expect(screen.getByText(/start ClaudeWatch Office again/)).toBeInTheDocument()
    expect(screen.queryByText('The office')).not.toBeInTheDocument()
    expect(createFixtureFeed).not.toHaveBeenCalled()
    expect(createLiveFeed).not.toHaveBeenCalled()
  })

  it('in the app without its preload, says the bridge is not available', async () => {
    await openPage({ userAgent: ELECTRON_AGENT })
    expect(await screen.findByRole('heading', { name: 'Not connected' })).toBeInTheDocument()
    expect(screen.getByText(/bridge is not available/)).toBeInTheDocument()
    expect(createFixtureFeed).not.toHaveBeenCalled()
  })

  it('never shows the fixture in the app, even on the development server', async () => {
    await openPage({ isPreviewBuild: true, userAgent: ELECTRON_AGENT })
    expect(await screen.findByRole('heading', { name: 'Not connected' })).toBeInTheDocument()
    expect(createFixtureFeed).not.toHaveBeenCalled()
  })

  it('shows the scripted fixture in the browser preview', async () => {
    await openPage({ isPreviewBuild: true })
    expect(await screen.findByText('The office')).toBeInTheDocument()
    expect(shown.feed).toBe(feeds.fixture)
    expect(createLiveFeed).not.toHaveBeenCalled()
  })

  it('uses the preload bridge when the window has one, preview build or not', async () => {
    const bridge = { ready: vi.fn() }
    Reflect.set(window, 'officeBridge', bridge)
    await openPage({ isPreviewBuild: true, userAgent: ELECTRON_AGENT })
    expect(await screen.findByText('The office')).toBeInTheDocument()
    expect(shown.feed).toBe(feeds.live)
    expect(createLiveFeed).toHaveBeenCalledWith(bridge, { storage: window.localStorage })
    expect(createFixtureFeed).not.toHaveBeenCalled()
  })

  it('connects to the standalone server with the launch token from the address', async () => {
    await openPage({ hash: `#t=${TOKEN}` })
    expect(await screen.findByText('The office')).toBeInTheDocument()
    expect(shown.feed).toBe(feeds.live)
    expect(window.location.hash).toBe('')
  })

  it('says the server has stopped once it no longer accepts this tab', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    await openPage({ hash: `#t=${TOKEN}` })
    expect(await screen.findByText('The office')).toBeInTheDocument()

    // The live feed is what starts the stream; here the test stands in for it.
    const [bridge] = createLiveFeed.mock.calls[0] as unknown as [
      { ready(): Promise<void>; onFeedMessage(listener: () => void): () => void }
    ]
    bridge.onFeedMessage(() => undefined)
    await act(async () => {
      await bridge.ready()
    })

    expect(await screen.findByRole('heading', { name: 'Not connected' })).toBeInTheDocument()
    expect(screen.getByText(/Office server has stopped/)).toBeInTheDocument()
    expect(screen.queryByText('The office')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('still renders when site data is blocked: nothing is remembered and there is no token', async () => {
    const blocked = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(blocked)
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(blocked)
    await openPage({ hash: `#t=${TOKEN}` })
    expect(await screen.findByRole('heading', { name: 'Not connected' })).toBeInTheDocument()

    Reflect.set(window, 'officeBridge', { ready: vi.fn() })
    await openPage()
    expect(await screen.findByText('The office')).toBeInTheDocument()
    expect(createLiveFeed).toHaveBeenLastCalledWith(expect.anything(), { storage: null })
  })
})
