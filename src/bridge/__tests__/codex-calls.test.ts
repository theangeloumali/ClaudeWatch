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
