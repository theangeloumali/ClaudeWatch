import { execFile } from 'node:child_process'
import { open, readdir, realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { isJsonObject } from '../shared/json-object'
import { assertOrcaTrusted, ORCA_CLI, orcaCliEnv } from '../shared/orca-bundle'
import { childEnv, POWERSHELL, powershellArgs } from '../shared/platform-process'
import { runPowerShell } from '../shared/powershell-host'
import { UNSAFE_IN_A_NAME } from '../shared/unsafe-text'
import {
  OPENCODE_STATEMENTS,
  OpencodeDbError,
  type OpencodeQuery,
  readOpencodeDb
} from './opencode-db'

interface FileInfo {
  directory: boolean
  mtimeMs: number
  size: number
}
// Whole lines only: `text` ends at the last newline read, and `nextOffset` is where to resume.
interface ForwardRead {
  text: string
  nextOffset: number
}
// How long a program may run before it is killed; five seconds unless the caller says.
interface ExecOptions {
  timeoutMs?: number
}
export interface BridgeIo {
  readText(path: string): Promise<string>
  readTail(path: string): Promise<string>
  readFirstLine(path: string): Promise<string>
  readFrom(path: string, offset: number, maxBytes: number): Promise<ForwardRead>
  list(path: string): Promise<string[]>
  stat(path: string): Promise<FileInfo>
  exec(file: string, args: string[], options?: ExecOptions): Promise<string>
  // OpenCode's session database, read-only, through the fixed statements and nothing else.
  readOpencode<Result>(path: string, read: (query: OpencodeQuery) => Result): Promise<Result>
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readTail(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const start = Math.max(0, size - 65536)
    const buffer = Buffer.alloc(Math.min(size, 65536))
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start)
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    // A partial first JSON record cannot safely be interpreted.
    return start > 0 ? text.slice(text.indexOf('\n') + 1) : text
  } finally {
    await file.close()
  }
}

async function readFirstLine(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const cap = 256 * 1024
    const chunks: Buffer[] = []
    let offset = 0
    while (offset <= cap) {
      const buffer = Buffer.alloc(Math.min(16384, cap + 1 - offset))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset)
      if (!bytesRead) return Buffer.concat(chunks).toString('utf8')
      const chunk = buffer.subarray(0, bytesRead)
      const newline = chunk.indexOf(10)
      if (newline >= 0) {
        chunks.push(chunk.subarray(0, newline))
        return Buffer.concat(chunks).toString('utf8')
      }
      offset += bytesRead
      if (offset > cap) return ''
      chunks.push(chunk)
    }
    return ''
  } finally {
    await file.close()
  }
}

async function readFrom(path: string, offset: number, maxBytes: number): Promise<ForwardRead> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const buffer = Buffer.alloc(Math.max(0, Math.min(maxBytes, size - offset)))
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset)
    // Byte 10 never occurs inside a multi-byte UTF-8 character, so the cut is always clean.
    const end = buffer.subarray(0, bytesRead).lastIndexOf(10) + 1
    return { text: buffer.subarray(0, end).toString('utf8'), nextOffset: offset + end }
  } finally {
    await file.close()
  }
}

// Enforced here, at the only door to the disk and to subprocesses, so no source can
// reach a credential store or a shell by mistake. The one program run elsewhere is codesign,
// by the Orca bundle check, with a fixed path and fixed arguments.
const CREDENTIAL_STORE =
  /(^|[\\/])(\.credentials\.json|[\w.-]*auth\.json|\.orca-managed-claude-auth|orca-(runtime|e2ee-keypair|secret-protection)\.json|Cookies)$|\.key$/i
const PROGRAMS = new Set(['/bin/ps', '/usr/sbin/lsof', POWERSHELL, ORCA_CLI])
const forbidden = (what: string): Error => new Error(`forbidden: ${what}`)
// PowerShell runs whatever follows -Command as code, appended arguments included: a script is
// all a caller can hand it.
function powershellScript(args: string[]): string {
  const script = args.at(-1) ?? ''
  const expected = powershellArgs(script)
  if (args.some((arg, index) => arg !== expected[index]) || args.length !== expected.length)
    throw forbidden('program')
  return script
}
const EXEC_TIMEOUT_MS = 5000
const guarded =
  <Rest extends unknown[], Result>(read: (path: string, ...rest: Rest) => Promise<Result>) =>
  async (path: string, ...rest: Rest): Promise<Result> => {
    if (CREDENTIAL_STORE.test(path)) throw forbidden('credential store')
    // The file a symlink points at is checked too, and that resolved file is the one opened.
    const target = await realpath(path)
    if (CREDENTIAL_STORE.test(target)) throw forbidden('credential store')
    return read(target, ...rest)
  }

