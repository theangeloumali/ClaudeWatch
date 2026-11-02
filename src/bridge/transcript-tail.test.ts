import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { sessionFromRegistry } from './claude'
import { diff } from './reducer'
import { liveSubagents, listAgentFiles } from './subagents'
import { claudeModel, parseTranscript, projectSlug, transcriptPath } from './transcript-tail'
import { fixtureIo, hostPath, registryEntry, session } from './__fixtures__/helpers'

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

describe('the model a transcript reports', () => {
  const reply = (model: unknown, extra: object = {}): string =>
    JSON.stringify({ type: 'assistant', message: { model, content: [] }, ...extra })

  it('is the newest assistant reply, and absent before there is one', () => {
    const tail = [reply('claude-sonnet-4-5'), reply('claude-opus-4-1-20250805')].join('\n')
    expect(parseTranscript(tail).model).toBe('claude-opus-4-1-20250805')
    expect(
      parseTranscript(JSON.stringify({ type: 'user', message: { content: [] } }))
    ).not.toHaveProperty('model')
  })

  it('ignores synthetic replies and anything that is not a plain model name', () => {
    const tail = [reply('claude-opus-4-1'), reply('<synthetic>'), reply({ id: 1 }), reply('a\nb')]
    expect(parseTranscript(tail.join('\n')).model).toBe('claude-opus-4-1')
  })

  it('reaches the session as its selected model, and only when known', () => {
    const known = parseTranscript(reply('claude-opus-4-1'))
    expect(sessionFromRegistry(registryEntry(), known, [], '/repo', null).selectedModel).toEqual({
      providerId: 'claude',
      modelId: 'claude-opus-4-1'
    })
    const unknown = parseTranscript('')
    expect(sessionFromRegistry(registryEntry(), unknown, [], '/repo', null)).not.toHaveProperty(
      'selectedModel'
    )
  })

  it('goes out in the next patch when the session changes model', () => {
    const before = { rev: 1, generatedAtMs: 1, sessions: [session('a')], sources: [] }
    const switched = { ...session('a'), selectedModel: claudeModel('claude-opus-4-1') }
    const after = { ...before, rev: 2, sessions: [switched] }
    expect(diff(before, after, 2).upserts).toEqual([switched])
  })

  it('reaches a subagent from its own transcript', async () => {
    const agents = hostPath('/t/subagents')
    const io = fixtureIo({
      [join(agents, 'agent-m.meta.json')]: JSON.stringify({ agentType: 'ravi' }),
      [join(agents, 'agent-m.jsonl')]: reply('claude-haiku-4-5')
    })
    const files = await listAgentFiles(hostPath('/t.jsonl'), io)
    expect(await liveSubagents(files, io, 2000)).toEqual([
      {
        id: 'm',
        type: 'ravi',
        activity: 'thinking',
        selectedModel: { providerId: 'claude', modelId: 'claude-haiku-4-5' }
      }
    ])
  })
})
