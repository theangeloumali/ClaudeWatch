import { describe, it, expect } from 'vitest'
import { projectKey, projectRootOf } from './project-key'

describe('projectKey', () => {
  it('is stable for the same project root', () => {
    expect(projectKey('/Users/dev/ClaudeWatch')).toBe(projectKey('/Users/dev/ClaudeWatch'))
  })

  it('prefixes a 16-digit hex FNV-1a hash', () => {
    expect(projectKey('/Users/dev/ClaudeWatch')).toMatch(/^p_[0-9a-f]{16}$/)
  })

  it('ignores trailing slashes', () => {
    expect(projectKey('/Users/dev/ClaudeWatch/')).toBe(projectKey('/Users/dev/ClaudeWatch'))
  })

  it('keeps the keys already in use on macOS', () => {
    expect(projectKey('/Users/dev/ClaudeWatch')).toBe('p_2ffc695f3d2a18c0')
    expect(projectKey('/Users/dev/ClaudeWatch/')).toBe('p_2ffc695f3d2a18c0')
    expect(projectKey('/')).toBe('p_af63a24c860189fe')
  })

  it('ignores trailing backslashes on a Windows root', () => {
    expect(projectKey('C:\\Users\\dev\\ClaudeWatch\\')).toBe(
      projectKey('C:\\Users\\dev\\ClaudeWatch')
    )
    expect(projectKey('C:\\x\\\\')).toBe(projectKey('C:\\x'))
  })

  it('never turns a bare root into the empty key, or into a drive-relative one', () => {
    const empty = projectKey('')
    expect(projectKey('/')).not.toBe(empty)
    expect(projectKey('//')).toBe(projectKey('/'))
    expect(projectKey('C:\\')).not.toBe(empty)
    expect(projectKey('C:\\')).not.toBe(projectKey('C:'))
    expect(projectKey('C:\\\\')).toBe(projectKey('C:\\'))
  })

  it('treats a Windows root case-blind and either slash alike, as editors report it both ways', () => {
    const key = projectKey('c:\\repo')
    expect(projectKey('C:\\REPO\\')).toBe(key)
    expect(projectKey('C:/repo')).toBe(key)
    expect(projectKey('C:\\')).toBe(projectKey('c:/'))
    expect(projectKey('\\\\Server\\Share\\repo')).toBe(projectKey('\\\\server\\share\\REPO\\'))
    expect(projectKey('c:\\repo')).not.toBe(projectKey('c:\\other'))
  })

  it('keeps POSIX roots case-sensitive, since macOS and Linux folders can differ by case', () => {
    expect(projectKey('/Users/dev/Repo')).not.toBe(projectKey('/Users/dev/repo'))
  })

  it('separates different roots', () => {
    expect(projectKey('/Users/dev/a')).not.toBe(projectKey('/Users/dev/b'))
  })

  it('matches the FNV-1a 64-bit reference value for the empty string', () => {
    expect(projectKey('')).toBe('p_cbf29ce484222325')
  })
})

describe('projectRootOf', () => {
  it.each([
    ['/Users/dev/App/.claude/.worktree/fix-login', '/Users/dev/App'],
    ['/Users/dev/App/.claude/worktrees/agent-a1/src/main', '/Users/dev/App'],
    ['C:\\dev\\App\\.claude\\worktrees\\agent-a1', 'C:\\dev\\App']
  ])('strips an agent worktree folder from %s', (path, root) => {
    expect(projectRootOf(path)).toBe(root)
  })

  it('leaves a path outside a worktree as it is', () => {
    expect(projectRootOf('/Users/dev/App')).toBe('/Users/dev/App')
    expect(projectRootOf('/Users/dev/App/.claude/skills')).toBe('/Users/dev/App/.claude/skills')
  })
})
