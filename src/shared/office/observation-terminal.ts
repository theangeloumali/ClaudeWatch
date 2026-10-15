import { isJsonObject } from '../json-object'
import { UNSAFE_IN_A_NAME } from '../unsafe-text'
import type { TerminalProvenance } from './types'

// dry-new: terminal captures need inert text and a byte bound, unlike activity labels.
const MAX_CAPTURE_BYTES = 65_536
const ESCAPE = String.fromCharCode(27)
const BELL = String.fromCharCode(7)
const OSC = String.fromCharCode(157)
const CSI = String.fromCharCode(155)
const STRING_TERMINATOR = String.fromCharCode(156)
const TERMINAL_ESCAPE = new RegExp(
  `(?:${ESCAPE}\\]|${OSC})[^${BELL}${ESCAPE}${STRING_TERMINATOR}]*(?:${BELL}|${ESCAPE}\\\\|${STRING_TERMINATOR}|$)|(?:${ESCAPE}\\[|${CSI})[0-?]*[ -/]*[@-~]|${ESCAPE}[ -/]*[@-~]`,
  'g'
)
const TERMINAL_CONTROLS = new RegExp(UNSAFE_IN_A_NAME.source, 'gu')

export function inertTerminalLines(lines: readonly string[]): string[] {
  let remainingBytes = MAX_CAPTURE_BYTES
  const bounded: string[] = []
  const encoder = new TextEncoder()
  for (const line of lines) {
    if (bounded.length) remainingBytes -= 1
    if (remainingBytes <= 0) break
    let clean = ''
    for (const character of line.replace(TERMINAL_ESCAPE, '').replace(TERMINAL_CONTROLS, '')) {
      const bytes = encoder.encode(character).length
      if (bytes > remainingBytes) break
      clean += character
      remainingBytes -= bytes
    }
    bounded.push(clean)
  }
  return bounded
}

export function isTerminalProvenance(value: unknown): value is TerminalProvenance {
  return (
    isJsonObject(value) &&
    typeof value.ownerAgentKey === 'string' &&
    value.ownerAgentKey.length > 0 &&
    typeof value.paneKey === 'string' &&
    value.paneKey.length > 0 &&
    typeof value.pid === 'number' &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    typeof value.startedAtMs === 'number' &&
    Number.isFinite(value.startedAtMs) &&
    value.startedAtMs >= 0 &&
    typeof value.incarnationId === 'string' &&
    value.incarnationId.length > 0
  )
}
