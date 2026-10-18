import { open, readFile, rename, rm } from 'node:fs/promises'
import { isJsonObject } from '../shared/json-object'
import type { TokenCounts } from '../shared/office/types'
import type { UsageFold } from './usage-fold'

// Where a transcript's count stood, so a new bridge resumes there instead of at byte 0 (health-4).
export interface UsageOffset {
  offset: number
  ino: number
  fold: UsageFold
}
const VERSION = 1
// Far above the live transcripts of any one machine; a file past it is not this cache.
const MAX_FILES = 20_000
const MAX_FILE_BYTES = 16 * 1024 * 1024

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function countsOf(value: unknown): TokenCounts | null {
  if (!isJsonObject(value)) return null
  const { input, output, cacheWrite, cacheRead } = value
  return isCount(input) && isCount(output) && isCount(cacheWrite) && isCount(cacheRead)
    ? { input, output, cacheWrite, cacheRead }
    : null
}

function offsetOf(value: unknown): UsageOffset | null {
  if (!isJsonObject(value) || !isCount(value.offset) || !isCount(value.ino)) return null
  const fold = isJsonObject(value.fold) ? value.fold : {}
  const closed = countsOf(fold.closed)
  const open = countsOf(fold.open)
  const { openId } = fold
  if (!closed || !open || (openId !== null && typeof openId !== 'string')) return null
  return { offset: value.offset, ino: value.ino, fold: { closed, openId, open } }
}

// Nothing it cannot trust: a missing, oversized or malformed file, or entry, is read afresh.
export async function loadUsageOffsets(path: string): Promise<Map<string, UsageOffset>> {
  const offsets = new Map<string, UsageOffset>()
  let stored: unknown
  try {
    const text = await readFile(path, 'utf8')
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) return offsets
    stored = JSON.parse(text)
  } catch {
    return offsets
  }
  if (!isJsonObject(stored) || stored.v !== VERSION || !Array.isArray(stored.files)) return offsets
  for (const entry of stored.files.slice(0, MAX_FILES)) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
    const offset = offsetOf(entry[1])
    if (offset) offsets.set(entry[0], offset)
  }
  return offsets
}

// Written whole and renamed into place, so a crash leaves the last complete file.
export async function saveUsageOffsets(
  path: string,
  offsets: ReadonlyMap<string, UsageOffset>
): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`
  // Removed first, so the file is created afresh with the owner-only mode.
  await rm(temporary, { force: true })
  const file = await open(temporary, 'w', 0o600)
  try {
    await file.writeFile(JSON.stringify({ v: VERSION, files: [...offsets] }))
  } finally {
    await file.close()
  }
  await rename(temporary, path).catch(async (error: unknown) => {
    await rm(temporary, { force: true })
    throw error
  })
}
