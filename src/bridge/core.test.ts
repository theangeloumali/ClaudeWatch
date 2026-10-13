import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import { resolveProject } from './project-root'
import { parseTranscript } from './transcript-tail'
import { toolCategory, toolActivity } from './tool-category'
import { reduce, diff, emptySnapshot } from './reducer'
import { sessionFromRegistry } from './claude'
import { fixtureIo, gitPath, registryEntry, session } from './__fixtures__/helpers'
import type { BridgeIo } from './io'

describe('transcript', () => {
  it('pairs by id, preserves earlier open tools, and drops all content', async () => {
    const tail = await readFile(new URL('./__fixtures__/transcript.jsonl', import.meta.url), 'utf8')
    expect(parseTranscript(tail)).toEqual({
      tool: { name: 'Read', category: 'read' },
      error: true
    })
    const ref = sessionFromRegistry(registryEntry(), parseTranscript(tail), [], '/repo', null)
    expect(JSON.stringify(ref)).not.toMatch(/SECRET_PROMPT|SECRET_INPUT|SECRET_RESULT/)
  })
  it('reports last-tool errors until a new tool starts and ignores malformed lines', () => {
    const use = (id: string) =>
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id, name: 'Bash' }] }
      })
    const result = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true }] }
    })
    expect(parseTranscript(`${use('a')}\n${result}\nbroken`).error).toBe(true)
    expect(parseTranscript(`${use('a')}\n${result}\n${use('b')}`).error).toBe(false)
  })
  it.each([
    ['Read', 'read', 'reading'],
    ['Grep', 'read', 'reading'],
    ['NotebookEdit', 'edit', 'editing'],
    ['BashOutput', 'run', 'running'],
    ['WebFetch', 'web', 'searching'],
    ['Agent', 'agent', 'delegating'],
    ['custom', 'other', 'running']
  ])('maps %s', (name, category, activity) => {
    expect(toolCategory(name)).toBe(category)
    expect(toolActivity(toolCategory(name))).toBe(activity)
  })
})

describe.each([
  ['darwin', posix, '/repo', '/'],
  ['win32', win32, 'C:\\repo', 'C:\\']
] as const)('project roots on %s', (platform, path, repo, top) => {
  const worktree = path.join(repo, '.claude', '.worktree', 'feature')
  const gitdir = `gitdir: ${gitPath(path.join(repo, '.git', 'worktrees', 'feature'))}\n`
  const resolve = (cwd: string, io: BridgeIo) => resolveProject(cwd, io, Date.now(), platform)

  it('walks to a normal repo', async () => {
    const io = fixtureIo({ [path.join(repo, '.git')]: null })
    expect(await resolve(path.join(repo, 'src'), io)).toEqual({ root: repo, worktree: null })
  })
  it('resolves a worktree gitdir and keeps its own top directory', async () => {
    const io = fixtureIo({ [path.join(worktree, '.git')]: gitdir })
    expect(await resolve(path.join(worktree, 'src'), io)).toEqual({ root: repo, worktree })
  })
  it('ignores a commondir that is not one short line, or a root that is not a directory', async () => {
    const files = { [path.join(worktree, '.git')]: gitdir, [path.join(repo, '.git')]: null }
    const notAFolder = gitPath(path.join(top, 'not', 'a', 'folder', '.git'))
    for (const commondir of ['line one\nSECRET=hidden\n', 'x'.repeat(2000), notAFolder]) {
      const io = fixtureIo({
        ...files,
        [path.join(repo, '.git', 'worktrees', 'feature', 'commondir')]: commondir
      })
      expect(await resolve(path.join(worktree, 'src'), io)).toEqual({ root: repo, worktree })
    }
  })
  it('uses cwd for non-repositories', async () => {
    const plain = path.join(top, 'plain')
    expect(await resolve(plain, fixtureIo())).toEqual({ root: plain, worktree: null })
  })
})

