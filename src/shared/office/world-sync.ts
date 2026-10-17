import { isJsonObject } from '../json-object'
import type { OfficeSnapshot } from './types'
import { parseWorldDocument } from './world-document'
import type { WorldDocument } from './world-document-types'

// A hello's snapshot from a host that keeps the city; null when it holds none yet.
export type WorldSnapshot = OfficeSnapshot & { world?: WorldDocument | null }

const WORLD_SAVE_REFUSALS = [
  'invalid-document',
  'conflict',
  'storage-write',
  'not-permitted'
] as const
type WorldSaveRefusal = (typeof WORLD_SAVE_REFUSALS)[number]

// The host's answer when a page saves its city (health-13). A refusal carries what the host
// holds, so the page can show that instead.
export type WorldSaveReply =
  | { success: true; document: WorldDocument }
  | { success: false; reason: WorldSaveRefusal; document: WorldDocument | null }

const isRefusal = (value: unknown): value is WorldSaveRefusal =>
  WORLD_SAVE_REFUSALS.some((known) => known === value)

// A reply from across a process or network boundary, checked like any stored document. A reply
// that is not one reads as a failed write that names no city.
export function parseWorldSaveReply(reply: unknown): WorldSaveReply {
  const parsed = isJsonObject(reply) ? parseWorldDocument(reply.document) : null
  const document = parsed?.success ? parsed.document : null
  if (isJsonObject(reply) && reply.success === true && document) return { success: true, document }
  const reason = isJsonObject(reply) && isRefusal(reply.reason) ? reply.reason : 'storage-write'
  return { success: false, reason, document }
}
