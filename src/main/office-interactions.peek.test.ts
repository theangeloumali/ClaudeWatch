import { beforeEach, expect, it, vi } from 'vitest'
import { OfficeInteractions } from './office-interactions'
import type { OfficeSnapshot, SessionRef } from '../shared/office/types'
import type { PaneTerminal } from './orca-terminals'

const session = (id: string, paneKey: string): SessionRef => ({
  key: `claude:${id}`,
  provider: 'claude',
  sessionId: id,
  pid: 1,
  name: 'app',
  cwd: '/repo/app',
  projectKey: 'p_app',
  projectLabel: 'app',
  projectRoot: '/repo/app',
  companyKey: 'c_test',
  companyLabel: 'Test Co',
  worktree: null,
  host: 'orca',
  orcaPaneKey: paneKey,
  activity: 'editing',
  attention: 'none',
  currentTool: null,
  subagents: [],
  startedAtMs: 1,
  updatedAtMs: 1
})
const pane = (handle: string): PaneTerminal => ({
  handle,
  worktreePath: '/repo/app',
  agent: 'claude',
  incarnationId: `inc_${handle}`
})

const orca = {
  handleFor: vi.fn(async (paneKey: string) => pane(paneKey === 'tab1:leaf1' ? 'term_a' : 'term_b')),
  sendPrompt: vi.fn(),
  sendKey: vi.fn(),
  screen: vi.fn(),
  create: vi.fn(),
  focus: vi.fn()
}
// Screen reads that finish only when the test lets them, in any order.
const pending = new Map<string, Array<() => void>>()
let interactions: OfficeInteractions

beforeEach(() => {
  pending.clear()
  orca.screen.mockImplementation(
    (handle: string) =>
      new Promise<string[]>((resolve) =>
        pending.set(handle, [...(pending.get(handle) ?? []), () => resolve([`${handle} line`])])
      )
  )
  const snapshot: OfficeSnapshot = {
    rev: 1,
    generatedAtMs: 1,
    sessions: [session('a', 'tab1:leaf1'), session('b', 'tab2:leaf2')],
    sources: []
  }
  interactions = new OfficeInteractions({
    snapshot: () => snapshot,
    orca,
    openTerminalRunning: vi.fn(),
    processStart: vi.fn(async () => 1),
    raiseOrca: vi.fn(),
    openFolder: vi.fn()
  })
})
const release = (handle: string, index = 0): void => pending.get(handle)?.[index]?.()

// health-14: one revision for every agent let a peek of B fail a slower peek of A.
it('a peek of B does not fail a concurrent peek of A', async () => {
  const peekA = interactions.peek('claude:a')
  await vi.waitFor(() => expect(pending.has('term_a')).toBe(true))
  const peekB = interactions.peek('claude:b')
  await vi.waitFor(() => expect(pending.has('term_b')).toBe(true))
  release('term_b')
  expect(await peekB).toMatchObject({ success: true })
  release('term_a')

  expect(await peekA).toMatchObject({ success: true, lines: ['term_a line'] })
})

it('a later peek of the same agent still supersedes an earlier one', async () => {
  const first = interactions.peek('claude:a')
  await vi.waitFor(() => expect(pending.get('term_a')).toHaveLength(1))
  const second = interactions.peek('claude:a')
  await vi.waitFor(() => expect(pending.get('term_a')).toHaveLength(2))
  release('term_a', 1)
  expect(await second).toMatchObject({ success: true })
  release('term_a', 0)

  expect(await first).toMatchObject({ success: false, reason: 'prompt-changed' })
})
