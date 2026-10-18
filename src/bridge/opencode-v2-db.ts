import type { OpencodeQuery, OpencodeRow } from './opencode-db'
import { OPEN_TOOL_HOLD_MS } from './liveness'

// dry-new: V2 stores typed messages and nested tools, not legacy message/part rows.
const SESSION_COLUMNS = `id, parent_id, directory, title, agent, time_created, time_updated,
  time_idle, idle_outcome, tokens_input, tokens_output, tokens_reasoning,
  tokens_cache_read, tokens_cache_write`
export const MAX_V2_LIVE_ROOTS = 16
const MAX_RECENT_ROOTS = 64
const MAX_MODEL_LABEL_LENGTH = 128
const MAX_MODEL_LABEL_BYTES = MAX_MODEL_LABEL_LENGTH * 4
const MODEL_FIELDS = { provider_id: 'providerID', id: 'id', variant: 'variant' } as const

// Guard extraction with json_valid so malformed model JSON cannot cost a live session.
// Match isLabel's length cap; the byte cap also bounds strings containing embedded NULs.
function modelColumns(modelColumn: string): string {
  return Object.entries(MODEL_FIELDS)
    .map(([columnSuffix, jsonField]) => {
      const fieldExpression = `json_extract(${modelColumn}, '$.${jsonField}')`
      return `CASE WHEN json_valid(${modelColumn}) THEN
        CASE WHEN json_type(${modelColumn}, '$.${jsonField}') = 'text'
          AND length(${fieldExpression}) BETWEEN 1 AND ${MAX_MODEL_LABEL_LENGTH}
          AND length(CAST(${fieldExpression} AS BLOB)) <= ${MAX_MODEL_LABEL_BYTES}
        THEN ${fieldExpression} END
      END AS model_${columnSuffix}`
    })
    .join(', ')
}

function sessionStatements(modelColumn: 'model' | 'NULL') {
  const modelProjection = modelColumns(modelColumn)
  const joinedModelProjection = modelColumns(modelColumn === 'model' ? 'session.model' : 'NULL')
  const boundedModelProjection = modelColumns('model')
  return {
    v2RecentSessions: `
    WITH recent AS (
      SELECT session_id, time_created
      FROM session_message INDEXED BY session_message_time_created_idx
      WHERE time_created >= ? ORDER BY time_created DESC LIMIT 256
    ), candidates AS (
      SELECT session_id, MAX(time_created) AS last_message FROM recent
      GROUP BY session_id ORDER BY last_message DESC LIMIT ${MAX_RECENT_ROOTS}
    )
    SELECT ${SESSION_COLUMNS.split(',')
      .map((column) => `session.${column.trim()}`)
      .join(', ')}, ${joinedModelProjection}
    FROM candidates JOIN session_v2 AS session ON session.id = candidates.session_id
    WHERE session.time_archived IS NULL
    ORDER BY candidates.last_message DESC`,
    v2Session: `SELECT ${SESSION_COLUMNS}, ${modelProjection} FROM session_v2
    WHERE id = ? AND time_archived IS NULL LIMIT 1`,
    v2RecentRoots: `SELECT ${SESSION_COLUMNS}, ${boundedModelProjection} FROM (
    SELECT ${SESSION_COLUMNS}, time_archived, ${modelColumn} AS model
    FROM session_v2 INDEXED BY session_v2_parent_idx
    WHERE parent_id IS NULL ORDER BY rowid DESC LIMIT ${MAX_RECENT_ROOTS}
  ) WHERE time_archived IS NULL`,
    v2ChildSessions: `SELECT ${SESSION_COLUMNS}, ${boundedModelProjection} FROM (
    SELECT ${SESSION_COLUMNS}, time_archived, ${modelColumn} AS model
    FROM session_v2 INDEXED BY session_v2_parent_idx
    WHERE parent_id = ? ORDER BY rowid DESC LIMIT 32
  ) WHERE time_archived IS NULL`
  }
}

const sessionsWithModel = sessionStatements('model')
const sessionsWithoutModel = sessionStatements('NULL')

