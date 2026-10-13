import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { projectSlug, transcriptPath } from './transcript-tail'
import { fixtureIo, hostPath } from './__fixtures__/helpers'

const root = hostPath('/claude')
const repo = hostPath('/repo')

it('encodes all non-alphanumeric cwd characters without scanning projects', async () => {
  const path = join(root, 'projects', '-repo-my-project--a-', 'session.jsonl')
  const io = fixtureIo({ [path]: '' })
  const list = vi.spyOn(io, 'list')
  expect(await transcriptPath(root, '/repo/my_project (a)', 'session', io)).toBe(path)
  expect(list).not.toHaveBeenCalled()
})
it('names a Windows folder the way Claude Code does, drive and separators included', () => {
  expect(projectSlug('C:\\Users\\me\\ZKidz\\ClaudeWatch')).toBe('C--Users-me-ZKidz-ClaudeWatch')
})
it('caches fallback paths per root, cwd and session without caching misses', async () => {
  const path = join(root, 'projects', 'legacy', 'session.jsonl')
  const files: Record<string, string | null> = { [path]: '' }
  const io = fixtureIo(files)
  const stat = vi.spyOn(io, 'stat')
  expect(await transcriptPath(root, repo, 'session', io)).toBe(path)
  const reads = stat.mock.calls.length
  expect(await transcriptPath(root, repo, 'session', io)).toBe(path)
  expect(stat).toHaveBeenCalledTimes(reads)
  expect(await transcriptPath(root, repo, 'new', io)).toBeNull()
  const direct = join(root, 'projects', projectSlug(repo), 'new.jsonl')
  files[direct] = ''
  expect(await transcriptPath(root, repo, 'new', io)).toBe(direct)
})
