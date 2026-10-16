import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { loadUsageOffsets, saveUsageOffsets, type UsageOffset } from './usage-offsets'

let folder = ''
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'usage-offsets-'))
})
afterEach(() => rm(folder, { recursive: true, force: true }))

const counts = (input: number) => ({ input, output: 2, cacheWrite: 0, cacheRead: 3 })
const offset: UsageOffset = {
  offset: 120,
  ino: 42,
  fold: { closed: counts(1), openId: 'msg_1', open: counts(4) }
}

it('round-trips offsets through a file only its owner can read', async () => {
  const path = join(folder, 'usage-offsets.json')
  await saveUsageOffsets(path, new Map([['/p/s.jsonl', offset]]))

  expect(await loadUsageOffsets(path)).toEqual(new Map([['/p/s.jsonl', offset]]))
  expect((await stat(path)).mode & 0o777).toBe(0o600)
})

it('loads nothing from a missing or malformed file, and drops entries it cannot trust', async () => {
  const path = join(folder, 'usage-offsets.json')
  expect(await loadUsageOffsets(path)).toEqual(new Map())
  await writeFile(path, '{')
  expect(await loadUsageOffsets(path)).toEqual(new Map())
  await writeFile(
    path,
    JSON.stringify({
      v: 1,
      files: [
        ['/p/good.jsonl', offset],
        ['/p/negative.jsonl', { ...offset, offset: -1 }],
        ['/p/bad-fold.jsonl', { ...offset, fold: { ...offset.fold, open: { input: 'x' } } }]
      ]
    })
  )
  expect(await loadUsageOffsets(path)).toEqual(new Map([['/p/good.jsonl', offset]]))
})
