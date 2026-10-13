import { describe, expect, it } from 'vitest'
import { folderKey } from './process-folders'
import { projectKey } from '../shared/office/project-key'

describe('folderKey', () => {
  it('folds a Windows folder for case, separator and a trailing separator', () => {
    expect(folderKey('C:/Users/Ada/Repo\\', 'win32')).toBe('c:\\users\\ada\\repo')
  })

  it('keeps a drive root a root, not the drive-relative C:', () => {
    expect(folderKey('C:\\', 'win32')).toBe('c:\\')
    expect(folderKey('C:/', 'win32')).toBe('c:\\')
  })

  it('names the same folder projectKey does', () => {
    for (const [a, b] of [
      ['C:\\Repo\\', 'c:/repo'],
      ['C:\\', 'c:/']
    ]) {
      expect(folderKey(a, 'win32')).toBe(folderKey(b, 'win32'))
      expect(projectKey(a)).toBe(projectKey(b))
    }
  })

  it('leaves macOS folders byte for byte', () => {
    expect(folderKey('/Users/Ada/Repo/', 'darwin')).toBe('/Users/Ada/Repo/')
  })
})