export const OPENCODE_V2_STATEMENTS = {
  schemaVersion: `SELECT name, EXISTS (
      SELECT 1 FROM pragma_table_info('session_v2') WHERE name = 'model'
    ) AS has_model FROM sqlite_schema
    WHERE type = 'table' AND name = 'session_v2' LIMIT 1`,
  ...sessionsWithModel,
  v2RecentSessionsWithoutModel: sessionsWithoutModel.v2RecentSessions,
  v2SessionWithoutModel: sessionsWithoutModel.v2Session,
  v2RecentRootsWithoutModel: sessionsWithoutModel.v2RecentRoots,
  v2ChildSessionsWithoutModel: sessionsWithoutModel.v2ChildSessions,
  v2NewestMessage: `
    SELECT id, type AS role, time_created, time_updated,
           json_extract(data, '$.finish') AS finish,
           json_extract(data, '$.time.completed') AS completed,
           json_extract(data, '$.error.name') AS error,
           json_extract(data, '$.outcome') AS outcome
    FROM session_message INDEXED BY session_message_session_seq_idx
    WHERE session_id = ? ORDER BY seq DESC LIMIT 1`,
  v2MessageParts: `
    WITH newest AS (
      SELECT data FROM session_message INDEXED BY session_message_session_seq_idx
      WHERE session_id = ? ORDER BY seq DESC LIMIT 1
    )
    SELECT json_extract(part.value, '$.type') AS type,
           COALESCE(json_extract(part.value, '$.tool'), json_extract(part.value, '$.name')) AS tool,
           COALESCE(json_extract(part.value, '$.state.status'), json_extract(part.value, '$.status')) AS status
    FROM newest, json_each(newest.data, '$.content') AS part
    WHERE part.type = 'object' AND json_extract(part.value, '$.type') = 'tool'
      AND COALESCE(json_extract(part.value, '$.state.status'), json_extract(part.value, '$.status'))
          IN ('running', 'pending')
    LIMIT 16`
} as const

// Older V2 schemas use the same indexed queries, with NULL instead of a missing column.
export function withoutV2Models(query: OpencodeQuery): OpencodeQuery {
  return (statement, ...bindings) => {
    switch (statement) {
      case 'v2RecentSessions':
        return query('v2RecentSessionsWithoutModel', ...bindings)
      case 'v2Session':
        return query('v2SessionWithoutModel', ...bindings)
      case 'v2RecentRoots':
        return query('v2RecentRootsWithoutModel', ...bindings)
      case 'v2ChildSessions':
        return query('v2ChildSessionsWithoutModel', ...bindings)
      default:
        return query(statement, ...bindings)
    }
  }
}

const SESSION_ID = /^[\w-]{1,128}$/
const MAX_ANCESTORS = 8
const MAX_ROOT_CHECKS = MAX_V2_LIVE_ROOTS + MAX_RECENT_ROOTS * 2
const MAX_LOOKUPS = 128

export function discoverV2Roots(
  query: OpencodeQuery,
  options: { now: number; retainedRootIds: readonly string[] }
): OpencodeRow[] {
  // Streaming updates have no global index; retain known roots and probe a bounded parent index.
  const candidates = [
    ...options.retainedRootIds
      .slice(0, MAX_V2_LIVE_ROOTS)
      .flatMap((id) => (SESSION_ID.test(id) ? query('v2Session', id) : [])),
    ...query('v2RecentSessions', options.now - OPEN_TOOL_HOLD_MS),
    ...query('v2RecentRoots')
  ]
  const roots = new Map<string, OpencodeRow>()
  const records = new Map<string, OpencodeRow>()
  for (const candidate of candidates) {
    if (typeof candidate.id === 'string') records.set(candidate.id, candidate)
  }
  let lookups = 0
  for (const candidate of candidates) {
    let ancestor: OpencodeRow | undefined = candidate
    const visited = new Set<string>()
    for (let depth = 0; ancestor && depth < MAX_ANCESTORS; depth++) {
      if (typeof ancestor.id !== 'string' || !SESSION_ID.test(ancestor.id)) break
      if (visited.has(ancestor.id)) break
      visited.add(ancestor.id)
      if (ancestor.parent_id === null) {
        roots.set(ancestor.id, ancestor)
        break
      }
      const parentId: unknown = ancestor.parent_id
      if (typeof parentId !== 'string' || !SESSION_ID.test(parentId)) break
      ancestor = records.get(parentId)
      if (!ancestor) {
        if (lookups >= MAX_LOOKUPS) break
        lookups++
        ancestor = query('v2Session', parentId)[0]
        if (ancestor) records.set(parentId, ancestor)
      }
    }
    if (roots.size >= MAX_ROOT_CHECKS) break
  }
  return [...roots.values()]
}
