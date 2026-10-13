import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, stat, symlink, writeFile, chmod } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readJsonObject, writeJsonAtomic } from './settings-file'

describe('settings-file', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cw-settings-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads a JSON object', async () => {
    const file = join(dir, 'settings.json')
    await writeFile(file, '{"hooks":{"Stop":[]}}')
    expect(await readJsonObject(file)).toEqual({ status: 'ok', data: { hooks: { Stop: [] } } })
  })

  it('reports a missing file as missing', async () => {
    expect(await readJsonObject(join(dir, 'nope.json'))).toEqual({ status: 'missing' })
  })

  it('reports unparseable JSON instead of treating it as empty', async () => {
    const file = join(dir, 'settings.json')
    await writeFile(file, '{"hooks": {"PreToolUse": [ ')
    expect(await readJsonObject(file)).toEqual({ status: 'unparseable' })
  })

  it('reports a JSON array as unparseable, since settings must be an object', async () => {
    const file = join(dir, 'settings.json')
    await writeFile(file, '[]')
    expect(await readJsonObject(file)).toEqual({ status: 'unparseable' })
  })

  it('replaces the file and keeps the previous content as .bak', async () => {
    const file = join(dir, 'settings.json')
    await writeFile(file, '{"old":true}')
    await writeJsonAtomic(file, { fresh: true })
    expect(JSON.parse(await readFile(file, 'utf-8'))).toEqual({ fresh: true })
    expect(await readFile(`${file}.bak`, 'utf-8')).toBe('{"old":true}')
  })

  it('keeps the previous file mode', async () => {
    const file = join(dir, 'settings.json')
    await writeFile(file, '{}')
    await chmod(file, 0o600)
    // Windows has no POSIX bits (chmod reads back 0o666), so the mode is compared to what was set.
    const modeBefore = (await stat(file)).mode & 0o777
    if (process.platform !== 'win32') expect(modeBefore).toBe(0o600)
    await writeJsonAtomic(file, { a: 1 })
    expect((await stat(file)).mode & 0o777).toBe(modeBefore)
  })

  it('writes through a symlink to the real file instead of replacing the link', async () => {
    const real = join(dir, 'real-settings.json')
    const link = join(dir, 'settings.json')
    await writeFile(real, '{}')
    await symlink(real, link)
    await writeJsonAtomic(link, { linked: true })
    expect(JSON.parse(await readFile(real, 'utf-8'))).toEqual({ linked: true })
    expect((await stat(link)).isFile()).toBe(true)
  })

  it('creates a missing file without a backup', async () => {
    const file = join(dir, 'new.json')
    await writeJsonAtomic(file, { created: true })
    expect(JSON.parse(await readFile(file, 'utf-8'))).toEqual({ created: true })
    await expect(stat(`${file}.bak`)).rejects.toThrow()
  })
})
