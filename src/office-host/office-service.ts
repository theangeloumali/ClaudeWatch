import { isDirectory, systemIo } from '../bridge/io'
import { orcaEnvironmentOf } from '../bridge/orca'
import type { BridgeHost } from '../main/bridge-host'
import { OfficeInteractions, type PaneOwner } from '../main/office-interactions'
import { createOrcaCli } from '../main/orca-cli'
import { OrcaTerminals } from '../main/orca-terminals'
import type { execFilePromise } from '../main/platform/exec'
import { openTerminal, openTerminalRunning, raiseTerminal } from '../main/terminal-opener'
import { raiseProcessWindow } from '../main/windows-terminals'
import type { TerminalType } from '../renderer/lib/types'
import type {
  FeedMessage,
  FocusResult,
  InteractionResult,
  PeekResult,
  PermissionDecision,
  ProviderId
} from '../shared/office/types'
import { orcaBundle } from '../shared/orca-bundle'
import { filetimeToMs, powershellScriptOf, startTimeQuery } from '../shared/platform-process'
import { PARSED_OUTPUT_ENV } from '../shared/ps'
import { runInteractivePowerShell } from '../shared/powershell-host'
import { processTreeOf, type RunScript } from '../shared/windows-console'

const PS_OPTIONS = { timeout: 5000, env: PARSED_OUTPUT_ENV }

interface OfficeServiceDeps {
  host: Pick<BridgeHost, 'snapshot' | 'onMessage'>
  run: typeof execFilePromise
  // The terminal app hosting that pid, for agents that run outside Orca.
  terminalOf: (pid: number) => Promise<TerminalType | undefined>
  // False for a view-only page: then nothing here types, a `cd` into a terminal included.
  isInteractive: boolean
  platform?: NodeJS.Platform
  // Runs the Windows scripts that carry only a pid; the kept PowerShell host when not given.
  runScript?: RunScript
}

// What the Office can do, whichever transport carries it. Arguments are `unknown` because
// they arrive from a renderer or a web page: every one is checked here before use.
export interface OfficeService {
  // The current state first, when the bridge has reported one, then every feed message.
  subscribe(listener: (message: FeedMessage) => void): () => void
  focus(agentKey: unknown): Promise<FocusResult>
  send(sessionKey: unknown, text: unknown): Promise<InteractionResult>
  respond(sessionKey: unknown, decision: unknown, fingerprint: unknown): Promise<InteractionResult>
  peek(sessionKey: unknown): Promise<PeekResult>
  startAgent(projectKey: unknown, provider: unknown): Promise<InteractionResult>
  focusProcess(owner: PaneOwner): Promise<FocusResult>
  // When the process with this pid started (epoch ms), or null when no such process runs.
  processStart(pid: number): Promise<number | null>
  // The Orca pane the process runs in, or null when it runs in none.
  paneKeyOf(pid: number): Promise<string | null>
}

const INVALID: InteractionResult = { success: false, reason: 'invalid-input' }
const asString = (value: unknown): string => (typeof value === 'string' ? value : '')
const isDecision = (value: unknown): value is PermissionDecision =>
  value === 'approve' || value === 'deny'
const isProvider = (value: unknown): value is ProviderId => value === 'claude' || value === 'codex'

export function createOfficeService({
  host,
  run,
  terminalOf,
  isInteractive,
  platform = process.platform,
  runScript = runInteractivePowerShell
}: OfficeServiceDeps): OfficeService {
  const isWindows = platform === 'win32'
  const orcaCli = createOrcaCli(run, undefined, platform)
  const orcaCliPath = orcaBundle(platform).cli
  const processStart = async (pid: number): Promise<number | null> => {
    try {
      const { file, args } = startTimeQuery(pid, platform)
      if (isWindows) return filetimeToMs((await runScript(powershellScriptOf(args))).trim()) || null
      const started = (await run(file, args, PS_OPTIONS)).stdout.trim()
      return Date.parse(`${started} UTC`) || null
    } catch {
      return null
    }
  }
  // Only these two programs: ps, and the trust-checked Orca CLI.
  const exec = async (file: string, args: string[]): Promise<string> => {
    if (file === orcaCliPath) return orcaCli.exec(args)
    if (file === '/bin/ps') return (await run(file, args, PS_OPTIONS)).stdout
    throw new Error(`not allowed: ${file}`)
  }
  // Windows has no app to merely bring forward, but has the session's own window.
  const showOnWindows = async (
    path: string,
    pid: number | null
  ): Promise<{ success: boolean; target?: 'terminal' | 'terminal-app' }> => {
    if (pid !== null && (await raiseProcessWindow(pid, runScript)))
      return { success: true, target: 'terminal-app' }
    if (!isInteractive || !(await isDirectory(path, systemIo))) return { success: false }
    return openTerminal(path, undefined)
  }
  const interactions = new OfficeInteractions({
    snapshot: () => host.snapshot(),
    orca: new OrcaTerminals(orcaCli.exec),
    openTerminalRunning,
    processStart,
    raiseOrca: orcaCli.raise,
    platform,
    openFolder: async (path, pid) => {
      if (isWindows) return showOnWindows(path, pid)
      const terminal = pid === null ? undefined : await terminalOf(pid)
      // Opening the folder types `cd` into the terminal app, which a view-only page may not.
      if (isInteractive) {
        // The path came from a file on disk: only a folder that exists is handed to `open`.
        const isFolder = await isDirectory(path, systemIo)
        return isFolder ? openTerminal(path, terminal) : { success: false }
      }
      return { ...(await raiseTerminal(terminal)), target: 'terminal-app' }
    }
  })

  return {
    subscribe: (listener) => {
      const snapshot = host.snapshot()
      if (snapshot) listener({ type: 'hello', v: 1, snapshot })
      return host.onMessage(listener)
    },
    focus: (agentKey) => interactions.focus(asString(agentKey)),
    send: (sessionKey, text) => interactions.send(asString(sessionKey), asString(text)),
    respond: async (sessionKey, decision, fingerprint) =>
      isDecision(decision)
        ? interactions.respond(asString(sessionKey), decision, asString(fingerprint))
        : INVALID,
    peek: (sessionKey) => interactions.peek(asString(sessionKey)),
    startAgent: async (projectKey, provider) =>
      isProvider(provider) ? interactions.start(asString(projectKey), provider) : INVALID,
    focusProcess: (owner) => interactions.focusProcess(owner),
    processStart,
    paneKeyOf: (pid) =>
      orcaEnvironmentOf(pid, { exec, treeOf: processTreeOf(runScript), platform }).then(
        ({ paneKey }) => paneKey,
        () => null
      )
  }
}
