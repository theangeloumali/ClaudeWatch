import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OfficeInteractions } from './office-interactions'
import type { OfficeSnapshot, SessionRef, SubagentRef } from '../shared/office/types'
import type { PaneTerminal } from './orca-terminals'

const session = (overrides: Partial<SessionRef> = {}): SessionRef => ({
  key: 'claude:s1',
  provider: 'claude',
  sessionId: 's1',
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
  orcaPaneKey: 'tab1:leaf1',
  activity: 'editing',
  attention: 'none',
  currentTool: null,
  subagents: [],
  startedAtMs: 1,
  updatedAtMs: 1,
  ...overrides
})

const pane = (overrides: Partial<PaneTerminal> = {}): PaneTerminal => ({
  handle: 'term_a',
  worktreePath: '/repo/app',
  agent: 'claude',
  incarnationId: 'inc_1',
  ...overrides
})

const PROMPT_SCREEN = [
  'Bash command',
  '  npm test',
  'Do you want to proceed?',
  '❯ 1. Yes',
  '  2. No'
]
const RULE = '─'.repeat(40)
// An agent between turns, as Claude Code draws it: its input line between two rules.
const IDLE_SCREEN = ['⏺ Done. The tests pass.', '', RULE, '❯', RULE, '  ⏵⏵ accept edits on']
const CODEX_IDLE_SCREEN = ['• Done.', '', '› Ask Codex to do anything', '  ? for shortcuts']

