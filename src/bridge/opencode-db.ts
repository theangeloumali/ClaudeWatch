import type { DatabaseSync } from 'node:sqlite'

// Everything the bridge may ask OpenCode's database. Each statement names its columns, its bound
// and its index: with the index gone it fails instead of scanning a table of a million rows.
// `data` is read inside SQLite, field by field, so no message or tool text reaches this process.
export const OPENCODE_STATEMENTS = {
  rootSessions: `
    SELECT id, title, time_created, time_updated, tokens_input, tokens_output, tokens_reasoning,
           tokens_cache_read, tokens_cache_write
    FROM session INDEXED BY session_parent_idx
    WHERE parent_id IS NULL AND directory = ? AND time_archived IS NULL
    ORDER BY time_updated DESC LIMIT 4`,
  // Windows names no process's folder: the sessions a process can have written point to it.
  recentRootSessions: `
    SELECT id, directory, time_created, time_updated
    FROM session INDEXED BY session_parent_idx
    WHERE parent_id IS NULL AND time_updated >= ? AND time_archived IS NULL
    ORDER BY time_updated DESC LIMIT 16`,
  // Newest first by row order, which the index already holds: no sort over a parent's children.
  childSessions: `
    SELECT id, agent, time_updated, tokens_input, tokens_output, tokens_reasoning,
           tokens_cache_read, tokens_cache_write
    FROM session INDEXED BY session_parent_idx
    WHERE parent_id = ?
    ORDER BY rowid DESC LIMIT 32`,
  newestMessage: `
    SELECT id, time_created,
           json_extract(data, '$.role') AS role,
           json_extract(data, '$.finish') AS finish,
           json_extract(data, '$.time.completed') AS completed,
           json_extract(data, '$.error.name') AS error
    FROM message INDEXED BY message_session_time_created_id_idx
    WHERE session_id = ?
    ORDER BY time_created DESC, id DESC LIMIT 1`,
  messageParts: `
    SELECT json_extract(data, '$.type') AS type,
           json_extract(data, '$.tool') AS tool,
           json_extract(data, '$.state.status') AS status
    FROM part INDEXED BY part_message_id_id_idx
    WHERE message_id = ? AND session_id = ?
    ORDER BY id DESC LIMIT 16`,
  // OpenCode 2 keeps the same session columns in a table of its own.
  rootSessionsV2: `
    SELECT id, title, time_created, time_updated, tokens_input, tokens_output, tokens_reasoning,
           tokens_cache_read, tokens_cache_write
    FROM session_v2 INDEXED BY session_v2_parent_idx
    WHERE parent_id IS NULL AND directory = ? AND time_archived IS NULL
    ORDER BY time_updated DESC LIMIT 4`,
  recentRootSessionsV2: `
    SELECT id, directory, time_created, time_updated
    FROM session_v2 INDEXED BY session_v2_parent_idx
    WHERE parent_id IS NULL AND time_updated >= ? AND time_archived IS NULL
    ORDER BY time_updated DESC LIMIT 16`,
  childSessionsV2: `
    SELECT id, agent, time_updated, tokens_input, tokens_output, tokens_reasoning,
           tokens_cache_read, tokens_cache_write
    FROM session_v2 INDEXED BY session_v2_parent_idx
    WHERE parent_id = ?
    ORDER BY rowid DESC LIMIT 32`,
  // A message's role is its type there; the rows between turns (system, idle, compaction) are not.
  newestMessageV2: `
    SELECT id, time_created, type AS role,
           json_extract(data, '$.finish') AS finish,
           json_extract(data, '$.time.completed') AS completed,
           json_extract(data, '$.error.type') AS error
    FROM session_message INDEXED BY session_message_session_time_created_id_idx
    WHERE session_id = ? AND type IN ('user', 'assistant')
    ORDER BY time_created DESC, id DESC LIMIT 1`,
  // A message holds its own parts, oldest first.
  messagePartsV2: `
    SELECT json_extract(part.value, '$.type') AS type,
           json_extract(part.value, '$.name') AS tool,
           json_extract(part.value, '$.state.status') AS status
    FROM session_message INDEXED BY sqlite_autoindex_session_message_1,
         json_each(session_message.data, '$.content') AS part
    WHERE session_message.id = ? AND session_message.session_id = ?
    ORDER BY part.key DESC LIMIT 16`
} as const

