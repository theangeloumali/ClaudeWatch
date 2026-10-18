import { beforeEach, expect, it, vi } from 'vitest'
import { ProcessMonitor } from '../process-monitor'

vi.mock('child_process', () => ({ execFile: vi.fn() }))
import { execFile } from 'child_process'

type ExecCallback = (error: Error | null, stdout?: string, stderr?: string) => void
const PS_HEADER = '  PID STAT  %CPU %MEM     ELAPSED TTY      STARTED                      COMMAND'
const STARTED = 'Thu Oct 15 14:23:38 2026'
const psRow = (pid: number, command: string, started = STARTED): string =>
  `${pid} S      0.0  0.1       02:30 ttys001  ${started}     ${command}`

// Answers ps with `table()` and lsof with a folder named after the pid it was asked about.
function answer(table: () => string): Array<{ bin: string; args: string[] }> {
  const calls: Array<{ bin: string; args: string[] }> = []
  vi.mocked(execFile).mockImplementation(((
    bin: string,
    args: string[],
    _options: unknown,
    cb: unknown
  ) => {
    calls.push({ bin, args })
    const pid = args[args.indexOf('-p') + 1]
    ;(cb as ExecCallback)(null, bin === 'ps' ? `${PS_HEADER}\n${table()}\n` : `n/repo/${pid}\n`)
  }) as typeof execFile)
  return calls
}
const lsofRuns = (calls: Array<{ bin: string }>): number =>
  calls.filter(({ bin }) => bin === 'lsof').length

beforeEach(() => vi.clearAllMocks())

// health-12: one ps per poll, and lsof only for a process not seen before.
it('runs lsof once for an unchanged process across two polls', async () => {
  const calls = answer(() => psRow(4242, '/usr/local/bin/claude'))
  const monitor = new ProcessMonitor({ platform: 'darwin' })
  await monitor.poll()
  const [instance] = await monitor.poll()

  expect(lsofRuns(calls)).toBe(1)
  expect(instance.projectPath).toBe('/repo/4242')
})

it('asks again for a new process that reuses an exited pid', async () => {
  let started = STARTED
  const calls = answer(() => psRow(4242, '/usr/local/bin/claude', started))
  const monitor = new ProcessMonitor({ platform: 'darwin' })
  await monitor.poll()
  started = 'Fri Oct 16 09:00:00 2026'
  await monitor.poll()

  expect(lsofRuns(calls)).toBe(2)
})

it("reads only the owner's own processes", async () => {
  const calls = answer(() => psRow(4242, '/usr/local/bin/claude'))
  await new ProcessMonitor({ platform: 'darwin' }).poll()

  expect(calls.find(({ bin }) => bin === 'ps')?.args[0]).toBe('-xo')
})

it('takes no browser native host for an instance', async () => {
  answer(() =>
    [
      psRow(2666, '/Users/a/.local/bin/claude --chrome-native-host'),
      psRow(4242, '/Users/a/.local/bin/claude')
    ].join('\n')
  )
  const instances = await new ProcessMonitor({ platform: 'darwin' }).poll()

  expect(instances.map(({ pid }) => pid)).toEqual([4242])
})

it('still lists a teammate as an instance', async () => {
  answer(() =>
    [
      psRow(4242, '/Users/a/.local/bin/claude'),
      psRow(4343, '/Users/a/.local/bin/claude --agent-id lena@team --parent-session-id lead')
    ].join('\n')
  )
  const instances = await new ProcessMonitor({ platform: 'darwin' }).poll()

  expect(instances.map(({ pid }) => pid)).toEqual([4242, 4343])
})
