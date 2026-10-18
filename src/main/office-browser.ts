import { rm } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createOfficeServer, type OfficeServer } from '../office-web/server'
import { createLaunchToken, writeLaunchFile } from '../office-web/launch-token'
import type { StaticFile } from '../office-web/static-files'

const OFFICE_BROWSER_PORT = 43127
const BROWSER_IDLE_MS = 10 * 60_000
const LAUNCH_WAIT_MS = 60_000

interface BrowserOfficeOptions {
  loadFiles: () => Promise<ReadonlyMap<string, StaticFile>>
  launchFolder: string
  service: Parameters<typeof createOfficeServer>[0]['service']
  openExternal: (url: string) => Promise<void>
  port?: number
}

// dry-new: the standalone CLI owns a poller; the native browser must share the app's bridge.
export function createBrowserOffice({
  loadFiles,
  launchFolder,
  service,
  openExternal,
  port = OFFICE_BROWSER_PORT
}: BrowserOfficeOptions) {
  let server: OfficeServer | null = null
  let starting: Promise<OfficeServer> | null = null
  let opening: Promise<void> | null = null
  let closing: Promise<void> | null = null
  let launchFile: string | null = null
  let listeningPort = port
  let watchers = 0
  let awaitingUseUntil = 0
  let isStopped = false

  async function removeLaunchFile(): Promise<void> {
    const spent = launchFile
    launchFile = null
    if (spent) await rm(spent, { force: true })
  }

  function closeServer(): Promise<void> {
    if (closing) return closing
    const current = server
    server = null
    awaitingUseUntil = 0
    closing = (async () => {
      await removeLaunchFile()
      if (current) await current.close()
      watchers = 0
    })().finally(() => {
      closing = null
    })
    return closing
  }

  async function startServer(): Promise<OfficeServer> {
    const files = await loadFiles()
    if (isStopped) throw new Error('Browser Office is stopped')
    const created = createOfficeServer({
      files,
      service,
      interactive: false,
      // The app already owns the bridge; browser disconnects never stop it.
      launchCode: createLaunchToken(),
      idleMs: BROWSER_IDLE_MS,
      onIdle: () => {
        void closeServer().catch(reportCleanupFailure)
      },
      onFirstUse: () => {
        awaitingUseUntil = 0
        // Unlink before issuing another launcher at the same stable path.
        if (launchFile) {
          try {
            rmSync(launchFile, { force: true })
          } catch {
            reportCleanupFailure()
          }
          launchFile = null
        }
      },
      onWatchers: (count) => {
        watchers = count
      }
    })
    try {
      listeningPort = (await created.listen(port)).port
      if (isStopped) {
        await created.close()
        throw new Error('Browser Office is stopped')
      }
      server = created
      return created
    } catch (error) {
      await created.close()
      if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE')
        throw new Error(
          `Browser Office port ${port} is busy. Close the other listener and try again.`
        )
      throw error
    }
  }

  function getServer(): Promise<OfficeServer> {
    if (closing) return closing.then(() => getServer())
    if (server) return Promise.resolve(server)
    if (!starting)
      starting = startServer().finally(() => {
        starting = null
      })
    return starting
  }

  async function launchBrowser(): Promise<void> {
    const current = await getServer()
    if (isStopped) throw new Error('Browser Office is stopped')
    const code = current.renewLaunchCode()
    launchFile = join(launchFolder, `launch-${listeningPort}.html`)
    try {
      await writeLaunchFile(launchFolder, listeningPort, code, false)
      if (isStopped) throw new Error('Browser Office is stopped')
      awaitingUseUntil = Date.now() + LAUNCH_WAIT_MS
      await openExternal(pathToFileURL(launchFile).href)
    } catch (error) {
      awaitingUseUntil = 0
      // A failed new tab must not disconnect tabs already watching the same live feed.
      if (watchers > 0) await removeLaunchFile()
      else await closeServer()
      throw error
    }
  }

  return {
    open: (): Promise<void> => {
      if (isStopped) return Promise.reject(new Error('Browser Office is stopped'))
      if (opening) return opening
      if (Date.now() < awaitingUseUntil) return Promise.resolve()
      opening = launchBrowser().finally(() => {
        opening = null
      })
      return opening
    },
    hasWatchers: (): boolean => watchers > 0,
    close: async (): Promise<void> => {
      isStopped = true
      // Quit can end the process before async cleanup; revoke the disk launcher immediately.
      if (launchFile) rmSync(launchFile, { force: true })
      await Promise.allSettled([opening, starting])
      await closeServer()
    }
  }
}

function reportCleanupFailure(): void {
  console.error('Browser Office could not finish cleanup.')
}
