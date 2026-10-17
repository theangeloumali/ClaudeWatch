import { addCounts, zeroCounts } from '../shared/office/token-counts'
import type { TokenCounts } from '../shared/office/types'
import { jsonObject, object } from './io'

export interface UsageFold {
  closed: TokenCounts
  openId: string | null
  open: TokenCounts
}

export interface UsageIncrement {
  atMs: number
  // The byte of its file the line starts at.
  position: number
  counts: TokenCounts
}

export function emptyFold(): UsageFold {
  return { closed: zeroCounts(), openId: null, open: zeroCounts() }
}

// A token count as read from disk: anything that is not a positive number counts as none, and
// none is larger than an exact integer, so sums stay finite and never reach the feed as null.
export const tokenCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, Number.MAX_SAFE_INTEGER)
    : 0

// A message is written once per content block and every line repeats its usage, growing while
// it streams. Repeats are adjacent, so one open id is enough: the same id raises each field to
// its maximum, a new id closes the last one. Summing every line over-counts about 2.1 times.
export function foldLines(
  fold: UsageFold,
  text: string,
  // Told what each line added and when it was written; the amounts sum to the fold's growth.
  onAdded?: (increment: UsageIncrement) => void,
  // The byte of its file `text` starts at.
  startsAt = 0
): UsageFold {
  let { closed, openId, open } = fold
  let nextLineAt = startsAt
  for (const line of text.split('\n')) {
    const position = nextLineAt
    // Measured only for a listener: it is a second pass over every line.
    if (onAdded) nextLineAt += Buffer.byteLength(line) + 1
    // Quotes inside a JSON string are escaped, so this test can skip a line but never a usage.
    if (!line.includes('"usage"')) continue
    const record = jsonObject(line)
    const message = object(record?.message)
    const usage = object(message?.usage)
    if (
      record?.type !== 'assistant' ||
      !message ||
      !usage ||
      typeof message.id !== 'string' ||
      message.model === '<synthetic>'
    )
      continue
    const counts: TokenCounts = {
      input: tokenCount(usage.input_tokens),
      output: tokenCount(usage.output_tokens),
      cacheWrite: tokenCount(usage.cache_creation_input_tokens),
      cacheRead: tokenCount(usage.cache_read_input_tokens)
    }
    const before = message.id === openId ? open : zeroCounts()
    if (message.id !== openId) {
      closed = addCounts(closed, open)
      openId = message.id
    }
    open = {
      input: Math.max(before.input, counts.input),
      output: Math.max(before.output, counts.output),
      cacheWrite: Math.max(before.cacheWrite, counts.cacheWrite),
      cacheRead: Math.max(before.cacheRead, counts.cacheRead)
    }
    if (!onAdded) continue
    const added: TokenCounts = {
      input: open.input - before.input,
      output: open.output - before.output,
      cacheWrite: open.cacheWrite - before.cacheWrite,
      cacheRead: open.cacheRead - before.cacheRead
    }
    const atMs = recordAtMs(record)
    // Without a time the tokens cannot be placed under an account; the fold still counts them.
    if (Number.isFinite(atMs) && Object.values(added).some((amount) => amount > 0))
      onAdded({ atMs, position, counts: added })
  }
  return { closed, openId, open }
}

const recordAtMs = (record: Record<string, unknown> | null): number =>
  typeof record?.timestamp === 'string' ? Date.parse(record.timestamp) : Number.NaN

// When a transcript's conversation began: the time of its first timestamped record.
export function firstRecordAtMs(head: string): number | undefined {
  for (const line of head.split('\n')) {
    const atMs = recordAtMs(jsonObject(line))
    if (Number.isFinite(atMs)) return atMs
  }
  return undefined
}

export function foldTotal(fold: UsageFold): TokenCounts {
  return addCounts(fold.closed, fold.open)
}

// What the latest message was sent: everything in the window before its reply.
export function contextTokens(fold: UsageFold): number | null {
  return fold.openId === null ? null : fold.open.input + fold.open.cacheRead + fold.open.cacheWrite
}
