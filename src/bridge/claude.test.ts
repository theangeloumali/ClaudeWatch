import { join } from 'node:path'
import { expect, it } from 'vitest'
import { sessionFromRegistry } from './claude'
import { collectClaude, type RegistryEntry } from './registry'
import { parseTranscript, projectSlug } from './transcript-tail'
import { fixtureIo, hostPath, hostTable, isTableQuery, registryEntry } from './__fixtures__/helpers'

const toolUse = (id: string, name: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input: {} }] }
  })
const toolResult = (id: string): string =>
  JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id }] }
  })
const tail = (...lines: string[]): string => lines.join('\n')

it('two consecutive Edit calls carry different callIds', () => {
  const first = parseTranscript(toolUse('toolu_first', 'Edit'))
  const second = parseTranscript(
    tail(toolUse('toolu_first', 'Edit'), toolResult('toolu_first'), toolUse('toolu_second', 'Edit'))
  )
  expect(first.tool).toEqual({ name: 'Edit', category: 'edit', callId: 'toolu_first' })
  expect(second.tool).toEqual({ name: 'Edit', category: 'edit', callId: 'toolu_second' })
})

it('carries the call id only as the current tool’s id, never in a name or label', () => {
  const session = sessionFromRegistry(
    registryEntry(),
    parseTranscript(toolUse('toolu_opaque', 'Edit')),
    [],
    '/repo',
    null
  )
  expect(session.currentTool?.callId).toBe('toolu_opaque')
  expect(JSON.stringify(session).split('toolu_opaque')).toHaveLength(2)
})

// The CLI writes a limit as a synthetic assistant reply flagged as an API error.
const limitReply = (resetsAtSeconds?: number): string =>
  JSON.stringify({
    type: 'assistant',
    isApiErrorMessage: true,
    error: 'rate_limit',
    apiErrorStatus: 429,
    ...(resetsAtSeconds !== undefined && {
      quotaLimits: { status: 'rejected', resetsAt: resetsAtSeconds }
    }),
    message: { model: '<synthetic>', content: [{ type: 'text', text: 'LIMIT_NOTICE' }] }
  })
const reply = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'REPLY_TEXT' }] }
})
const prompt = JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'text', text: 'PROMPT_TEXT' }] }
})
const idle: RegistryEntry = { ...registryEntry(), status: 'idle' }
const attentionOf = (entry: RegistryEntry, ...lines: string[]) =>
  sessionFromRegistry(entry, parseTranscript(tail(...lines)), [], '/repo', null).attention

it('a usage-limit message in the transcript tail sets attention limited', () => {
  const work = [toolUse('toolu_a', 'Edit'), toolResult('toolu_a')]
  expect(attentionOf(idle, ...work, limitReply(1_790_000_000))).toBe('limited')
  expect(attentionOf(idle, ...work, limitReply())).toBe('limited')
})

it('keeps limited through a new prompt until a later reply proceeds', () => {
  expect(attentionOf(idle, limitReply(), prompt)).toBe('limited')
  expect(attentionOf(idle, limitReply(), prompt, reply)).toBe('none')
})

it('ranks a pending permission above a limit, and a limit above an older tool error', () => {
  const asking: RegistryEntry = { ...idle, status: 'waiting', waitingFor: 'approval for Bash' }
  expect(attentionOf(asking, limitReply())).toBe('permission')
  const failed = JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_a', is_error: true }] }
  })
  const busy = registryEntry()
  expect(attentionOf(busy, toolUse('toolu_a', 'Bash'), failed, limitReply())).toBe('limited')
})

it('takes no other API error for a limit', () => {
  const serverError = JSON.stringify({
    type: 'assistant',
    isApiErrorMessage: true,
    error: 'server_error',
    message: { model: '<synthetic>', content: [{ type: 'text', text: 'API_ERROR_TEXT' }] }
  })
  expect(attentionOf(idle, serverError)).toBe('none')
})

it('holds a live session limited until the limit resets, then lets go', async () => {
  const root = hostPath('/claude')
  const entry: RegistryEntry = { ...registryEntry(process.platform), status: 'idle' }
  const resetsAtMs = Date.parse('2026-10-17T12:00:00Z')
  const io = fixtureIo({
    [join(root, 'sessions', '42.json')]: JSON.stringify(entry),
    [join(root, 'projects', projectSlug(entry.cwd), `${entry.sessionId}.jsonl`)]: limitReply(
      resetsAtMs / 1000
    ),
    [hostPath('/repo/.git')]: null
  })
  io.exec = async (program, args) =>
    isTableQuery(program, args)
      ? hostTable([{ pid: 42, start: entry.procStart, command: 'claude' }])
      : ''
  const attentionAt = async (now: number) =>
    (await collectClaude([root], io, now)).sessions.map((session) => session.attention)
  expect(await attentionAt(resetsAtMs - 1)).toEqual(['limited'])
  expect(await attentionAt(resetsAtMs)).toEqual(['none'])
})
