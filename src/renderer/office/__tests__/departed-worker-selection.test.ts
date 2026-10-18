import { expect, it } from 'vitest'
import { agentKey } from '../../../shared/office/agent-key'
import { EMPTY_THEME_ASSIGNMENTS } from '../logic/office-themes'
import { selectionOf } from '../use-office-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from './fixtures'

it('does not expose replacement-session actions through a departed worker in its old room', () => {
  const replacement = makeSession({ key: 'replacement', host: 'orca' })
  const agent = makeAgent({ agentKey: 'departed', roomId: 'reassigned' })
  const frame = makeFrame({
    sessions: [replacement],
    agents: [agent],
    floors: [
      makeFloor({
        floorId: agent.floorId,
        rooms: [makeRoom({ id: agent.roomId, sessionKey: replacement.key })]
      })
    ]
  })
  const selected = selectionOf(frame, agent.agentKey, EMPTY_THEME_ASSIGNMENTS, 'corporate-city')
  expect(selected.agent).toEqual(agent)
  expect(selected.session).toBeUndefined()
  expect(selected.member).toBeUndefined()
  expect(selected.target).toBeUndefined()
  expect(selected.canWorkstation).toBe(false)
})

it('does not turn a departed child into its still-present lead action target', () => {
  const parent = makeSession({ key: 'parent', host: 'orca' })
  const child = makeAgent({ agentKey: agentKey(parent.key, 'gone'), isSubagent: true })
  const frame = makeFrame({ sessions: [parent], agents: [child] })
  const selected = selectionOf(frame, child.agentKey, EMPTY_THEME_ASSIGNMENTS, 'corporate-city')
  expect(selected.agent).toEqual(child)
  expect(selected.session).toBeUndefined()
  expect(selected.target).toBeUndefined()
})

it('retains the current child and its actual teammate action target', () => {
  const parent = makeSession({
    key: 'parent',
    host: 'orca',
    subagents: [
      {
        id: 'current',
        type: 'worker',
        kind: 'teammate',
        activity: 'reading',
        orcaPaneKey: 'own-pane'
      }
    ]
  })
  const child = makeAgent({ agentKey: agentKey(parent.key, 'current'), isSubagent: true })
  const frame = makeFrame({ sessions: [parent], agents: [child] })
  const selected = selectionOf(frame, child.agentKey, EMPTY_THEME_ASSIGNMENTS, 'corporate-city')
  expect(selected.session).toEqual(parent)
  expect(selected.member).toEqual(parent.subagents[0])
  expect(selected.target).toMatchObject({ key: child.agentKey, isLead: false, hasPane: true })
})

it('rejects a root identity presented as a child', () => {
  const parent = makeSession({ key: 'parent', host: 'orca' })
  const mismatched = makeAgent({ agentKey: parent.key, isSubagent: true })
  const selected = selectionOf(
    makeFrame({ sessions: [parent], agents: [mismatched] }),
    mismatched.agentKey,
    EMPTY_THEME_ASSIGNMENTS,
    'corporate-city'
  )
  expect(selected.session).toBeUndefined()
  expect(selected.target).toBeUndefined()
})