describe('a Windows worktree whose git folder is on another machine', () => {
  const onShare = (paths: string[]) => paths.filter((path) => path.startsWith('\\\\'))
  function watched(files: Record<string, string | null>) {
    const io = fixtureIo(files)
    const stat = vi.spyOn(io, 'stat')
    const readText = vi.spyOn(io, 'readText')
    const asked = () => [...stat.mock.calls, ...readText.mock.calls].map(([path]) => path)
    return { io, asked }
  }

  it.each([
    '\\\\host\\share\\repo\\.git\\worktrees\\wt',
    '//host/share/repo/.git/worktrees/wt',
    '\\\\?\\UNC\\host\\share\\x',
    '\\\\.\\pipe\\x'
  ])('is its own project, and nothing at %s is asked for', async (gitdir) => {
    const { io, asked } = watched({ 'C:\\work\\wt\\.git': `gitdir: ${gitdir}\n` })
    expect(await resolveProject('C:\\work\\wt\\src', io, Date.now(), 'win32')).toEqual({
      root: 'C:\\work\\wt',
      worktree: null
    })
    expect(onShare(asked())).toEqual([])
  })
  it('does not follow a commondir that points at another machine', async () => {
    const { io, asked } = watched({
      'C:\\work\\wt\\.git': 'gitdir: C:/repo/.git/worktrees/wt\n',
      'C:\\repo\\.git\\worktrees\\wt\\commondir': '\\\\host\\share\\repo\\.git\n',
      'C:\\repo\\.git': null
    })
    expect(await resolveProject('C:\\work\\wt', io, Date.now(), 'win32')).toEqual({
      root: 'C:\\repo',
      worktree: 'C:\\work\\wt'
    })
    expect(onShare(asked())).toEqual([])
  })
  it('follows a git folder on the share the session itself works on', async () => {
    const { io, asked } = watched({
      '\\\\host\\share\\wt\\.git': 'gitdir: \\\\host\\share\\repo\\.git\\worktrees\\wt\n',
      '\\\\host\\share\\repo\\.git': null
    })
    expect(await resolveProject('\\\\host\\share\\wt', io, Date.now(), 'win32')).toEqual({
      root: '\\\\host\\share\\repo',
      worktree: '\\\\host\\share\\wt'
    })
    expect(onShare(asked()).length).toBeGreaterThan(1)
  })
})

describe('the fixture io', () => {
  it('takes either separator for the other, so any platform’s paths find a fixture', async () => {
    const io = fixtureIo({ '/claude/sessions/42.json': '{}', 'C:\\work\\repo\\.git': null })
    expect(await io.readText('\\claude\\sessions\\42.json')).toBe('{}')
    expect(await io.list('\\claude')).toEqual(['sessions'])
    expect(await io.list('/claude/sessions')).toEqual(['42.json'])
    expect((await io.stat('C:/work/repo/.git')).directory).toBe(true)
    expect((await io.stat('C:\\work')).directory).toBe(true)
    await expect(io.readText('/claude/sessions')).rejects.toThrow('missing')
  })
})

