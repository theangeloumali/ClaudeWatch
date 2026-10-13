import { afterEach, expect, it } from 'vitest'
import { appendFile, link, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startTimeQuery } from '../shared/platform-process'
import { systemIo } from './io'
import { readProcessTable } from './process-table'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})
it('reads bounded tails, discards partial first records and returns only header lines', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-tail-'))
  directories.push(directory)
  const path = join(directory, 'transcript.jsonl')
  const header = '{"type":"session_meta","payload":{"cwd":"/repo"}}'
  const last = '{"type":"event_msg","payload":{"type":"task_complete"}}\n'
  await writeFile(path, `${header}\n${'x'.repeat(70000)}\n${last}`)
  expect(await systemIo.readFirstLine(path)).toBe(header)
  expect(await systemIo.readTail(path)).toBe(last)
})

it('reads complete session metadata beyond 64 KB and bounds oversized headers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-header-'))
  directories.push(directory)
  const path = join(directory, 'rollout.jsonl')
  const header = JSON.stringify({
    type: 'session_meta',
    payload: { padding: 'x'.repeat(100000), id: 'a', cwd: '/repo' }
  })
  await writeFile(path, `${header}\nignored`)
  expect(await systemIo.readFirstLine(path)).toBe(header)
  await writeFile(path, 'x'.repeat(262145))
  expect(await systemIo.readFirstLine(path)).toBe('')
})

it('refuses to open credential stores, whatever a caller asks for', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-guard-'))
  directories.push(directory)
  for (const name of [
    '.credentials.json',
    'auth.json',
    'orca-runtime.json',
    '42.key',
    'work-auth.json',
    '.orca-managed-claude-auth',
    'orca-e2ee-keypair.json',
    'orca-secret-protection.json',
    'Cookies'
  ]) {
    const path = join(directory, name)
    await writeFile(path, 'DO_NOT_READ')
    await expect(systemIo.readText(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readTail(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readFirstLine(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readFrom(path, 0, 64)).rejects.toThrow('forbidden')
  }
})

it('refuses a credential store reached through a symlink or a different letter case', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-guard-'))
  directories.push(directory)
  await writeFile(join(directory, '.credentials.json'), 'DO_NOT_READ')
  await symlink(join(directory, '.credentials.json'), join(directory, '42.json'))
  for (const name of ['42.json', '.Credentials.JSON']) {
    const path = join(directory, name)
    await expect(systemIo.readText(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readTail(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readFirstLine(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readFrom(path, 0, 64)).rejects.toThrow('forbidden')
  }
})

// realpath names a hard link by its own name, so only the file's link count gives it away.
it('refuses a file with more than one name, which may be a credential store under another', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-guard-'))
  directories.push(directory)
  await writeFile(join(directory, '.credentials.json'), 'DO_NOT_READ')
  await link(join(directory, '.credentials.json'), join(directory, '42.json'))
  const path = join(directory, '42.json')
  await expect(systemIo.readText(path)).rejects.toThrow('forbidden: credential store')
  await expect(systemIo.readTail(path)).rejects.toThrow('forbidden: credential store')
  await expect(systemIo.readFirstLine(path)).rejects.toThrow('forbidden: credential store')
  await expect(systemIo.readFrom(path, 0, 64)).rejects.toThrow('forbidden: credential store')
  await writeFile(join(directory, '43.json'), '{}')
  expect(await systemIo.readText(join(directory, '43.json'))).toBe('{}')
})

it('reads forward from an offset in whole lines and says where to resume', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-from-'))
  directories.push(directory)
  const path = join(directory, 'transcript.jsonl')
  await writeFile(path, 'one\ntwé\nthr')
  expect(await systemIo.readFrom(path, 0, 1024)).toEqual({ text: 'one\ntwé\n', nextOffset: 9 })
  // A half-written last line waits for its newline.
  expect(await systemIo.readFrom(path, 9, 1024)).toEqual({ text: '', nextOffset: 9 })
  await appendFile(path, 'ee\n')
  expect(await systemIo.readFrom(path, 9, 1024)).toEqual({ text: 'three\n', nextOffset: 15 })
  expect(await systemIo.readFrom(path, 0, 6)).toEqual({ text: 'one\n', nextOffset: 4 })
  expect(await systemIo.readFrom(path, 99, 1024)).toEqual({ text: '', nextOffset: 99 })
  await writeFile(path, '')
  expect(await systemIo.readFrom(path, 0, 1024)).toEqual({ text: '', nextOffset: 0 })
})

it('refuses a Windows credential store by its backslashed path, before touching the disk', async () => {
  for (const path of [
    'C:\\Users\\me\\.claude\\.credentials.json',
    'C:\\Users\\me\\.codex\\auth.json',
    'C:\\Users\\me\\.claude\\sessions\\42.key'
  ]) {
    await expect(systemIo.readText(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readFrom(path, 0, 64)).rejects.toThrow('forbidden')
  }
})

it('runs only the programs the bridge needs', async () => {
  await expect(systemIo.exec('/bin/sh', ['-c', 'echo hi'])).rejects.toThrow('forbidden')
  await expect(systemIo.exec('cmd.exe', ['/c', 'echo hi'])).rejects.toThrow('forbidden')
  await expect(systemIo.exec('/usr/bin/security', ['find-generic-password'])).rejects.toThrow(
    'forbidden'
  )
  // The start-time query of this platform runs, with whatever env the bridge gives it.
  const { file, args } = startTimeQuery(process.pid)
  expect((await systemIo.exec(file, args)).trim()).not.toBe('')
})

it('lists this process in the table under the very start the start-time query prints', async () => {
  const own = (await readProcessTable(systemIo)).find((row) => row.pid === process.pid)
  const { file, args } = startTimeQuery(process.pid)
  const start = (await systemIo.exec(file, args)).trim().replace(/\s+/g, ' ')
  expect(own?.lstart.replace(/\s+/g, ' ')).toBe(start)
  expect(own?.argv.length).toBeGreaterThan(0)
}, 20_000)
