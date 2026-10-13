import { basename, dirname, posix, win32 } from 'node:path'
import { projectKey } from '../shared/office/project-key'
import type { SessionRef } from '../shared/office/types'
import { type BridgeIo, isDirectory, isMissing } from './io'

const COMMONDIR_MAX_BYTES = 1024

interface Project {
  root: string
  worktree: string | null
}

type Placement = Pick<
  SessionRef,
  'projectKey' | 'projectLabel' | 'projectRoot' | 'companyKey' | 'companyLabel' | 'worktree'
>
// The project office and the company a session belongs to: the company is the folder holding the project.
export function placementOf({ root, worktree }: Project): Placement {
  return {
    projectKey: projectKey(root),
    projectLabel: basename(root),
    projectRoot: root,
    companyKey: projectKey(dirname(root)),
    companyLabel: basename(dirname(root)),
    worktree
  }
}

const PROJECT_TTL_MS = 60_000
const projects = new WeakMap<BridgeIo, Map<string, { project: Promise<Project>; until: number }>>()

// Every tick asks where each session's folder belongs, and the answer costs a stat per folder
// level: it is kept for a minute. A failed look-up is not kept.
export function resolveProject(
  cwd: string,
  io: BridgeIo,
  now = Date.now(),
  platform: NodeJS.Platform = process.platform
): Promise<Project> {
  let known = projects.get(io)
  if (!known) projects.set(io, (known = new Map()))
  const folders = known
  const key = `${platform}:${cwd}`
  const cached = folders.get(key)
  if (cached && now < cached.until) return cached.project
  // A folder whose sessions left is never asked for again, so it is dropped here.
  for (const [folder, { until }] of folders) if (now >= until) folders.delete(folder)
  const project = findProject(cwd, io, platform === 'win32' ? win32 : posix)
  folders.set(key, { project, until: now + PROJECT_TTL_MS })
  project.catch(() => {
    if (folders.get(key)?.project === project) folders.delete(key)
  })
  return project
}

// A UNC path names another machine, and opening it hands that machine this user's NTLM response
// on every look-up: one is followed only on the share the session itself works on.
function isElsewhere(target: string, folder: string, path: typeof posix): boolean {
  if (path !== win32 || !target.startsWith('\\\\')) return false
  const share = (unc: string): string => unc.split('\\').slice(2, 4).join('\\').toLowerCase()
  return !folder.startsWith('\\\\') || share(target) !== share(folder)
}

// The folder's own platform's paths, whichever platform reads them.
async function findProject(cwd: string, io: BridgeIo, path: typeof posix): Promise<Project> {
  const { dirname, join, resolve } = path
  let directory = resolve(cwd)
  while (true) {
    const marker = join(directory, '.git')
    try {
      const info = await io.stat(marker)
      if (info.directory) return { root: directory, worktree: null }
      const gitdir = (await io.readText(marker)).match(/^gitdir:\s*(.+)$/m)?.[1]
      if (gitdir) {
        const target = resolve(directory, gitdir.trim())
        if (isElsewhere(target, directory, path)) return { root: directory, worktree: null }
        const fallback = dirname(dirname(dirname(target)))
        let root = fallback
        try {
          const pointer = join(target, 'commondir')
          // git writes one short path here; anything else is not git's and is not read into a root.
          if ((await io.stat(pointer)).size <= COMMONDIR_MAX_BYTES) {
            const line = (await io.readText(pointer)).trim()
            const common = resolve(target, line)
            if (line && !line.includes('\n') && !isElsewhere(common, directory, path))
              root = dirname(common)
          }
        } catch (error) {
          if (!isMissing(error)) throw error
        }
        if (!(await isDirectory(root, io))) root = fallback
        return { root, worktree: directory === root ? null : directory }
      }
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    const parent = dirname(directory)
    if (parent === directory) return { root: resolve(cwd), worktree: null }
    directory = parent
  }
}
