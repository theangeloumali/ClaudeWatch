import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { runPowerShell } from '../../shared/powershell-host'
import { Win32Detector, formatElapsed } from './win32'

// No test here may start a real PowerShell.
vi.mock('../../shared/powershell-host', () => ({ runPowerShell: vi.fn() }))

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const GIB = 1024 ** 3
const toFiletime = (ms: number): string => String((BigInt(ms) + 11644473600000n) * 10000n)
const CLAUDE = 'C:\\nvm4w\\nodejs\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe'

interface Row {
  pid: number
  command: string
  startedAt: string
  startedTicks: string
  cpuTicks: string
  workingSet: string
}
// The exact start ends in 7, the 100 ns digit CIM's microsecond CreationDate drops.
const EXACT_START = String(BigInt(toFiletime(NOW - 150_000)) + 7n)
// CIM CreationDate.Ticks, Claude Code's fallback procStart: local DateTime ticks.
const CIM_TICKS = '639274852085558530'
function row(overrides: Partial<Row> = {}): Row {
  return {
    pid: 4242,
    command: `${CLAUDE} --resume abc123 --dangerously-skip-permissions`,
    startedAt: EXACT_START,
    startedTicks: CIM_TICKS,
    // 3 s of CPU over 150 s alive.
    cpuTicks: String(3_000 * 10_000),
    workingSet: String(GIB / 4),
    ...overrides
  }
}

function detectorOver(rowsPerPoll: unknown[][], files: Record<string, string> = {}) {
  let now = NOW
  const runScript = vi.fn(async (_script: string) => JSON.stringify(rowsPerPoll.shift() ?? []))
  const readText = vi.fn(async (path: string) => {
    if (!(path in files)) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return files[path]
  })
  const detector = new Win32Detector({
    runScript,
    readText,
    home: 'C:\\Users\\ada',
    now: () => now,
    totalMemoryBytes: GIB
  })
  return { detector, runScript, readText, advance: (ms: number) => (now += ms) }
}
const registryPath = (pid: number): string =>
  join('C:\\Users\\ada', '.claude', 'sessions', `${pid}.json`)

describe('Win32Detector.getClaudeProcesses', () => {
  it('runs one CIM query per poll, over claude.exe only, and never wmic', async () => {
    const { detector, runScript } = detectorOver([[row()]])
    await detector.getClaudeProcesses()

    expect(runScript).toHaveBeenCalledTimes(1)
    const [script] = runScript.mock.calls[0]
    expect(script).toContain('Get-CimInstance Win32_Process')
    expect(script).toContain('-Filter "Name=\'claude.exe\'"')
    expect(script).not.toMatch(/wmic/i)
  })

  it('takes each start from .NET at full precision, not from CIM', async () => {
    const { detector, runScript } = detectorOver([[row()]])
    await detector.getClaudeProcesses()
    const [script] = runScript.mock.calls[0]
    expect(script).toContain("[Diagnostics.Process]::GetProcessesByName('claude')")
    expect(script).toContain('StartTime.ToFileTimeUtc()')
    expect(script).not.toContain('CreationDate.ToFileTimeUtc()')
  })

  it('reports each Claude Code process with its memory share and age', async () => {
    const { detector } = detectorOver([[row()]])
    expect(await detector.getClaudeProcesses()).toEqual([
      {
        pid: 4242,
        stat: 'S',
        cpuPercent: 2,
        memPercent: 25,
        elapsedTime: '02:30',
        tty: 'console',
        command: `${CLAUDE} --resume abc123 --dangerously-skip-permissions`
      }
    ])
  })

  it('measures CPU over the time since the previous poll once it has seen a process', async () => {
    const first = row()
    const { detector, advance } = detectorOver([
      [first],
      // 1.5 s of CPU in the next 3 s.
      [row({ cpuTicks: String(Number(first.cpuTicks) + 1_500 * 10_000) })]
    ])
    await detector.getClaudeProcesses()
    advance(3_000)
    const [process] = await detector.getClaudeProcesses()
    expect(process.cpuPercent).toBeCloseTo(50)
  })

  it.each([
    [
      'the Claude desktop app',
      'C:\\Users\\ada\\AppData\\Local\\AnthropicClaude\\app-1.0.0\\claude.exe'
    ],
    [
      'an Electron helper of the desktop app',
      'C:\\Users\\ada\\Claude\\claude.exe --type=renderer --user-data-dir=x'
    ],
    [
      'the desktop app installed from the Store',
      'C:\\Program Files\\WindowsApps\\Claude_1.0.0_x64__abc\\app\\claude.exe'
    ],
    ['a process whose program is not claude', 'C:\\tools\\claude-helper.exe'],
    ['a process with no command line', '']
  ])('leaves out %s', async (_case, command) => {
    const { detector } = detectorOver([[row({ command })]])
    expect(await detector.getClaudeProcesses()).toEqual([])
  })

  it.each([
    ['output that is not JSON', 'not json'],
    ['a row with no usable pid', JSON.stringify([{ ...row(), pid: -1 }])],
    ['a row that is not an object', JSON.stringify([7])],
    ['a row that is a list', JSON.stringify([[4242, 'claude.exe']])]
  ])('reports nothing for %s', async (_case, stdout) => {
    const { detector, runScript } = detectorOver([])
    runScript.mockResolvedValueOnce(stdout)
    expect(await detector.getClaudeProcesses()).toEqual([])
  })

  it('asks the kept PowerShell host when no runner is given', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce(JSON.stringify([row()]))
    const [process] = await new Win32Detector({ totalMemoryBytes: GIB }).getClaudeProcesses()
    expect(runPowerShell).toHaveBeenCalledWith(
      expect.stringContaining('Get-CimInstance Win32_Process')
    )
    expect(process.pid).toBe(4242)
  })

  it('reports nothing when PowerShell fails', async () => {
    const { detector, runScript } = detectorOver([])
    runScript.mockRejectedValueOnce(new Error('timed out'))
    expect(await detector.getClaudeProcesses()).toEqual([])
  })

  it('reports an age of zero when the start time is not given', async () => {
    const { detector } = detectorOver([[row({ startedAt: '' })]])
    const [process] = await detector.getClaudeProcesses()
    expect(process.elapsedTime).toBe('00:00')
    expect(process.cpuPercent).toBe(0)
  })
})

