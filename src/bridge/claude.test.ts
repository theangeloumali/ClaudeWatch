import { expect, it } from 'vitest'
import { sessionFromRegistry } from './claude'
import { parseTranscript } from './transcript-tail'
import { registryEntry } from './__fixtures__/helpers'

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
