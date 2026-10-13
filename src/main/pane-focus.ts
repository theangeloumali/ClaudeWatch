import type { FocusResult } from '../shared/office/types'
import type { ClaudeInstance } from '../renderer/lib/types'
import type { PaneOwner } from './office-interactions'

interface PaneFocusDeps {
  // The session tracker's current list: the only processes a caller may name.
  instances: () => Pick<ClaudeInstance, 'pid' | 'projectPath'>[]
  processStart: (pid: number) => Promise<number | null>
  // The Orca pane that process runs in, or null when it runs in none.
  paneKeyOf: (pid: number) => Promise<string | null>
  focusProcess: (owner: PaneOwner) => Promise<FocusResult>
}

const UNKNOWN: FocusResult = { success: false, reason: 'unknown-session' }

// The jump for surfaces that know a pid rather than an Office session: dashboard rows, tray
// rows and notification clicks. It works with the Office window, and so the bridge, closed.
export class PaneFocus {
  constructor(private readonly deps: PaneFocusDeps) {}

  // `pid` may come from a renderer: only a tracked process is acted on, and the folder is the
  // tracker's own record of it.
  async focus(pid: unknown): Promise<FocusResult> {
    const instance = this.deps.instances().find((tracked) => tracked.pid === pid)
    if (!instance?.projectPath) return UNKNOWN
    // Read before the pane key and checked again by focusProcess, so the key is this process's.
    const startedAtMs = await this.deps.processStart(instance.pid)
    if (startedAtMs === null) return UNKNOWN
    const orcaPaneKey = await this.deps.paneKeyOf(instance.pid)
    return this.deps.focusProcess({
      provider: 'claude',
      cwd: instance.projectPath,
      projectRoot: instance.projectPath,
      host: orcaPaneKey ? 'orca' : 'unknown',
      pid: instance.pid,
      startedAtMs,
      orcaPaneKey
    })
  }
}
