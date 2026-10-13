import { describe, expect, it } from 'vitest'
import {
  POWERSHELL,
  POWERSHELL_CWD,
  POWERSHELL_SPAWN,
  checkedPid,
  childEnv,
  filetimeToMs,
  isAbsoluteFolder,
  powershellArgs,
  powershellScriptOf,
  programName,
  splitCommandLine,
  startTimeQuery
} from './platform-process'

describe('startTimeQuery', () => {
  it('asks ps on macOS', () => {
    expect(startTimeQuery(42, 'darwin')).toEqual({
      file: '/bin/ps',
      args: ['-o', 'lstart=', '-p', '42']
    })
  })

  it('asks PowerShell for the FILETIME start on Windows', () => {
    expect(startTimeQuery(55152, 'win32')).toEqual({
      file: POWERSHELL,
      args: powershellArgs('[Diagnostics.Process]::GetProcessById(55152).StartTime.ToFileTimeUtc()')
    })
  })

  it.each([0, -1, 1.5, Number.NaN, 2 ** 53])('refuses pid %s', (pid) => {
    expect(() => startTimeQuery(pid, 'win32')).toThrow()
    expect(() => startTimeQuery(pid, 'darwin')).toThrow()
  })
})

describe('powershell', () => {
  it('runs one command with no profile and no prompts', () => {
    expect(powershellArgs('Get-Date')).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-Date'
    ])
  })

  it('gives back the one script of an exact powershellArgs call, and refuses anything else', () => {
    expect(powershellScriptOf(powershellArgs('Get-Date'))).toBe('Get-Date')
    for (const args of [
      [...powershellArgs('Get-Date'), ';Write-Output INJECTED'],
      ['-ExecutionPolicy', 'Bypass', '-Command', 'Get-Date'],
      ['-NoProfile', '-NonInteractive', '-Command'],
      []
    ])
      expect(() => powershellScriptOf(args)).toThrow(/PowerShell/)
  })

  it('is the absolute Windows PowerShell path', () => {
    expect(POWERSHELL).toMatch(/\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/)
  })
})

describe('checkedPid', () => {
  it('passes a positive safe integer and refuses any other value', () => {
    expect(checkedPid(55152)).toBe(55152)
    for (const pid of [0, -1, 1.5, Number.NaN, 2 ** 53]) expect(() => checkedPid(pid)).toThrow()
  })
})

describe('childEnv', () => {
  it('is the C locale in UTC on macOS', () => {
    expect(childEnv('darwin')).toEqual({ LC_ALL: 'C', TZ: 'UTC' })
  })

  it('adds only what PowerShell needs to start on Windows', () => {
    const env = childEnv('win32')
    expect(Object.keys(env).sort()).toEqual([
      'LC_ALL',
      'PSModulePath',
      'SystemRoot',
      'TZ',
      'windir'
    ])
    expect(env.SystemRoot).toMatch(/^[A-Za-z]:\\/)
  })

  // Unset, PowerShell 5.1 builds a module path holding a literal `%ProgramFiles%\...` entry,
  // which resolves against the working folder: a module planted there would autoload.
  it('names one absolute module path on Windows, the inbox modules', () => {
    expect(childEnv('win32').PSModulePath).toBe(
      `${childEnv('win32').SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\Modules`
    )
    expect(POWERSHELL_CWD).toBe(`${childEnv('win32').SystemRoot}\\System32`)
  })
})

describe('filetimeToMs', () => {
  it('converts a Windows creation time to Unix milliseconds', () => {
    expect(filetimeToMs('134363332085558530')).toBe(1791859608555)
  })

  it('is NaN for anything but a decimal FILETIME', () => {
    expect(filetimeToMs('')).toBeNaN()
    expect(filetimeToMs('Mon Oct 13 10:46:48 2026')).toBeNaN()
  })
})

describe('splitCommandLine', () => {
  it.each<[string, string[]]>([
    ['claude.exe --resume abc', ['claude.exe', '--resume', 'abc']],
    [
      '"C:\\Program Files\\Codex\\codex.exe" --cd "D:\\my proj"',
      ['C:\\Program Files\\Codex\\codex.exe', '--cd', 'D:\\my proj']
    ],
    ['C:\\tools\\node.exe   C:\\a\\b.js', ['C:\\tools\\node.exe', 'C:\\a\\b.js']],
    ['app.exe a\\\\"b c"', ['app.exe', 'a\\b c']],
    ['app.exe a\\"b', ['app.exe', 'a"b']],
    ['app.exe "say ""hi"""', ['app.exe', 'say "hi"']],
    ['app.exe C:\\dir\\ next', ['app.exe', 'C:\\dir\\', 'next']],
    ['app.exe "日本 語" ü', ['app.exe', '日本 語', 'ü']],
    ['"C:\\x\\a.exe"', ['C:\\x\\a.exe']],
    ['', []]
  ])('splits %j', (line, argv) => {
    expect(splitCommandLine(line)).toEqual(argv)
  })
})

describe('programName', () => {
  it.each([
    ['C:\\x\\Codex.EXE', 'codex'],
    ['/usr/local/bin/opencode', 'opencode'],
    ['C:\\Users\\a\\AppData\\Roaming\\npm\\claude.cmd', 'claude'],
    ['run.BAT', 'run'],
    ['node', 'node']
  ])('names %s as %s', (argv0, name) => {
    expect(programName(argv0)).toBe(name)
  })
})

describe('isAbsoluteFolder', () => {
  it.each<[string, NodeJS.Platform, boolean]>([
    ['/Users/a', 'darwin', true],
    ['relative', 'darwin', false],
    ['C:\\Users\\a', 'darwin', false],
    ['C:\\Users\\a', 'win32', true],
    ['d:/work', 'win32', true],
    ['\\\\server\\share\\dir', 'win32', true],
    ['/Users/a', 'win32', false],
    ['C:relative', 'win32', false],
    ['', 'win32', false]
  ])('%s on %s is %s', (path, platform, expected) => {
    expect(isAbsoluteFolder(path, platform)).toBe(expected)
  })
})

describe('POWERSHELL_SPAWN', () => {
  it('starts every PowerShell from System32 with no console window', () => {
    expect(POWERSHELL_SPAWN).toEqual({ cwd: POWERSHELL_CWD, windowsHide: true })
    expect(POWERSHELL_CWD).toMatch(/\System32$/)
  })
})
