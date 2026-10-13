import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadStaticFiles } from './static-files'

const SCRIPT = resolve(__dirname, '../../scripts/sync-office-to-framework.mjs')
const LIMIT_BYTES = 480_000

interface Run {
  code: number
  stdout: string
  stderr: string
}

function sync(...args: string[]): Promise<Run> {
  return new Promise((done) => {
    execFile(process.execPath, [SCRIPT, ...args], (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
      done({ code, stdout, stderr })
    })
  })
}

describe('sync-office-to-framework', () => {
  let scratch: string
  let bundle: string
  let target: string

  async function put(folder: string, path: string, text: string): Promise<void> {
    await mkdir(dirname(join(folder, path)), { recursive: true })
    await writeFile(join(folder, path), text)
  }
  const manifestOf = async (folder: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(join(folder, 'MANIFEST.json'), 'utf8'))
  const listed = async (folder: string): Promise<string[]> =>
    (await readdir(folder, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      // Listed the way the manifest names files: relative, with forward slashes on every platform.
      .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'))
      .sort()

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'office-sync-'))
    bundle = join(scratch, 'bundle')
    target = join(scratch, 'framework', 'office')
    await put(bundle, 'server.mjs', 'server code')
    await put(bundle, 'web/office.html', '<!doctype html>')
    await put(bundle, 'web/assets/office.js', 'export {}')
  })

  afterEach(() => rm(scratch, { recursive: true, force: true }))

  it('copies the bundle and records every file’s size and hash with the source commit', async () => {
    const run = await sync(target, '--from', bundle)

    expect(run).toMatchObject({ code: 0, stderr: '' })
    expect(await listed(target)).toEqual([
      'MANIFEST.json',
      'server.mjs',
      'web/assets/office.js',
      'web/office.html'
    ])
    const manifest = await manifestOf(target)
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(typeof manifest.dirty).toBe('boolean')
    expect(manifest.limitBytes).toBe(LIMIT_BYTES)
    expect(manifest.files).toEqual([
      {
        path: 'server.mjs',
        bytes: 11,
        sha256: createHash('sha256').update('server code').digest('hex')
      },
      {
        path: 'web/assets/office.js',
        bytes: 9,
        sha256: createHash('sha256').update('export {}').digest('hex')
      },
      {
        path: 'web/office.html',
        bytes: 15,
        sha256: createHash('sha256').update('<!doctype html>').digest('hex')
      }
    ])
    expect(run.stdout).toContain('web/assets/office.js')
  })

  it('writes a manifest the Office server accepts', async () => {
    await sync(target, '--from', bundle)

    expect([...(await loadStaticFiles(target)).keys()].sort()).toEqual([
      '/assets/office.js',
      '/office.html'
    ])
  })

  it('refuses a bundle with a file over the limit, and writes nothing', async () => {
    await put(bundle, 'web/assets/three-core.js', 'x'.repeat(LIMIT_BYTES + 1))

    const run = await sync(target, '--from', bundle)

    expect(run.code).toBe(1)
    expect(run.stderr).toContain(`web/assets/three-core.js is ${LIMIT_BYTES + 1} bytes`)
    await expect(readdir(target)).rejects.toThrow()
  })

  it('accepts a file of exactly the limit', async () => {
    await put(bundle, 'web/assets/three-core.js', 'x'.repeat(LIMIT_BYTES))

    expect((await sync(target, '--from', bundle)).code).toBe(0)
  })

  it('stamps the manifest in place when the target is the bundle itself', async () => {
    await put(bundle, 'MANIFEST.json', '{"files":[]}')

    expect((await sync(bundle, '--from', bundle)).code).toBe(0)

    const files = (await manifestOf(bundle)).files
    expect(Array.isArray(files) && files.map((file) => file.path)).toEqual([
      'server.mjs',
      'web/assets/office.js',
      'web/office.html'
    ])
  })

  it('removes what an earlier sync put there and this bundle no longer has, and nothing else', async () => {
    await put(bundle, 'web/assets/old-chunk.js', 'export const old = 1')
    await sync(target, '--from', bundle)
    await put(target, 'README.md', 'kept: the framework wrote this')
    await rm(join(bundle, 'web/assets/old-chunk.js'))

    await sync(target, '--from', bundle)

    expect(await listed(target)).toEqual([
      'MANIFEST.json',
      'README.md',
      'server.mjs',
      'web/assets/office.js',
      'web/office.html'
    ])
  })

  it('never follows an old manifest out of the target folder', async () => {
    await put(scratch, 'framework/keep.txt', 'outside the office folder')
    await put(
      target,
      'MANIFEST.json',
      JSON.stringify({
        files: [{ path: '../keep.txt' }, { path: join(scratch, 'framework/keep.txt') }]
      })
    )

    expect((await sync(target, '--from', bundle)).code).toBe(0)

    expect(await readFile(join(scratch, 'framework/keep.txt'), 'utf8')).toBe(
      'outside the office folder'
    )
  })

  it('asks for a target instead of guessing one', async () => {
    const run = await sync('--from', bundle)

    expect(run.code).toBe(2)
    expect(run.stderr).toContain('Usage:')
  })

  it('says to build first when the bundle is not there', async () => {
    const run = await sync(target, '--from', join(scratch, 'missing'))

    expect(run.code).toBe(1)
    expect(run.stderr).toContain('npm run build:office-web')
    await expect(readdir(target)).rejects.toThrow()
  })
})