describe('reducer and diff', () => {
  it('upserts changed/new sessions and removes absent ones', () => {
    const prev = reduce(emptySnapshot(), {
      now: 10,
      sessions: [session('a'), session('b')],
      sources: []
    })
    const changed = { ...session('a'), activity: 'reading' as const }
    const next = reduce(prev, { now: 20, sessions: [changed, session('c')], sources: [] })
    expect(next.rev).toBe(2)
    expect(diff(prev, next, 3)).toEqual({
      type: 'patch',
      v: 1,
      seq: 3,
      upserts: [changed, session('c')],
      removed: ['claude:b']
    })
    expect(diff(next, next, 4)).toEqual({ type: 'patch', v: 1, seq: 4, upserts: [], removed: [] })
  })
  it('carries source health in a patch only when it changed', () => {
    const healthy = [{ id: 'orca', ok: true, detail: 'available' }]
    const prev = reduce(emptySnapshot(), { now: 10, sessions: [session('a')], sources: healthy })
    const same = reduce(prev, { now: 20, sessions: [session('a')], sources: healthy })
    expect(diff(prev, same, 1)).not.toHaveProperty('sources')

    const failing = [{ id: 'orca', ok: false, detail: 'unavailable' }]
    const next = reduce(prev, { now: 20, sessions: [session('a')], sources: failing })
    expect(diff(prev, next, 2)).toMatchObject({ upserts: [], removed: [], sources: failing })
  })
  it('marks busy to idle done for two minutes, without sliding expiry', () => {
    const prev = reduce(emptySnapshot(), {
      now: 1000,
      sessions: [{ ...session('a'), activity: 'thinking' }],
      sources: []
    })
    const idle = { ...session('a'), updatedAtMs: 2000 }
    const next = reduce(prev, { now: 2000, sessions: [idle], sources: [] })
    expect(next.sessions[0].attention).toBe('done')
    expect(reduce(next, { now: 3000, sessions: [idle], sources: [] }).sessions[0].attention).toBe(
      'done'
    )
    expect(reduce(next, { now: 123000, sessions: [idle], sources: [] }).sessions[0].attention).toBe(
      'none'
    )
  })
  it('marks done a session whose last write looks a moment ahead of the tick', () => {
    const prev = reduce(emptySnapshot(), {
      now: 1000,
      sessions: [{ ...session('a'), activity: 'thinking' }],
      sources: []
    })
    const idle = { ...session('a'), updatedAtMs: 2050 }
    expect(reduce(prev, { now: 2000, sessions: [idle], sources: [] }).sessions[0].attention).toBe(
      'done'
    )
  })
})

it('keeps last-tool errors when an older parallel tool remains open', () => {
  const tail = [
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'a', name: 'Read' },
          { type: 'tool_use', id: 'b', name: 'Edit' }
        ]
      }
    },
    {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'b', is_error: true }] }
    }
  ]
    .map((line) => JSON.stringify(line))
    .join('\n')
  expect(parseTranscript(tail).error).toBe(true)
})
it('unknown tool names cannot access inherited category entries', () => {
  expect(toolCategory('constructor')).toBe('other')
  expect(toolCategory('toString')).toBe('other')
})
it('registry idle status overrides unfinished tools from the bounded tail', () => {
  const ref = sessionFromRegistry(
    { ...registryEntry(), status: 'idle' },
    { tool: { name: 'Bash', category: 'run' }, error: false },
    [],
    '/repo',
    null
  )
  expect(ref.activity).toBe('idle')
})

it('clears failed-tool attention when Claude becomes idle', () => {
  const ref = sessionFromRegistry(
    { ...registryEntry(), status: 'idle' },
    { tool: null, error: true },
    [],
    '/company/repo',
    '/company/repo/.claude/.worktree/task'
  )
  expect(ref.attention).toBe('none')
  expect(ref).toMatchObject({
    projectRoot: '/company/repo',
    projectLabel: 'repo',
    companyLabel: 'company'
  })
})

it('shows a busy lead with live subagents and no open tool as delegating, not thinking', () => {
  // Subagents started in the background answer their Agent call at once: the lead then waits.
  const crew = [{ id: 'a1', type: 'ravi', activity: 'editing' as const }]
  const busy = { ...registryEntry(), status: 'busy' as const }
  expect(
    sessionFromRegistry(busy, { tool: null, error: false }, crew, '/repo', null).activity
  ).toBe('delegating')
  expect(sessionFromRegistry(busy, { tool: null, error: false }, [], '/repo', null).activity).toBe(
    'thinking'
  )
})

it('strips control and bidi override characters from a Claude session name and its folder', () => {
  const named = { ...registryEntry(), name: 'fix\u202E the\u0007 bug\u2069' }
  const tool = { tool: null, error: false }
  expect(sessionFromRegistry(named, tool, [], '/repo', null).name).toBe('fix the bug')
  const unnamed = { ...registryEntry(), name: '', cwd: '/x/ap\u2066p\u0000' }
  expect(sessionFromRegistry(unnamed, tool, [], '/repo', null).name).toBe('app')
})
