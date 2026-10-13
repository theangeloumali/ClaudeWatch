import { expect, it } from 'vitest'
import { opencodeProcesses, opencodeState } from './opencode-activity'
import { parseProcessTable } from './process-table'

const START = 'Sat Oct 10 15:29:12 2026'
const NOW = 1_000_000
const working = { id: 'msg_b', role: 'assistant', finish: null, completed: null, error: null }
const tool = (name: unknown, status: string) => ({ type: 'tool', tool: name, status })

it('selects the OpenCode binary running a session, however it was started', () => {
  const rows = [
    `41 ${START} /Users/dev/.opencode/bin/opencode`,
    `42 ${START} opencode run fix the serve command`,
    `43 ${START} opencode --continue --model anthropic/claude-sonnet-4`,
    // A package runner starts a script that starts the binary: only the binary is the agent.
    `44 ${START} node /Users/dev/.npm/_npx/1/node_modules/.bin/opencode`,
    `45 ${START} /Users/dev/.npm/_npx/1/node_modules/opencode-darwin-arm64/bin/opencode run hi`,
    `46 ${START} bun x opencode-ai`,
    `47 ${START} opencode serve --port 4096`,
    `48 ${START} opencode attach http://localhost:4096`,
    `49 ${START} opencode upgrade`,
    `50 ${START} opencode auth login`,
    `51 ${START} /Applications/OpenCode.app/Contents/MacOS/opencode-cli serve`,
    `52 ${START} opencode /Users/dev/repo`
  ]
  expect(opencodeProcesses(parseProcessTable(rows.join('\n'))).map(({ pid }) => pid)).toEqual([
    41, 42, 43, 45, 52
  ])
})

it('shows no activity for a session nobody has prompted', () => {
  expect(opencodeState(undefined, [], NOW)).toEqual({
    activity: 'idle',
    attention: 'none',
    currentTool: null
  })
})

it.each([
  ['bash', 'running', 'running', 'run'],
  ['read', 'pending', 'reading', 'read'],
  ['grep', 'running', 'reading', 'read'],
  ['edit', 'running', 'editing', 'edit'],
  ['apply_patch', 'running', 'editing', 'edit'],
  ['webfetch', 'running', 'searching', 'web'],
  ['task', 'running', 'delegating', 'agent'],
  ['slack_reactions_add', 'running', 'running', 'other']
])('maps a %s tool that is %s to %s', (name, status, activity, category) => {
  const parts = [tool(name, status), tool('read', 'completed'), { type: 'step-start' }]
  expect(opencodeState(working, parts, NOW)).toEqual({
    activity,
    attention: 'none',
    currentTool: { name, category }
  })
})

it.each([
  ['a reasoning part', [{ type: 'reasoning' }, { type: 'step-start' }]],
  ['streaming text', [{ type: 'text' }, { type: 'reasoning' }]],
  ['a step that has just started', [{ type: 'step-start' }]],
  ['a tool that finished', [tool('bash', 'completed'), { type: 'step-start' }]],
  ['a tool that failed', [tool('bash', 'error')]],
  ['a tool whose name is not a name', [tool('{"a":1}', 'running')]],
  ['a part type it does not know', [{ type: 'hologram' }, { type: 'patch' }]]
])('maps an unfinished reply holding %s to thinking', (_, parts) => {
  expect(opencodeState(working, parts, NOW)).toEqual({
    activity: 'thinking',
    attention: 'none',
    currentTool: null
  })
})

it('says the owner is being asked while the question tool waits', () => {
  expect(opencodeState(working, [tool('question', 'running')], NOW)).toEqual({
    activity: 'idle',
    attention: 'question',
    currentTool: null
  })
})

it.each([
  ['a reply that stopped', { finish: 'stop', completed: NOW - 5 }, 'idle', 'done'],
  ['a reply cut off at its length', { finish: 'length', completed: NOW - 5 }, 'idle', 'done'],
  ['a reply between two steps', { finish: 'tool-calls', completed: NOW - 500 }, 'thinking', 'none'],
  [
    'a step that was never followed',
    { finish: 'tool-calls', completed: NOW - 61_000 },
    'idle',
    'none'
  ],
  [
    'a reply the owner interrupted',
    { error: 'MessageAbortedError', completed: NOW },
    'idle',
    'none'
  ],
  ['an OpenCode 2 reply the owner interrupted', { error: 'aborted' }, 'idle', 'none'],
  ['an OpenCode 2 reply that failed', { error: 'provider.transport' }, 'idle', 'error'],
  ['a reply that failed', { error: 'APIError', completed: NOW - 5 }, 'idle', 'error'],
  ['a reply that failed mid-step', { error: 'UnknownError' }, 'idle', 'error'],
  ['a prompt just sent', { role: 'user', time_created: NOW - 800 }, 'thinking', 'none'],
  ['a prompt nothing answered', { role: 'user', time_created: NOW - 61_000 }, 'idle', 'none'],
  ['a role it does not know', { role: 'system' }, 'idle', 'none'],
  // Dropped, not coerced: the reply then counts as unfinished and its running tool shows.
  ['a completion time of the wrong type', { finish: 'stop', completed: 'soon' }, 'running', 'none']
])('maps %s', (_, message, activity, attention) => {
  // A finished reply's tool parts are history: they never make it look busy.
  const state = opencodeState({ ...working, ...message }, [tool('bash', 'running')], NOW)
  expect(state).toMatchObject({ activity, attention })
})
