import { describe, expect, it } from 'vitest'
import { getProjectName, pathSegments } from '../lib/utils'

describe('pathSegments', () => {
  it('splits on either separator and drops empty segments', () => {
    expect(pathSegments('/Users/a/ZKidz/')).toEqual(['Users', 'a', 'ZKidz'])
    expect(pathSegments('C:\\Users\\a\\ZKidz\\')).toEqual(['C:', 'Users', 'a', 'ZKidz'])
    expect(pathSegments('C:/Users/a\\ZKidz')).toEqual(['C:', 'Users', 'a', 'ZKidz'])
  })
})

describe('getProjectName', () => {
  it('names a project by its parent and its folder', () => {
    expect(getProjectName('/Users/a/ZKidz/ClaudeWatch')).toBe('ZKidz/ClaudeWatch')
  })

  it('reads a Windows path the same way', () => {
    expect(getProjectName('C:\\Users\\a\\ZKidz\\ClaudeWatch')).toBe('ZKidz/ClaudeWatch')
  })

  it('ignores a trailing separator', () => {
    expect(getProjectName('/Users/a/ZKidz/ClaudeWatch/')).toBe('ZKidz/ClaudeWatch')
    expect(getProjectName('C:\\Users\\a\\ZKidz\\ClaudeWatch\\')).toBe('ZKidz/ClaudeWatch')
  })

  it('keeps a lone folder, and a bare root, as they are', () => {
    expect(getProjectName('repo')).toBe('repo')
    expect(getProjectName('/')).toBe('/')
  })
})
