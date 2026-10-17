import { expect, it } from 'vitest'
import { parseCodexActivity } from '../codex'

const records = (payloads: Record<string, unknown>[]): string =>
  payloads
    .map((payload) =>
      JSON.stringify({ type: 'response_item', timestamp: '2026-10-17T01:00:00Z', payload })
    )
    .join('\n')

const first = { type: 'custom_tool_call', call_id: 'call-first', name: 'apply_patch' }
const closed = { type: 'custom_tool_call_output', call_id: 'call-first' }
const second = { type: 'custom_tool_call', call_id: 'call-second', name: 'apply_patch' }

it('two consecutive Edit calls carry different callIds', () => {
  expect(parseCodexActivity(records([first])).currentTool).toEqual({
    name: 'apply_patch',
    category: 'edit',
    callId: 'call-first'
  })
  expect(parseCodexActivity(records([first, closed, second])).currentTool).toEqual({
    name: 'apply_patch',
    category: 'edit',
    callId: 'call-second'
  })
})

const limitError = (info: unknown) => ({
  type: 'error',
  message: 'LIMIT_NOTICE',
  codex_error_info: info
})
const events = (payloads: Record<string, unknown>[]): string =>
  payloads.map((payload) => JSON.stringify({ type: 'event_msg', payload })).join('\n')

it.each([
  ['a usage limit', 'usage_limit_exceeded'],
  ['a rate limit', 'rate_limit_exceeded'],
  ['a limit that carries details', { usage_limit_exceeded: { resets_at: 1 } }]
])('a rate-limit event sets attention limited: %s', (_case, info) => {
  const tail = events([{ type: 'task_started' }, limitError(info), { type: 'task_complete' }])
  expect(parseCodexActivity(tail)).toMatchObject({ activity: 'idle', attention: 'limited' })
})

it('keeps limited through a retry until a later turn proceeds', () => {
  const limited = [limitError('usage_limit_exceeded'), { type: 'task_complete' }]
  const retried = [...limited, { type: 'task_started' }]
  expect(parseCodexActivity(events(retried)).attention).toBe('limited')
  const proceeded = [...retried, { type: 'agent_reasoning' }]
  expect(parseCodexActivity(events(proceeded)).attention).toBe('none')
})

it('takes no other error, and no account percent, for a limit', () => {
  const overloaded = events([limitError('server_overloaded'), { type: 'task_complete' }])
  expect(parseCodexActivity(overloaded).attention).toBe('done')
  const full = events([
    { type: 'token_count', rate_limits: { primary: { used_percent: 100 } } },
    { type: 'task_complete' }
  ])
  expect(parseCodexActivity(full).attention).toBe('done')
})
