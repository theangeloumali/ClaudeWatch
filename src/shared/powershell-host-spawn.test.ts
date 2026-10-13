import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, it, vi } from 'vitest'

const { spawn, execFile } = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn, execFile }))
import { childEnv, POWERSHELL, POWERSHELL_CWD, powershellArgs } from './platform-process'
import { POWERSHELL_HOST_SCRIPT, PowerShellHost } from './powershell-host'

function child(): EventEmitter & Record<'stdin' | 'stdout' | 'stderr', PassThrough> {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    unref: () => {},
    kill: () => true
  })
}

it('starts the kept shell hidden, on pipes, with nothing of this process’s env but what it needs', async () => {
  const shell = child()
  spawn.mockReturnValue(shell)
  const host = new PowerShellHost({ onParentExit: () => {} })
  void host.run('$PID').catch(() => {})
  await new Promise((resolve) => setImmediate(resolve))
  expect(spawn).toHaveBeenCalledExactlyOnceWith(
    POWERSHELL,
    powershellArgs(POWERSHELL_HOST_SCRIPT),
    {
      env: childEnv('win32'),
      cwd: POWERSHELL_CWD,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    }
  )
  host.close()
})

it('runs a script cold, hidden, when the kept shell cannot start', async () => {
  const shell = child()
  spawn.mockReturnValue(shell)
  execFile.mockImplementation((_file, _args, _options, done) => done(null, '42'))
  const host = new PowerShellHost({ onParentExit: () => {} })
  const run = host.run('$PID', 3000)
  await new Promise((resolve) => setImmediate(resolve))
  shell.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }))
  expect(await run).toBe('42')
  expect(execFile.mock.calls[0].slice(0, 3)).toEqual([
    POWERSHELL,
    powershellArgs('$PID'),
    expect.objectContaining({
      env: childEnv('win32'),
      cwd: POWERSHELL_CWD,
      timeout: 3000,
      windowsHide: true
    })
  ])
})