// The one SQLite file the bridge opens. Its neighbours auth.json and mcp-auth.json are refused
// above like any credential store; the statement is picked by name from a fixed set.
const OPENCODE_DATABASE = 'opencode.db'
function readOpencode<Result>(target: string, read: (query: OpencodeQuery) => Result): Result {
  if (basename(target) !== OPENCODE_DATABASE) throw forbidden('database')
  return readOpencodeDb(target, (run) =>
    read((statement, ...values) => {
      if (!Object.hasOwn(OPENCODE_STATEMENTS, statement)) throw forbidden('statement')
      return run(statement, ...values)
    })
  )
}

// Rosters, registry entries and agent metadata are a few kilobytes. The size is checked on
// the open file, so a file that grows afterwards cannot be read past it.
const MAX_WHOLE_FILE_BYTES = 1024 * 1024
async function readWhole(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    if (size > MAX_WHOLE_FILE_BYTES) throw forbidden('file too large')
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await file.read(buffer, 0, size, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await file.close()
  }
}

export const systemIo: BridgeIo = {
  readText: guarded(readWhole),
  readTail: guarded(readTail),
  readFirstLine: guarded(readFirstLine),
  readFrom: guarded(readFrom),
  list: (path) => readdir(path),
  stat: async (path) => {
    const info = await stat(path)
    return { directory: info.isDirectory(), mtimeMs: info.mtimeMs, size: info.size }
  },
  exec: async (file, args, { timeoutMs = EXEC_TIMEOUT_MS } = {}) => {
    if (!PROGRAMS.has(file)) throw forbidden('program')
    // Orca's bundle is checked before anything in it runs, as in the main process.
    if (file === ORCA_CLI) await assertOrcaTrusted()
    if (file === POWERSHELL) {
      const script = powershellScript(args)
      if (process.platform === 'win32') return runPowerShell(script, timeoutMs)
    }
    // Orca's CLI cannot start without APPDATA on Windows; every other program gets the minimum.
    const env = file === ORCA_CLI ? orcaCliEnv() : childEnv()
    return new Promise((resolve, reject) => {
      execFile(
        file,
        args,
        { env, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (error, stdout) => {
          if (error) reject(error)
          else resolve(stdout)
        }
      )
    })
  },
  readOpencode: async (path, read) => {
    try {
      return await guarded(async (target: string) => readOpencode(target, read))(path)
    } catch (error) {
      throw isMissing(error) ? new OpencodeDbError('missing') : error
    }
  }
}

export async function isDirectory(path: string, io: BridgeIo): Promise<boolean> {
  try {
    return (await io.stat(path)).directory
  } catch {
    return false
  }
}

export function object(value: unknown): Record<string, unknown> | null {
  return isJsonObject(value) ? value : null
}

// An agent type or a tool name read from disk, before it may enter the feed: short, one
// line, letters and digits with the few marks real names use ("feature-dev:code-reviewer").
const LABEL = /^[\p{L}\p{N}_.:-][\p{L}\p{N}_ .:-]{0,127}$/u
export const isLabel = (value: unknown): value is string =>
  typeof value === 'string' && LABEL.test(value)

// A session name read from disk, before it may enter the feed: control characters and bidi
// overrides can reorder or hide what the name shows.
const UNPRINTABLE = new RegExp(UNSAFE_IN_A_NAME, 'gu')
const MAX_NAME_LENGTH = 80
export function displayName(text: string): string {
  return text.replace(/\s+/g, ' ').replace(UNPRINTABLE, '').trim().slice(0, MAX_NAME_LENGTH)
}
export const folderName = (cwd: string): string => displayName(basename(cwd))

export function jsonObject(text: string): Record<string, unknown> | null {
  try {
    return object(JSON.parse(text))
  } catch {
    return null
  }
}
