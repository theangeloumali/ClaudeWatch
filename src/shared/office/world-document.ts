import { isJsonObject } from '../json-object'
import { buildLayout } from '../../office/sim/layout'
import { allocationLayout } from './world-document-allocation'
import { createWorldDocument, mergeActiveWorldDocument } from './world-document-layout'
import { WORLD_DOCUMENT_LIMITS as LIMITS } from './world-document-limits'
import {
  documentDuplicates,
  isWorldDocument,
  worldDocumentShapeErrors
} from './world-document-schema'
import { validateWorldGeometry } from './world-document-validation'
import type {
  WorldDocument,
  WorldDocumentParseResult,
  WorldValidationContext,
  WorldValidationError
} from './world-document-types'

export type * from './world-document-types'
export { createWorldDocument, worldRoomTarget } from './world-document-layout'
export { compactWorldDocument } from './world-document-packing'
export { WORLD_DOCUMENT_LIMITS, WORLD_STOREY_METRES } from './world-document-limits'
export { validateWorldIdentityBindings } from './world-document-validation'

export function parseWorldDocument(candidate: unknown): WorldDocumentParseResult {
  try {
    const serialized = JSON.stringify(candidate)
    if (!serialized || new TextEncoder().encode(serialized).length > LIMITS.bytes)
      return rejected('limit')
    if (isJsonObject(candidate) && candidate.version !== 2)
      return rejected('unsupported-version', 'version')
    if (!isWorldDocument(candidate))
      return { success: false, errors: worldDocumentShapeErrors(candidate) }
    const errors = documentDuplicates(candidate)
    return errors.length
      ? { success: false, errors }
      : { success: true, document: structuredClone(candidate) }
  } catch {
    return rejected('invalid-shape')
  }
}

export function validateWorldDocument(
  document: WorldDocument,
  context: WorldValidationContext
): WorldValidationError[] {
  const parsed = parseWorldDocument(document)
  if (!parsed.success) return parsed.errors
  const baseline = buildLayout(
    [...context.sessions],
    allocationLayout(document.allocation, context.layout)
  )
  const active = mergeActiveWorldDocument(
    createWorldDocument(baseline, context.sessions),
    parsed.document
  )
  const errors = [
    ...validateWorldGeometry(parsed.document, context),
    ...validateWorldGeometry(active, { ...context, layout: baseline })
  ]
  const unique = new Map(errors.map((error) => [JSON.stringify(error), error]))
  return [...unique.values()].slice(0, LIMITS.errors)
}

function rejected(
  reason: WorldValidationError['reason'],
  field = 'document'
): WorldDocumentParseResult {
  return { success: false, errors: [{ field, target: '', reason }] }
}
