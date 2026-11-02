import { readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import type { MemoryNotes } from '../shared/office/types'
import { orcaDataFolder } from './accounts'

const NO_NOTES: MemoryNotes = { notes: 0, changedAt: 0 }
const INDEX_FILE = 'MEMORY.md'

// Folder listings and stat only: a note's words, name and path never leave this module.
export interface MemoryIo {
  list(path: string): Promise<string[]>
  realpath(path: string): Promise<string>
  mtimeMs(path: string): Promise<number>
}

export const systemMemoryIo: MemoryIo = {
  list: (path) => readdir(path),
  realpath: (path) => realpath(path),
  mtimeMs: async (path) => (await stat(path)).mtimeMs
}

const isInside = (home: string, target: string): boolean => {
  const path = relative(home, target)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

// A folder that is absent or unreadable holds no notes; it is never an error.
const listOrEmpty = (io: MemoryIo, path: string): Promise<string[]> => io.list(path).catch(() => [])

// Notes under one home, by real path: a link out of the home is refused.
async function notesOf(home: string, io: MemoryIo): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  for (const project of await listOrEmpty(io, join(home, 'projects'))) {
    const folder = join(home, 'projects', project, 'memory')
    for (const name of await listOrEmpty(io, folder)) {
      if (name === INDEX_FILE || !name.endsWith('.md')) continue
      try {
        const target = await io.realpath(join(folder, name))
        if (isInside(home, target)) found.set(target, await io.mtimeMs(target))
      } catch {
        // Deleted between the listing and the stat, or unreadable: not a note now.
      }
    }
  }
  return found
}

// How many memory notes the Claude homes hold, and when the newest changed (file time, not
// the clock, so a note written while the app was closed still reads as it was).
export async function countMemoryNotes(
  homes: readonly string[],
  io: MemoryIo = systemMemoryIo
): Promise<MemoryNotes> {
  const realHomes = new Set<string>()
  for (const home of homes) {
    try {
      realHomes.add(await io.realpath(home))
    } catch {
      // A home that is not there has no notes.
    }
  }
  const notes = new Map<string, number>()
  for (const home of realHomes) {
    for (const [path, mtimeMs] of await notesOf(home, io)) notes.set(path, mtimeMs)
  }
  if (notes.size === 0) return NO_NOTES
  return { notes: notes.size, changedAt: Math.max(...notes.values()) }
}

// Every Claude config folder a session can write notes under: the default login, the one
// CLAUDE_CONFIG_DIR names, and the home of each Orca profile.
export async function memoryHomes(
  env: Readonly<Record<string, string | undefined>>,
  orcaFolder: string,
  home: string = homedir()
): Promise<string[]> {
  const profiles = join(orcaFolder, 'claude-profiles')
  const orcaHomes: string[] = []
  for (const profile of (await listOrEmpty(systemMemoryIo, profiles)).sort()) {
    const profileHome = join(profiles, profile, 'home')
    if (
      await systemMemoryIo.list(profileHome).then(
        () => true,
        () => false
      )
    ) {
      orcaHomes.push(profileHome)
    }
  }
  const configured = env.CLAUDE_CONFIG_DIR ? [env.CLAUDE_CONFIG_DIR] : []
  return [join(home, '.claude'), ...configured, ...orcaHomes]
}

// The count over every home on this machine, as the Office feed wants it.
export const scanMemoryNotes = async (): Promise<MemoryNotes> =>
  countMemoryNotes(await memoryHomes(process.env, orcaDataFolder({ home: homedir() })))

// Scan every 15 s while a window or browser watches, every 60 s otherwise.
const LIVE_SCAN_MS = 15_000
const BACKGROUND_SCAN_MS = 60_000

// Keeps the latest count and tells listeners when it moves. One scan at a time: the next is
// timed from the end of the last, so a slow disk never stacks them.
export class MemoryNotesWatcher {
  private notes: MemoryNotes | undefined
  private isLive = false
  private isRunning = false
  private timer: NodeJS.Timeout | null = null
  private readonly listeners = new Set<() => void>()

  constructor(private readonly scan: () => Promise<MemoryNotes>) {}

  current(): MemoryNotes | undefined {
    return this.notes
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    void this.tick()
  }

  stop(): void {
    this.isRunning = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  // A change of pace restarts the wait at the new pace.
  setLive(isLive: boolean): void {
    if (isLive === this.isLive) return
    this.isLive = isLive
    if (this.isRunning && this.timer) this.schedule()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    const wait = this.isLive ? LIVE_SCAN_MS : BACKGROUND_SCAN_MS
    this.timer = setTimeout(() => void this.tick(), wait)
    this.timer.unref()
  }

  private async tick(): Promise<void> {
    this.timer = null
    try {
      const next = await this.scan()
      if (!this.isRunning) return
      const previous = this.notes
      this.notes = next
      if (previous?.notes !== next.notes || previous.changedAt !== next.changedAt) {
        for (const listener of this.listeners) listener()
      }
    } catch {
      // The last count stands until the disk answers again.
    }
    if (this.isRunning) this.schedule()
  }
}
