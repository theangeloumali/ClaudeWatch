import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryNotes } from '../shared/office/types'
import { countMemoryNotes, MemoryNotesWatcher, memoryHomes } from './memory-notes'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memory-notes-'))
})
afterEach(() => rm(root, { recursive: true, force: true }))

async function note(
  home: string,
  project: string,
  name: string,
  mtimeMs?: number
): Promise<string> {
  const folder = join(home, 'projects', project, 'memory')
  await mkdir(folder, { recursive: true })
  const path = join(folder, name)
  await writeFile(path, 'private words')
  if (mtimeMs !== undefined) await utimes(path, mtimeMs / 1000, mtimeMs / 1000)
  return path
}

describe('countMemoryNotes', () => {
  it('counts notes across projects and reports the newest modification time', async () => {
    const home = join(root, 'claude')
    await note(home, 'a', 'one.md', 1_000_000)
    await note(home, 'a', 'two.md', 3_000_000)
    await note(home, 'b', 'three.md', 2_000_000)
    expect(await countMemoryNotes([home])).toEqual({ notes: 3, changedAt: 3_000_000 })
  })

  it('leaves the MEMORY.md index and non-markdown files out', async () => {
    const home = join(root, 'claude')
    await note(home, 'a', 'MEMORY.md', 9_000_000)
    await note(home, 'a', 'scratch.txt', 9_000_000)
    expect(await countMemoryNotes([home])).toEqual({ notes: 0, changedAt: 0 })
  })

  it('is zero for missing folders, an empty memory folder and no homes', async () => {
    const home = join(root, 'claude')
    await mkdir(join(home, 'projects', 'empty', 'memory'), { recursive: true })
    expect(await countMemoryNotes([home, join(root, 'absent')])).toEqual({ notes: 0, changedAt: 0 })
    expect(await countMemoryNotes([])).toEqual({ notes: 0, changedAt: 0 })
  })

  it('counts one home once however many names reach it', async () => {
    const home = join(root, 'claude')
    await note(home, 'a', 'one.md', 5_000)
    await symlink(home, join(root, 'alias'))
    expect(await countMemoryNotes([home, join(root, 'alias'), home])).toEqual({
      notes: 1,
      changedAt: 5_000
    })
  })

  it('refuses a note that links to a file outside its home', async () => {
    const home = join(root, 'claude')
    const outside = join(root, 'elsewhere.md')
    await writeFile(outside, 'secret')
    await mkdir(join(home, 'projects', 'a', 'memory'), { recursive: true })
    await symlink(outside, join(home, 'projects', 'a', 'memory', 'leak.md'))
    expect(await countMemoryNotes([home])).toEqual({ notes: 0, changedAt: 0 })
  })

  it('counts a note linked from another home only under the home that owns it', async () => {
    const owner = join(root, 'claude')
    const profile = join(root, 'profile')
    await note(owner, 'a', 'one.md', 7_000)
    await mkdir(profile, { recursive: true })
    await symlink(join(owner, 'projects'), join(profile, 'projects'))
    expect(await countMemoryNotes([owner, profile])).toEqual({ notes: 1, changedAt: 7_000 })
  })

  it('returns only numbers, never a name or path', async () => {
    const home = join(root, 'claude')
    await note(home, 'secret-project', 'secret-note.md', 1_000)
    expect(JSON.stringify(await countMemoryNotes([home]))).not.toMatch(/secret/)
  })
})

describe('memoryHomes', () => {
  it('lists the default login, CLAUDE_CONFIG_DIR and each Orca profile home', async () => {
    const orca = join(root, 'orca')
    await mkdir(join(orca, 'claude-profiles', 'p1', 'home'), { recursive: true })
    await mkdir(join(orca, 'claude-profiles', 'p2', 'home'), { recursive: true })
    await mkdir(join(orca, 'claude-profiles', 'no-home'), { recursive: true })
    expect(await memoryHomes({ HOME: '/h', CLAUDE_CONFIG_DIR: '/custom' }, orca, '/h')).toEqual([
      join('/h', '.claude'),
      '/custom',
      join(orca, 'claude-profiles', 'p1', 'home'),
      join(orca, 'claude-profiles', 'p2', 'home')
    ])
  })

  it('skips an unset CLAUDE_CONFIG_DIR and an Orca folder that is not installed', async () => {
    expect(await memoryHomes({}, join(root, 'no-orca'), '/h')).toEqual([join('/h', '.claude')])
  })
})

describe('MemoryNotesWatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const scanning = (values: MemoryNotes[]): (() => Promise<MemoryNotes>) => {
    let at = 0
    return vi.fn(async () => values[Math.min(at++, values.length - 1)] as MemoryNotes)
  }

  it('scans at once, then every 60 s in the background and every 15 s while live', async () => {
    const scan = scanning([{ notes: 1, changedAt: 5 }])
    const watcher = new MemoryNotesWatcher(scan)
    watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(scan).toHaveBeenCalledTimes(1)
    expect(watcher.current()).toEqual({ notes: 1, changedAt: 5 })
    await vi.advanceTimersByTimeAsync(59_000)
    expect(scan).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(scan).toHaveBeenCalledTimes(2)
    watcher.setLive(true)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(scan).toHaveBeenCalledTimes(3)
    watcher.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(scan).toHaveBeenCalledTimes(3)
  })

  it('tells listeners only when the count or its newest time changed', async () => {
    const watcher = new MemoryNotesWatcher(
      scanning([
        { notes: 1, changedAt: 5 },
        { notes: 1, changedAt: 5 },
        { notes: 0, changedAt: 0 }
      ])
    )
    const heard = vi.fn()
    watcher.onChange(heard)
    watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(heard).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(heard).toHaveBeenCalledTimes(2)
    expect(watcher.current()).toEqual({ notes: 0, changedAt: 0 })
    watcher.stop()
  })

  it('keeps the last count and keeps scanning when a scan fails', async () => {
    const scan = vi
      .fn<() => Promise<MemoryNotes>>()
      .mockResolvedValueOnce({ notes: 2, changedAt: 9 })
      .mockRejectedValueOnce(new Error('disk'))
      .mockResolvedValue({ notes: 3, changedAt: 12 })
    const watcher = new MemoryNotesWatcher(scan)
    watcher.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(watcher.current()).toEqual({ notes: 2, changedAt: 9 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(watcher.current()).toEqual({ notes: 3, changedAt: 12 })
    watcher.stop()
  })
})