describe('OfficeInteractions', () => {
  let snapshot: OfficeSnapshot
  const orca = {
    handleFor: vi.fn(),
    sendPrompt: vi.fn(),
    sendKey: vi.fn(),
    screen: vi.fn(),
    create: vi.fn(),
    focus: vi.fn()
  }
  const openTerminalRunning = vi.fn()
  const processStart = vi.fn()
  let interactions: OfficeInteractions

  beforeEach(() => {
    vi.resetAllMocks()
    orca.handleFor.mockResolvedValue(pane())
    orca.screen.mockResolvedValue(PROMPT_SCREEN)
    openTerminalRunning.mockResolvedValue({ success: true })
    processStart.mockResolvedValue(1)
    snapshot = { rev: 1, generatedAtMs: 1, sessions: [session()], sources: [] }
    interactions = new OfficeInteractions({
      snapshot: () => snapshot,
      orca,
      openTerminalRunning,
      processStart,
      raiseOrca: vi.fn(),
      openFolder: vi.fn()
    })
  })

  describe('send', () => {
    beforeEach(() => {
      orca.screen.mockResolvedValue(IDLE_SCREEN)
    })

    it('types nothing while a permission prompt is on screen', async () => {
      orca.screen.mockResolvedValue(PROMPT_SCREEN)
      expect(await interactions.send('claude:s1', 'no, wait')).toEqual({
        success: false,
        reason: 'prompt-on-screen'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it.each([
      ['Claude Code’s, on its second option', ['Ready to code?', '  1. Yes', '❯ 2. Keep planning']],
      [
        'boxed',
        ['│ Trust this folder?        │', '│ ❯ 1. Yes, proceed         │', '│   2. No, exit │']
      ],
      ['Codex’s', ['Allow command?', '› 1. Yes, proceed (y)', '  2. No (esc)']]
    ])('types nothing while a numbered-choice dialog (%s) is on screen', async (_kind, screen) => {
      orca.screen.mockResolvedValue(screen)
      expect(await interactions.send('claude:s1', 'looks good 2 me')).toEqual({
        success: false,
        reason: 'prompt-on-screen'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('reads the screen of the pane it is about to type into, after proving it', async () => {
      await interactions.send('claude:s1', 'run the tests')
      expect(orca.screen).toHaveBeenCalledWith('term_a')
      expect(orca.screen.mock.invocationCallOrder[0]).toBeLessThan(
        orca.sendPrompt.mock.invocationCallOrder[0]
      )
    })

    it.each(['permission', 'question'] as const)(
      'refuses without touching Orca while the session waits on a dialog (%s)',
      async (attention) => {
        snapshot.sessions = [session({ attention })]
        expect(await interactions.send('claude:s1', 'no, wait')).toEqual({
          success: false,
          reason: 'prompt-on-screen'
        })
        expect(orca.handleFor).not.toHaveBeenCalled()
        expect(orca.screen).not.toHaveBeenCalled()
        expect(orca.sendPrompt).not.toHaveBeenCalled()
      }
    )

    it.each(['none', 'done', 'error', 'limited'] as const)(
      'still talks to a session whose attention is %s when no dialog is on screen',
      async (attention) => {
        snapshot.sessions = [session({ attention })]
        expect(await interactions.send('claude:s1', 'carry on')).toEqual({ success: true })
      }
    )

    it('does not take a typed message that begins with a number for a dialog', async () => {
      orca.screen.mockResolvedValue([
        '❯ 1. fix the build first',
        '  2. then the lint',
        ...IDLE_SCREEN
      ])
      expect(await interactions.send('claude:s1', 'thanks')).toEqual({ success: true })
    })

    it('talks to an agent that ended its turn by asking, in prose, whether to proceed', async () => {
      orca.screen.mockResolvedValue(['⏺ Do you want to proceed with it?', ...IDLE_SCREEN.slice(1)])
      expect(await interactions.send('claude:s1', 'yes, go on')).toEqual({ success: true })
    })

    it.each([
      [
        'a picker with a pointer and no numbers',
        [' Resume a session?', ' ❯ fix the build', '   add the tests']
      ],
      ['a dialog with one numbered row', [' Update installed', ' ❯ 1. Continue']],
      ['an input line that is not between two rules', ['⏺ Done.', '', '❯ ', '  ? for shortcuts']],
      [
        'a dialog under an input line left on screen',
        [...IDLE_SCREEN, ' Do it?', ' ❯ Yes', '   No']
      ],
      [
        'an input line far above the bottom',
        [...IDLE_SCREEN, ...Array.from({ length: 30 }, () => '  output')]
      ],
      ['nothing at all', []]
    ])('types nothing when the screen shows %s', async (_kind, screen) => {
      orca.screen.mockResolvedValue(screen)
      expect(await interactions.send('claude:s1', 'carry on')).toEqual({
        success: false,
        reason: 'prompt-on-screen'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('talks to a Claude agent whose input line holds a draft', async () => {
      orca.screen.mockResolvedValue([
        '⏺ Done.',
        RULE,
        '❯\u00a0and then',
        RULE,
        '  ⏵⏵ accept edits on'
      ])
      expect(await interactions.send('claude:s1', 'run the tests')).toEqual({ success: true })
    })

    it('types nothing to an OpenCode agent, whose input line it cannot recognise', async () => {
      snapshot.sessions = [session({ provider: 'opencode' })]
      orca.handleFor.mockResolvedValue(pane({ agent: 'opencode' }))
      orca.screen.mockResolvedValue(IDLE_SCREEN)
      expect(await interactions.send('claude:s1', 'carry on')).toEqual({
        success: false,
        reason: 'unsupported-provider'
      })
      expect(orca.screen).not.toHaveBeenCalled()
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    describe('to a Codex agent', () => {
      beforeEach(() => {
        snapshot.sessions = [session({ provider: 'codex' })]
        orca.handleFor.mockResolvedValue(pane({ agent: 'codex' }))
      })

      it('types when its composer and the shortcuts hint under it are at the bottom', async () => {
        orca.screen.mockResolvedValue(CODEX_IDLE_SCREEN)
        expect(await interactions.send('claude:s1', 'carry on')).toEqual({ success: true })
        orca.screen.mockResolvedValue([
          '• Done.',
          '› Ask Codex to do anything',
          '  gpt · ~/repo · main',
          '  ? for shortcuts'
        ])
        expect(await interactions.send('claude:s1', 'carry on')).toEqual({ success: true })
      })

      it.each([
        ['an approval', ['Allow command?', '› 1. Yes, proceed (y)', '  2. No (esc)']],
        [
          'a picker with no numbers',
          ['Resume?', '› fix the build', '  add the tests', '  enter to confirm']
        ],
        ['Claude Code’s input line, which is not its own', IDLE_SCREEN],
        ['its composer far above the bottom', [...CODEX_IDLE_SCREEN, '  a', '  b', '  c', '  d']]
      ])('types nothing when the screen shows %s', async (_kind, screen) => {
        orca.screen.mockResolvedValue(screen)
        expect(await interactions.send('claude:s1', 'carry on')).toEqual({
          success: false,
          reason: 'prompt-on-screen'
        })
        expect(orca.sendPrompt).not.toHaveBeenCalled()
      })
    })

    it('types nothing when the screen cannot be read', async () => {
      orca.screen.mockRejectedValue(new Error('read failed'))
      expect(await interactions.send('claude:s1', 'hi')).toEqual({
        success: false,
        reason: 'orca-unavailable'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('types the message into the agent’s Orca terminal', async () => {
      expect(await interactions.send('claude:s1', 'run the tests')).toEqual({ success: true })
      expect(orca.sendPrompt).toHaveBeenCalledWith('term_a', 'run the tests')
    })

    it('joins a multi-line message into one line, since a raw newline would submit it early', async () => {
      expect(await interactions.send('claude:s1', 'first line\r\nsecond line\n\nthird')).toEqual({
        success: true
      })
      expect(orca.sendPrompt).toHaveBeenCalledWith('term_a', 'first line second line third')
    })

    it('refuses sessions outside Orca, empty or control-character text, and unknown sessions', async () => {
      snapshot.sessions = [session({ host: 'terminal', orcaPaneKey: null })]
      expect(await interactions.send('claude:s1', 'hi')).toEqual({
        success: false,
        reason: 'not-in-orca'
      })
      snapshot.sessions = [session()]
      expect(await interactions.send('claude:s1', '   ')).toEqual({
        success: false,
        reason: 'invalid-input'
      })
      expect(await interactions.send('claude:s1', 'hi\u001b[A')).toEqual({
        success: false,
        reason: 'invalid-input'
      })
      expect(await interactions.send('claude:s1', 'x'.repeat(4001))).toEqual({
        success: false,
        reason: 'invalid-input'
      })
      expect(await interactions.send('claude:nope', 'hi')).toEqual({
        success: false,
        reason: 'unknown-session'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('refuses a pane whose worktree is not this session’s folder', async () => {
      orca.handleFor.mockResolvedValueOnce(pane({ handle: 'term_x', worktreePath: '/other/repo' }))
      expect(await interactions.send('claude:s1', 'hi')).toEqual({
        success: false,
        reason: 'terminal-not-found'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('accepts a pane in the project root or in a worktree that contains the session folder', async () => {
      snapshot.sessions = [session({ cwd: '/repo/app-wt/src', projectRoot: '/repo/app' })]
      orca.handleFor.mockResolvedValueOnce(pane({ worktreePath: '/repo/app-wt' }))
      expect(await interactions.send('claude:s1', 'hi')).toEqual({ success: true })
      orca.handleFor.mockResolvedValueOnce(pane())
      expect(await interactions.send('claude:s1', 'hi')).toEqual({ success: true })
      orca.handleFor.mockResolvedValueOnce(pane({ worktreePath: '/repo/app-wt-other' }))
      expect(await interactions.send('claude:s1', 'hi')).toEqual({
        success: false,
        reason: 'terminal-not-found'
      })
    })

    // The same interactions, comparing folders as `platform` does.
    const on = (platform: NodeJS.Platform): OfficeInteractions =>
      new OfficeInteractions({
        snapshot: () => snapshot,
        orca,
        openTerminalRunning,
        processStart,
        raiseOrca: vi.fn(),
        openFolder: vi.fn(),
        platform
      })

    it('matches Windows folders as Windows does: either separator, any case', async () => {
      const windows = on('win32')
      snapshot.sessions = [session({ cwd: 'C:\\Repo\\app-wt\\src', projectRoot: 'C:\\Repo\\app' })]
      for (const worktreePath of ['C:/Repo/app-wt', 'c:/repo/APP', 'C:\\Repo\\app-wt\\']) {
        orca.handleFor.mockResolvedValueOnce(pane({ worktreePath }))
        expect(await windows.send('claude:s1', 'hi')).toEqual({ success: true })
      }
      for (const worktreePath of ['C:/Repo/app-wt-other', 'D:/Repo/app', '/Repo/app']) {
        orca.handleFor.mockResolvedValueOnce(pane({ worktreePath }))
        expect(await windows.send('claude:s1', 'hi')).toEqual({
          success: false,
          reason: 'terminal-not-found'
        })
      }
    })

    it('keeps POSIX folders exact: case, and a backslash is part of a name', async () => {
      const mac = on('darwin')
      for (const worktreePath of ['/Repo/App', '\\repo\\app']) {
        orca.handleFor.mockResolvedValueOnce(pane({ worktreePath }))
        expect(await mac.send('claude:s1', 'hi')).toEqual({
          success: false,
          reason: 'terminal-not-found'
        })
      }
      // Only Windows reads a drive letter: elsewhere these are two different names.
      snapshot.sessions = [session({ cwd: 'c:\\repo\\app', projectRoot: 'c:\\repo\\app' })]
      orca.handleFor.mockResolvedValueOnce(pane({ worktreePath: 'C:/Repo/App' }))
      expect(await mac.send('claude:s1', 'hi')).toEqual({
        success: false,
        reason: 'terminal-not-found'
      })
      orca.handleFor.mockResolvedValueOnce(pane({ worktreePath: '/repo/' }))
      snapshot.sessions = [session({ cwd: '/repo/app', projectRoot: '/elsewhere' })]
      expect(await mac.send('claude:s1', 'hi')).toEqual({ success: true })
    })

    it('refuses a pane where this session’s agent is no longer the running program', async () => {
      for (const agent of [null, 'codex', 'claude-something-else']) {
        orca.handleFor.mockResolvedValueOnce(pane({ agent }))
        expect(await interactions.send('claude:s1', 'rm -rf build')).toEqual({
          success: false,
          reason: 'terminal-not-found'
        })
      }
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('refuses a session whose process is gone or whose pid now belongs to another process', async () => {
      for (const start of [null, 999]) {
        processStart.mockResolvedValueOnce(start)
        expect(await interactions.send('claude:s1', 'hi')).toEqual({
          success: false,
          reason: 'unknown-session'
        })
      }
      expect(processStart).toHaveBeenCalledWith(1)
      expect(orca.handleFor).not.toHaveBeenCalled()
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('accepts Orca’s agent-teams flavour of the same provider', async () => {
      orca.handleFor.mockResolvedValueOnce(pane({ agent: 'claude-agent-teams' }))
      expect(await interactions.send('claude:s1', 'hi')).toEqual({ success: true })
    })

    it('reports a missing terminal and an unreachable Orca', async () => {
      orca.handleFor.mockResolvedValueOnce(null)
      expect(await interactions.send('claude:s1', 'hi')).toEqual({
        success: false,
        reason: 'terminal-not-found'
      })
      orca.handleFor.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      expect(await interactions.send('claude:s1', 'hi')).toEqual({
        success: false,
        reason: 'orca-unavailable'
      })
    })
  })

  describe('respond', () => {
    beforeEach(() => {
      snapshot.sessions = [session({ attention: 'permission' })]
    })

    const reviewed = async (): Promise<string> =>
      (await interactions.peek('claude:s1')).fingerprint!

    it('approves with key 1 and denies with Escape for the prompt the owner reviewed', async () => {
      const fingerprint = await reviewed()
      expect(await interactions.respond('claude:s1', 'approve', fingerprint)).toEqual({
        success: true
      })
      expect(orca.sendKey).toHaveBeenLastCalledWith('term_a', '1')
      expect(await interactions.respond('claude:s1', 'deny', await reviewed())).toEqual({
        success: true
      })
      expect(orca.sendKey).toHaveBeenLastCalledWith('term_a', '\u001b')
    })

    it('answers once per review, even when two answers race', async () => {
      const fingerprint = await reviewed()
      const answers = await Promise.all([
        interactions.respond('claude:s1', 'approve', fingerprint),
        interactions.respond('claude:s1', 'approve', fingerprint)
      ])
      expect(answers).toEqual([{ success: true }, { success: false, reason: 'prompt-changed' }])
      expect(await interactions.respond('claude:s1', 'approve', fingerprint)).toEqual({
        success: false,
        reason: 'prompt-changed'
      })
      expect(orca.sendKey).toHaveBeenCalledOnce()
    })

    it('sends nothing for a fingerprint the office never issued for this session', async () => {
      const { createHash } = await import('crypto')
      const forged = createHash('sha256').update(PROMPT_SCREEN.join('\n')).digest('hex')
      expect(await interactions.respond('claude:s1', 'approve', forged)).toEqual({
        success: false,
        reason: 'prompt-changed'
      })
      expect(orca.sendKey).not.toHaveBeenCalled()
    })

    it('sends nothing when the terminal was restarted after the review', async () => {
      const fingerprint = await reviewed()
      orca.handleFor.mockResolvedValue(pane({ incarnationId: 'inc_2' }))
      expect(await interactions.respond('claude:s1', 'approve', fingerprint)).toEqual({
        success: false,
        reason: 'prompt-changed'
      })
      expect(orca.sendKey).not.toHaveBeenCalled()
    })

    it('sends nothing when a different prompt replaced the reviewed one', async () => {
      const fingerprint = await reviewed()
      orca.screen.mockResolvedValue([
        'Bash command',
        '  rm -rf build',
        'Do you want to proceed?',
        '❯ 1. Yes',
        '  2. No'
      ])
      expect(await interactions.respond('claude:s1', 'approve', fingerprint)).toEqual({
        success: false,
        reason: 'prompt-changed'
      })
      expect(orca.sendKey).not.toHaveBeenCalled()
    })

    it('requires the fingerprint of a reviewed screen', async () => {
      expect(await interactions.respond('claude:s1', 'approve', '')).toEqual({
        success: false,
        reason: 'invalid-input'
      })
      expect(orca.sendKey).not.toHaveBeenCalled()
    })

    it('sends nothing when the screen shows no permission prompt', async () => {
      const fingerprint = await reviewed()
      orca.screen.mockResolvedValue(['$ vim notes.md'])
      expect(await interactions.respond('claude:s1', 'approve', fingerprint)).toEqual({
        success: false,
        reason: 'no-permission-prompt'
      })
      expect(orca.sendKey).not.toHaveBeenCalled()
    })

    it('refuses sessions that are not waiting for permission, and Codex sessions', async () => {
      snapshot.sessions = [session({ attention: 'none' })]
      expect(await interactions.respond('claude:s1', 'approve', 'f')).toEqual({
        success: false,
        reason: 'no-permission-prompt'
      })
      for (const provider of ['codex', 'opencode'] as const) {
        snapshot.sessions = [session({ provider, attention: 'permission' })]
        expect(await interactions.respond('claude:s1', 'approve', 'f')).toEqual({
          success: false,
          reason: 'unsupported-provider'
        })
      }
      expect(orca.sendKey).not.toHaveBeenCalled()
    })

    it('rejects an unknown decision', async () => {
      expect(await interactions.respond('claude:s1', 'maybe' as 'approve', 'f')).toEqual({
        success: false,
        reason: 'invalid-input'
      })
    })
  })

  describe('peek', () => {
    it('returns the last rendered screen lines without trailing blanks', async () => {
      orca.screen.mockResolvedValue(['a', 'b', '', '  '])
      expect(await interactions.peek('claude:s1')).toEqual({
        success: true,
        lines: ['a', 'b'],
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
    })

    it('caps the result at 40 lines', async () => {
      orca.screen.mockResolvedValue(Array.from({ length: 100 }, (_, i) => `line ${i}`))
      const peeked = await interactions.peek('claude:s1')
      expect(peeked.lines).toHaveLength(40)
      expect(peeked.lines.at(-1)).toBe('line 99')
    })

    it('refuses sessions outside Orca', async () => {
      snapshot.sessions = [session({ host: 'terminal', orcaPaneKey: null })]
      expect(await interactions.peek('claude:s1')).toEqual({
        success: false,
        reason: 'not-in-orca',
        lines: []
      })
    })
  })

  describe('a teammate, which has its own process and pane', () => {
    const teammate: SubagentRef = {
      id: 'ravi@session-s1',
      type: 'ravi',
      activity: 'thinking',
      kind: 'teammate',
      name: 'ravi',
      pid: 5,
      startedAtMs: 50,
      orcaPaneKey: 'tab2:leaf2'
    }
    const teammateKey = 'claude:s1#ravi@session-s1'

    beforeEach(() => {
      snapshot.sessions = [session({ subagents: [teammate] })]
      processStart.mockImplementation(async (pid: number) => (pid === 5 ? 50 : 1))
      orca.handleFor.mockImplementation(async (paneKey: string) =>
        paneKey === 'tab2:leaf2'
          ? pane({ handle: 'term_mate', agent: 'claude-agent-teams' })
          : pane()
      )
    })

    it('types a message into the teammate’s pane, not the lead’s', async () => {
      orca.screen.mockResolvedValue(IDLE_SCREEN)
      expect(await interactions.send(teammateKey, 'status?')).toEqual({ success: true })
      expect(orca.sendPrompt).toHaveBeenCalledWith('term_mate', 'status?')
    })

    it('types nothing while a prompt is on the teammate’s own screen', async () => {
      orca.screen.mockImplementation(async (handle: string) =>
        handle === 'term_mate' ? PROMPT_SCREEN : IDLE_SCREEN
      )
      expect(await interactions.send(teammateKey, 'no, wait')).toEqual({
        success: false,
        reason: 'prompt-on-screen'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('talks to a teammate while its lead waits on a dialog of its own', async () => {
      snapshot.sessions = [session({ attention: 'permission', subagents: [teammate] })]
      orca.screen.mockResolvedValue(IDLE_SCREEN)
      expect(await interactions.send(teammateKey, 'status?')).toEqual({ success: true })
    })

    it('peeks at the teammate’s own screen', async () => {
      orca.screen.mockResolvedValue(['mate line'])
      expect((await interactions.peek(teammateKey)).lines).toEqual(['mate line'])
      expect(orca.screen).toHaveBeenCalledWith('term_mate')
    })

    it('types nothing when the teammate’s process is no longer the one reported', async () => {
      processStart.mockResolvedValue(999)
      expect(await interactions.send(teammateKey, 'status?')).toEqual({
        success: false,
        reason: 'unknown-session'
      })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
    })

    it('never types into the lead’s terminal for an agent that runs inside the lead', async () => {
      snapshot.sessions = [
        session({ subagents: [{ id: 'a1', type: 'Explore', activity: 'reading' }] })
      ]
      expect(await interactions.send('claude:s1#a1', 'status?')).toEqual({
        success: false,
        reason: 'unknown-session'
      })
      expect(await interactions.peek('claude:s1#a1')).toMatchObject({ success: false })
      expect(orca.sendPrompt).not.toHaveBeenCalled()
      expect(orca.screen).not.toHaveBeenCalled()
    })
  })

  describe('start', () => {
    it('opens a new Orca terminal running the chosen agent in the project folder', async () => {
      expect(await interactions.start('p_app', 'codex')).toEqual({ success: true })
      expect(orca.create).toHaveBeenCalledWith('/repo/app', 'codex', 'New Codex agent')
    })

    it('starts no OpenCode agent: only Claude and Codex can be started from the office', async () => {
      expect(await interactions.start('p_app', 'opencode')).toEqual({
        success: false,
        reason: 'unsupported-provider'
      })
      expect(orca.create).not.toHaveBeenCalled()
      expect(openTerminalRunning).not.toHaveBeenCalled()
    })

    it('starts in the project root even when the known session runs in a worktree or subfolder', async () => {
      snapshot.sessions = [
        session({ worktree: '/repo/app-wt', cwd: '/repo/app-wt/src', projectRoot: '/repo/app' })
      ]
      await interactions.start('p_app', 'claude')
      expect(orca.create).toHaveBeenCalledWith('/repo/app', 'claude', 'New Claude agent')
    })

    it('falls back to Terminal.app when Orca cannot create the terminal', async () => {
      orca.create.mockRejectedValueOnce(new Error('runtime not running'))
      expect(await interactions.start('p_app', 'claude')).toEqual({ success: true })
      expect(openTerminalRunning).toHaveBeenCalledWith('/repo/app', 'claude')
    })

    it('says why when the fallback terminal could not find the agent', async () => {
      orca.create.mockRejectedValueOnce(new Error('runtime not running'))
      openTerminalRunning.mockResolvedValueOnce({ success: false, reason: 'agent-not-found' })
      expect(await interactions.start('p_app', 'codex')).toEqual({
        success: false,
        reason: 'agent-not-found'
      })
    })

    it('refuses an unknown project or provider', async () => {
      expect(await interactions.start('p_missing', 'claude')).toEqual({
        success: false,
        reason: 'unknown-session'
      })
      expect(await interactions.start('p_app', 'bash' as 'claude')).toEqual({
        success: false,
        reason: 'invalid-input'
      })
      expect(orca.create).not.toHaveBeenCalled()
    })
  })
})
