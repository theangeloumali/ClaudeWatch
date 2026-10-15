import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfficeInteractions } from '../../office-interactions'
import { session } from '../../../bridge/__fixtures__/helpers'
import type { OfficeSnapshot } from '../../../shared/office/types'
import type { PaneTerminal } from '../../orca-terminals'

function harness() {
  let snapshot: OfficeSnapshot = {
    rev: 1,
    generatedAtMs: 1,
    sources: [],
    sessions: [{ ...session('a'), host: 'orca', orcaPaneKey: 'tab:leaf', startedAtMs: 5 }]
  }
  const terminal: PaneTerminal = {
    handle: 'terminal-a',
    incarnationId: 'inc-a',
    worktreePath: '/repo/app',
    agent: 'claude'
  }
  const orca = {
    handleFor: vi.fn(async () => terminal),
    screen: vi.fn(async () => ['fixture text']),
    sendPrompt: vi.fn(),
    sendKey: vi.fn(),
    create: vi.fn(),
    focus: vi.fn()
  }
  const processStart = vi.fn(async () => 5)
  const service = new OfficeInteractions({
    snapshot: () => snapshot,
    orca,
    processStart,
    openTerminalRunning: vi.fn(),
    openFolder: vi.fn(),
    raiseOrca: vi.fn()
  })
  return {
    service,
    orca,
    processStart,
    terminal,
    replace: (next: OfficeSnapshot) => {
      snapshot = next
    },
    snapshot: () => snapshot
  }
}

describe('manual peek provenance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(50000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('labels the exact target and original terminal incarnation', async () => {
    const test = harness()
    expect(await test.service.peek('claude:a')).toMatchObject({
      success: true,
      targetAgentKey: 'claude:a',
      capturedAtMs: 50000,
      terminal: {
        ownerAgentKey: 'claude:a',
        paneKey: 'tab:leaf',
        pid: 42,
        startedAtMs: 5,
        incarnationId: 'inc-a'
      }
    })
    expect(test.orca.sendPrompt).not.toHaveBeenCalled()
    expect(test.orca.sendKey).not.toHaveBeenCalled()
    expect(test.orca.focus).not.toHaveBeenCalled()
  })

  it.each(['pid', 'pane', 'session', 'conversation'] as const)(
    'discards a deferred read after %s ownership changes',
    async (change) => {
      const test = harness()
      let finishRead: (lines: string[]) => void = () => {
        throw new Error('read not started')
      }
      let announceRead: () => void = () => {
        throw new Error('read not started')
      }
      const started = new Promise<void>((resolve) => {
        announceRead = resolve
      })
      test.orca.screen.mockImplementation(() => {
        announceRead()
        return new Promise<string[]>((resolve) => {
          finishRead = resolve
        })
      })
      const pending = test.service.peek('claude:a')
      await started
      if (change === 'pid') test.processStart.mockResolvedValue(99)
      if (change === 'pane')
        test.orca.handleFor.mockResolvedValue({ ...test.terminal, incarnationId: 'inc-replaced' })
      if (change === 'session') test.replace({ ...test.snapshot(), sessions: [] })
      if (change === 'conversation')
        test.replace({
          ...test.snapshot(),
          sessions: [{ ...test.snapshot().sessions[0], sessionId: 'replacement' }]
        })
      finishRead(['must not escape'])
      const result = await pending
      expect(result.success).toBe(false)
      expect(result.lines).toEqual([])
      expect(result).not.toHaveProperty('fingerprint')
      expect(result).not.toHaveProperty('capturedAtMs')
    }
  )

  it('never reads a lead pane for an uncovered child target', async () => {
    const test = harness()
    test.replace({
      ...test.snapshot(),
      sessions: [
        {
          ...test.snapshot().sessions[0],
          subagents: [{ id: 'child', type: 'Explore', activity: 'thinking' }]
        }
      ]
    })
    expect(await test.service.peek('claude:a#child')).toEqual({
      success: false,
      reason: 'unknown-session',
      lines: []
    })
    expect(test.orca.screen).not.toHaveBeenCalled()
  })

  it('discards an older capture when a later manual target was selected', async () => {
    const test = harness()
    let finishRead: (lines: string[]) => void = () => {
      throw new Error('read not started')
    }
    let announceRead: () => void = () => {
      throw new Error('read not started')
    }
    const started = new Promise<void>((resolve) => {
      announceRead = resolve
    })
    test.orca.screen.mockImplementationOnce(() => {
      announceRead()
      return new Promise<string[]>((resolve) => {
        finishRead = resolve
      })
    })
    const oldCapture = test.service.peek('claude:a')
    await started
    expect((await test.service.peek('claude:wrong-target')).success).toBe(false)
    finishRead(['old target text'])
    expect(await oldCapture).toEqual({ success: false, reason: 'prompt-changed', lines: [] })
  })

  it('strips ANSI, OSC, and controls and bounds terminal output bytes', async () => {
    const test = harness()
    test.orca.screen.mockResolvedValue([
      '\u001b[31mred\u001b[0m\u001b]8;;https://example.test\u0007link\u001b]8;;\u0007\u0000',
      '😀'.repeat(40000)
    ])
    const result = await test.service.peek('claude:a')
    for (const line of result.lines) expect(line).not.toMatch(/\p{Cc}/u)
    expect(Buffer.byteLength(result.lines.join('\n'))).toBeLessThanOrEqual(65536)
  })
})
