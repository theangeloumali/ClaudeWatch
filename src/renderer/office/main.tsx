/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client'
import '../styles/globals.css'
import { browserStorage } from '../office-live/browser-storage'
import { createLiveFeed, type FeedSource } from '../office-live/live-feed'
import { NotConnected, type OfficeSurface } from '../office-live/NotConnected'
import { OfficeApp } from './OfficeApp'
import type { OfficeFeed } from './scene-model'
import { createWebBridge, isViewOnlyPage, takeLaunchToken } from './web-bridge'

const surface: OfficeSurface = /\bElectron\//.test(window.navigator.userAgent) ? 'app' : 'web'
// The scripted office is for `npm run office:preview` alone, a development server opened in a
// browser. `DEV` is false in every shipped bundle, so the fixture is not even in them.
const isPreviewBuild = import.meta.env.DEV && surface === 'web'

// The Electron window's preload first, then the standalone server that launched this tab.
function findBridge(onLost: () => void): FeedSource | null {
  if (window.officeBridge) return window.officeBridge
  try {
    const launchToken = takeLaunchToken(window)
    return launchToken ? createWebBridge(launchToken, onLost) : null
  } catch {
    // The token lives in session storage, which throws where site data is blocked.
    return null
  }
}

// Null when nothing can reach the agents: the page says so and never invents an office.
async function resolveFeed(onLost: () => void): Promise<OfficeFeed | null> {
  const bridge = findBridge(onLost)
  if (bridge) {
    const feed = createLiveFeed(bridge, { storage: browserStorage() })
    // Only a tab the standalone server launched can be view-only; the app's window never is.
    return window.officeBridge || !isViewOnlyPage(window) ? feed : { ...feed, isViewOnly: true }
  }
  if (!isPreviewBuild) return null
  const { createFixtureFeed } = await import('./fixture/fixture-feed')
  return createFixtureFeed()
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  // A tab whose server went away says so, instead of an office that reads "connecting" for ever.
  const showStopped = (): void => root.render(<NotConnected surface="stopped" />)
  void resolveFeed(showStopped).then((feed) =>
    root.render(
      feed ? (
        <OfficeApp feed={feed} hasHiddenTitleBar={surface === 'app'} />
      ) : (
        <NotConnected surface={surface} />
      )
    )
  )
}
