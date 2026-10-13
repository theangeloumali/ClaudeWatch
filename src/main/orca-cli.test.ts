import { describe, it, expect, vi, beforeEach } from 'vitest'
import { orcaBundle, ORCA_CLI } from '../shared/orca-bundle'
import { createOrcaCli } from './orca-cli'

describe('createOrcaCli', () => {
  const run = vi.fn()
  const assertTrusted = vi.fn()
  const launch = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    run.mockResolvedValue({ stdout: '{"ok":true}', stderr: '' })
    assertTrusted.mockResolvedValue(undefined)
    launch.mockResolvedValue(undefined)
  })

  const programsRun = (): string[] => run.mock.calls.map(([bin]) => bin)

  it('has the bundle checked before each command, then runs it with fixed arguments', async () => {
    const cli = createOrcaCli(run, assertTrusted)

    expect(await cli.exec(['terminal', 'list', '--json'])).toBe('{"ok":true}')
    expect(assertTrusted.mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[0])
    expect(run.mock.calls.map(([bin, args]) => [bin, args])).toEqual([
      [ORCA_CLI, ['terminal', 'list', '--json']]
    ])

    await cli.exec(['status'])
    expect(assertTrusted).toHaveBeenCalledTimes(2)
  })

  it('asks for a second of trust to spare before a screen read, so the keys that follow share its check', async () => {
    const cli = createOrcaCli(run, assertTrusted)
    await cli.exec(['terminal', 'read', '--terminal', 'term_a', '--screen', '--json'])
    await cli.exec(['terminal', 'send', '--terminal', 'term_a', '--text', 'hi', '--json'])
    expect(assertTrusted.mock.calls).toEqual([[1000], [0]])
  })

  it('raises the bundle that was verified, not whichever app claims its bundle id', async () => {
    expect(await createOrcaCli(run, assertTrusted, 'darwin').raise()).toBe(true)
    expect(assertTrusted).toHaveBeenCalledOnce()
    expect(run.mock.calls.at(-1)?.slice(0, 2)).toEqual([
      '/usr/bin/open',
      ['-a', orcaBundle('darwin').app]
    ])
  })

  it('executes nothing from Orca, and raises nothing, when the bundle is not trusted', async () => {
    assertTrusted.mockRejectedValue(new Error('code failed to satisfy specified requirement'))
    const cli = createOrcaCli(run, assertTrusted)

    await expect(cli.exec(['terminal', 'list', '--json'])).rejects.toThrow()
    expect(await cli.raise()).toBe(false)
    expect(programsRun()).toEqual([])
  })

  it('reports a failed raise without throwing', async () => {
    run.mockRejectedValue(new Error('LSOpenURLsWithRole failed'))
    expect(await createOrcaCli(run, assertTrusted, 'darwin').raise()).toBe(false)
  })

  describe('on Windows', () => {
    const windows = orcaBundle('win32')

    it('runs the native launcher with the environment it needs, never orca.cmd', async () => {
      await createOrcaCli(run, assertTrusted, 'win32').exec(['terminal', 'list', '--json'])
      const [program, args, options] = run.mock.calls[0]
      expect([program, args]).toEqual([windows.cli, ['terminal', 'list', '--json']])
      expect(program).toMatch(/\\orca\.exe$/)
      expect(options.env).toHaveProperty('LC_ALL', 'C')
    })

    it('raises Orca by starting the verified Orca.exe itself', async () => {
      expect(await createOrcaCli(run, assertTrusted, 'win32', launch).raise()).toBe(true)
      expect(assertTrusted.mock.invocationCallOrder[0]).toBeLessThan(
        launch.mock.invocationCallOrder[0]
      )
      expect(launch).toHaveBeenCalledExactlyOnceWith(windows.app)
      expect(run).not.toHaveBeenCalled()
    })

    it('starts nothing when Orca is not trusted, and reports a failed start', async () => {
      assertTrusted.mockRejectedValueOnce(new Error('not validly signed'))
      expect(await createOrcaCli(run, assertTrusted, 'win32', launch).raise()).toBe(false)
      expect(launch).not.toHaveBeenCalled()
      launch.mockRejectedValueOnce(new Error('ENOENT'))
      expect(await createOrcaCli(run, assertTrusted, 'win32', launch).raise()).toBe(false)
    })
  })
})