export type OpencodeStatement = keyof typeof OPENCODE_STATEMENTS
export type OpencodeRow = Record<string, unknown>
export type OpencodeQuery = (
  statement: OpencodeStatement,
  ...values: (string | number)[]
) => OpencodeRow[]

const OPENCODE_2_OF = new Map<OpencodeStatement, OpencodeStatement>([
  ['rootSessions', 'rootSessionsV2'],
  ['recentRootSessions', 'recentRootSessionsV2'],
  ['childSessions', 'childSessionsV2'],
  ['newestMessage', 'newestMessageV2'],
  ['messageParts', 'messagePartsV2']
])
// OpenCode 2 writes tables of its own and leaves the 1.x ones as they were before it.
const OPENCODE_2_TABLE = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'"

// Why a read failed, in a word; the cause itself may name local paths and is not kept.
export type OpencodeFailure = 'missing' | 'busy' | 'changed' | 'unreadable' | 'malformed'
export class OpencodeDbError extends Error {
  override readonly name = 'OpencodeDbError'
  constructor(readonly reason: OpencodeFailure) {
    super(`OpenCode database: ${reason}`)
  }
}

// SQLite's primary result codes, as node:sqlite reports them in `errcode`.
const SQLITE_ERROR = 1
const SQLITE_BUSY = 5
const SQLITE_LOCKED = 6
const SQLITE_CANTOPEN = 14
// A writer mid-commit clears in milliseconds; the wait blocks the bridge, so it is short.
const BUSY_WAIT_MS = 100

// `logicError` is what SQLite's plain "error" means where it was raised: a statement that will
// not compile names a table, column or index that is gone; one that will not run met bad JSON.
function failureOf(error: unknown, logicError: OpencodeFailure): OpencodeDbError {
  const code =
    error instanceof Error && 'errcode' in error && typeof error.errcode === 'number'
      ? error.errcode & 0xff
      : null
  if (code === SQLITE_BUSY || code === SQLITE_LOCKED) return new OpencodeDbError('busy')
  if (code === SQLITE_CANTOPEN) return new OpencodeDbError('missing')
  return new OpencodeDbError(code === SQLITE_ERROR ? logicError : 'unreadable')
}

// One read-only connection for the whole of `read`, closed when it returns. A read-only
// connection cannot write the database or merge its log, even as the last one to close.
export function readOpencodeDb<Result>(
  path: string,
  read: (query: OpencodeQuery) => Result
): Result {
  let db: DatabaseSync
  try {
    // Loaded on first use: a bridge that never meets OpenCode never loads SQLite.
    const sqlite = process.getBuiltinModule('node:sqlite')
    db = new sqlite.DatabaseSync(path, { readOnly: true, timeout: BUSY_WAIT_MS })
  } catch (error) {
    throw failureOf(error, 'unreadable')
  }
  try {
    let isOpencode2
    try {
      isOpencode2 = db.prepare(OPENCODE_2_TABLE).get() !== undefined
    } catch (error) {
      throw failureOf(error, 'unreadable')
    }
    // The same questions, asked of the tables the database's own OpenCode writes.
    return read((statement, ...values) => {
      const asked = isOpencode2 ? (OPENCODE_2_OF.get(statement) ?? statement) : statement
      let prepared
      try {
        prepared = db.prepare(OPENCODE_STATEMENTS[asked])
      } catch (error) {
        throw failureOf(error, 'changed')
      }
      try {
        return prepared.all(...values)
      } catch (error) {
        throw failureOf(error, 'malformed')
      }
    })
  } finally {
    db.close()
  }
}
