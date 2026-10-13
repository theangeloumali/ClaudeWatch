const FNV_OFFSET_BASIS = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn
const utf8 = new TextEncoder()

function fnv1a64(text: string): string {
  let hash = FNV_OFFSET_BASIS
  for (const byte of utf8.encode(text)) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_PRIME) & UINT64_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

// Floor identity for a project. Callers pass the resolved project root (the bridge
// resolves the git common dir); this stays pure so the renderer can import it.
export function projectKey(projectRoot: string): string {
  return `p_${fnv1a64(withoutTrailingSeparators(projectRoot))}`
}

// A bare root keeps one separator: '/' must not hash as '', nor 'C:\' as the drive-relative 'C:'.
function withoutTrailingSeparators(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  if (trimmed === '' || /^[A-Za-z]:$/.test(trimmed)) return path.slice(0, trimmed.length + 1)
  return trimmed
}

// An agent's worktree lives inside its project; the project is the folder above `.claude`.
const WORKTREE_FOLDER = /[\\/]\.claude[\\/](?:\.worktree|worktrees)[\\/].*$/

export function projectRootOf(path: string): string {
  return path.replace(WORKTREE_FOLDER, '')
}
