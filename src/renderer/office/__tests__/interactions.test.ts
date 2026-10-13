import { describe, expect, it } from 'vitest'
import { INTERACTION_FAILURES } from '../../../shared/office/types'
import {
  canRespond,
  failureMessage,
  focusMessage,
  reachBlocker,
  MAX_MESSAGE_CHARS,
  messageProblem,
  reachTarget
} from '../logic/interactions'
import { INITIAL_OFFICE_STATE, officeReducer } from '../logic/office-reducer'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from './fixtures'

describe('availability', () => {
  const orcaClaude = makeSession({ key: 'claude:a', host: 'orca', attention: 'permission' })

  it('lets talk and peek reach only an Orca pane that is known', () => {
    const blocker = (session: Parameters<typeof reachTarget>[0]) =>
      reachBlocker(reachTarget(session, undefined))
    expect(blocker(orcaClaude)).toBeNull()
    expect(blocker(makeSession({ key: 'claude:t', host: 'terminal' }))).toBe('not-in-orca')
    expect(blocker(makeSession({ key: 'claude:t', host: 'vscode' }))).toBe('not-in-orca')
    // In Orca, but another process claimed its pane: there is nowhere to type.
    expect(blocker(makeSession({ key: 'claude:t', host: 'orca', orcaPaneKey: null }))).toBe(
      'terminal-not-found'
    )
  })

  it('answers prompts only for Claude in Orca with a permission prompt showing', () => {
    expect(canRespond(orcaClaude)).toBe(true)
    expect(canRespond({ ...orcaClaude, provider: 'codex' })).toBe(false)
    expect(canRespond({ ...orcaClaude, host: 'terminal' })).toBe(false)
    expect(canRespond({ ...orcaClaude, attention: 'question' })).toBe(false)
  })
})

describe('failureMessage', () => {
  it('has plain words for every failure', () => {
    expect(failureMessage('not-in-orca')).toBe(
      'This agent runs in a plain terminal. Use Focus terminal to reply there.'
    )
    expect(failureMessage('orca-unavailable')).toBe(
      "Orca isn't responding. Check that it's running."
    )
    expect(failureMessage('terminal-not-found')).toBe(
      "Couldn't find this agent's Orca pane. It may have closed."
    )
    expect(failureMessage('no-permission-prompt')).toBe(
      'No permission prompt is showing for this agent right now.'
    )
    expect(failureMessage('unsupported-provider')).toBe(
      'Answering prompts from the office works for Claude agents. Focus the terminal for Codex and OpenCode.'
    )
    expect(failureMessage('invalid-input')).toBe('Type a message first (up to 4000 characters).')
    expect(failureMessage('unknown-session')).toBe('This agent has left the office.')
    expect(failureMessage('agent-not-found')).toBe("Couldn't find claude or codex on your PATH.")
    expect(failureMessage('not-permitted')).toBe(
      'This page is view-only. Start it with --interactive to act on agents.'
    )
  })

  it('has its own words for each failure the contract lists', () => {
    const messages = INTERACTION_FAILURES.map((reason) => failureMessage(reason))
    expect(new Set(messages).size).toBe(INTERACTION_FAILURES.length)
    expect(messages).not.toContain(failureMessage(undefined))
  })

  it('still says something when the reason is missing', () => {
    expect(failureMessage(undefined)).toMatch(/try again/i)
  })
})

describe('reachTarget', () => {
  const lead = makeSession({ key: 'claude:a', name: 'office renderer', host: 'terminal' })
  const teammate = {
    id: 't1',
    type: 'lena',
    name: 'lena-hud',
    kind: 'teammate',
    activity: 'editing',
    orcaPaneKey: 'pane-2'
  } as const

  it('reaches a lead or one of its subagents through the lead terminal', () => {
    expect(reachTarget(lead, undefined)).toEqual({
      key: 'claude:a',
      name: 'office renderer',
      host: 'terminal',
      hasPane: false,
      isLead: true
    })
    expect(reachTarget(lead, { id: 's1', type: 'Explore', activity: 'idle' })).toMatchObject({
      key: 'claude:a',
      isLead: true
    })
  })

  it('reaches a teammate through its own pane, under its own name', () => {
    expect(reachTarget(lead, teammate)).toEqual({
      key: 'claude:a#t1',
      name: 'lena-hud',
      host: 'orca',
      hasPane: true,
      isLead: false
    })
  })

  it('falls back to the lead host for a teammate without a pane', () => {
    expect(reachTarget(lead, { ...teammate, orcaPaneKey: null }).host).toBe('terminal')
  })
})

describe('focusMessage', () => {
  it('says nothing when the agent pane itself came forward', () => {
    expect(focusMessage({ success: true, target: 'pane' })).toBe('')
  })

  it('says plainly when only Orca could be raised, with the reason', () => {
    expect(focusMessage({ success: false, target: 'app', reason: 'terminal-not-found' })).toBe(
      "Orca is in front, but not on this agent's pane. Couldn't find this agent's Orca pane. It may have closed."
    )
  })

  it('says when a terminal was opened at the folder instead', () => {
    expect(focusMessage({ success: true, target: 'terminal' })).toBe(
      "Opened a terminal at this agent's folder."
    )
  })

  it('explains a failure that raised nothing', () => {
    expect(focusMessage({ success: false, reason: 'unknown-session' })).toBe(
      'This agent has left the office.'
    )
  })
})

describe('messageProblem', () => {
  it('rejects blank and over-long messages before they reach the feed', () => {
    expect(messageProblem('   ')).toBe('invalid-input')
    expect(messageProblem('x'.repeat(MAX_MESSAGE_CHARS + 1))).toBe('invalid-input')
    expect(messageProblem('ship it')).toBeNull()
  })
})

describe('review state', () => {
  const frame = makeFrame({
    floors: [makeFloor({ floorId: 'f1', rooms: [makeRoom({ id: 'r1', sessionKey: 'claude:a' })] })],
    sessions: [makeSession({ key: 'claude:a', attention: 'permission' })],
    agents: [makeAgent({ agentKey: 'a', roomId: 'r1', attention: 'permission' })]
  })
  const loaded = officeReducer(INITIAL_OFFICE_STATE, { type: 'frame-received', frame })

  it('opens a review by selecting the agent and remembering the session', () => {
    const state = officeReducer(loaded, { type: 'review-opened', sessionKey: 'claude:a' })
    expect(state).toMatchObject({ selectedAgentKey: 'a', reviewingSessionKey: 'claude:a' })
    expect(officeReducer(state, { type: 'review-closed' }).reviewingSessionKey).toBeNull()
  })

  it('drops the review when another agent is selected', () => {
    const state = officeReducer(loaded, { type: 'review-opened', sessionKey: 'claude:a' })
    expect(
      officeReducer(state, { type: 'agent-selected', agentKey: null }).reviewingSessionKey
    ).toBeNull()
  })
})