describe('Win32Detector.getWorkingDirectory', () => {
  const registry = (cwd: string, procStart = row().startedAt): string =>
    JSON.stringify({ pid: 4242, cwd, procStart })

  it.each([
    ['the exact FILETIME Claude Code records', EXACT_START],
    ['the CIM ticks Claude Code falls back to', CIM_TICKS]
  ])('reads the folder of a session whose start is %s', async (_case, procStart) => {
    const { detector } = detectorOver([[row()]], {
      [registryPath(4242)]: registry('C:\\Users\\ada\\repo', procStart)
    })
    await detector.getClaudeProcesses()
    expect(await detector.getWorkingDirectory(4242)).toBe('C:\\Users\\ada\\repo')
  })

  it('does not take a start CIM truncated to microseconds for the exact one', async () => {
    const truncated = toFiletime(NOW - 150_000)
    const { detector } = detectorOver([[row()]], {
      [registryPath(4242)]: registry('C:\\Users\\ada\\repo', truncated)
    })
    await detector.getClaudeProcesses()
    expect(await detector.getWorkingDirectory(4242)).toBe('')
  })

  it('ignores a record left by an earlier process that had the same pid', async () => {
    const { detector } = detectorOver([[row()]], {
      [registryPath(4242)]: registry('C:\\Users\\ada\\old', toFiletime(NOW - 999_000))
    })
    await detector.getClaudeProcesses()
    expect(await detector.getWorkingDirectory(4242)).toBe('')
  })

  it.each([
    ['no record', {}],
    ['a relative folder', { [registryPath(4242)]: registry('repo') }],
    ['a record that is not JSON', { [registryPath(4242)]: '{' }],
    ['a record that is a list', { [registryPath(4242)]: JSON.stringify(['C:\\repo']) }]
  ])('reports no folder for %s', async (_case, files) => {
    const { detector } = detectorOver([[row()]], files)
    await detector.getClaudeProcesses()
    expect(await detector.getWorkingDirectory(4242)).toBe('')
  })

  it('never reads a record for something that is not a pid', async () => {
    const { detector, readText } = detectorOver([])
    expect(await detector.getWorkingDirectory(Number.NaN)).toBe('')
    expect(readText).not.toHaveBeenCalled()
  })
})

describe('formatElapsed', () => {
  it.each([
    [0, '00:00'],
    [150, '02:30'],
    [3 * 3600 + 4 * 60 + 5, '03:04:05'],
    [86400 + 2 * 3600 + 3 * 60 + 4, '1-02:03:04']
  ])('writes %i seconds the way ps does: %s', (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected)
  })
})
