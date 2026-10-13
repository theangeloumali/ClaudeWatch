import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// The tables OpenCode 1.19 keeps its sessions in, with the indexes the bridge reads through.
// The account and credential tables hold a marker no feed may ever carry.
export const OPENCODE_SCHEMA = `
  CREATE TABLE session (
    id text PRIMARY KEY, project_id text NOT NULL, parent_id text, slug text NOT NULL,
    directory text NOT NULL, title text NOT NULL, version text NOT NULL,
    time_created integer NOT NULL, time_updated integer NOT NULL, time_archived integer,
    agent text, tokens_input integer DEFAULT 0 NOT NULL, tokens_output integer DEFAULT 0 NOT NULL,
    tokens_reasoning integer DEFAULT 0 NOT NULL, tokens_cache_read integer DEFAULT 0 NOT NULL,
    tokens_cache_write integer DEFAULT 0 NOT NULL
  );
  CREATE INDEX session_parent_idx ON session (parent_id);
  CREATE TABLE message (
    id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL,
    time_updated integer NOT NULL, data text NOT NULL
  );
  CREATE INDEX message_session_time_created_id_idx ON message (session_id, time_created, id);
  CREATE TABLE part (
    id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL,
    time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL
  );
  CREATE INDEX part_message_id_id_idx ON part (message_id, id);
  CREATE INDEX part_session_idx ON part (session_id);
  CREATE TABLE credential (id text PRIMARY KEY, value text NOT NULL);
  CREATE TABLE account (id text PRIMARY KEY, email text NOT NULL);
  CREATE TABLE account_state (id text PRIMARY KEY, value text NOT NULL);
  CREATE TABLE control_account (id text PRIMARY KEY, value text NOT NULL);
  INSERT INTO credential VALUES ('c', 'DO_NOT_READ');
  INSERT INTO account VALUES ('a', 'DO_NOT_READ');
  INSERT INTO account_state VALUES ('s', 'DO_NOT_READ');
  INSERT INTO control_account VALUES ('k', 'DO_NOT_READ');
`

interface FixtureTokens {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

interface FixtureSessionRow {
  id: string
  directory: string
  title?: string
  parentId?: string | null
  agent?: string | null
  updatedAtMs: number
  archivedAtMs?: number | null
  tokens?: FixtureTokens
}

export function insertSession(db: DatabaseSync, row: FixtureSessionRow): void {
  const tokens = row.tokens ?? { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
  db.prepare(
    `INSERT INTO session (id, project_id, parent_id, slug, directory, title, version, time_created,
       time_updated, time_archived, agent, tokens_input, tokens_output, tokens_reasoning,
       tokens_cache_read, tokens_cache_write)
     VALUES (?, 'p', ?, 'slug', ?, ?, '1.19.0', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.parentId ?? null,
    row.directory,
    row.title ?? 'untitled',
    row.updatedAtMs - 1000,
    row.updatedAtMs,
    row.archivedAtMs ?? null,
    row.agent ?? null,
    tokens.input,
    tokens.output,
    tokens.reasoning,
    tokens.cacheRead,
    tokens.cacheWrite
  )
}

interface FixtureRecord {
  id: string
  sessionId: string
  atMs: number
  // Stored as given when it is text, so a test can store text that is not JSON.
  data: unknown
}
const stored = (data: unknown): string => (typeof data === 'string' ? data : JSON.stringify(data))

export function insertMessage(db: DatabaseSync, row: FixtureRecord): void {
  db.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)').run(
    row.id,
    row.sessionId,
    row.atMs,
    row.atMs,
    stored(row.data)
  )
}

export function insertPart(db: DatabaseSync, row: FixtureRecord & { messageId: string }): void {
  db.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)').run(
    row.id,
    row.messageId,
    row.sessionId,
    row.atMs,
    row.atMs,
    stored(row.data)
  )
}

// A database named as OpenCode names it, in a temp folder of its own; the caller removes the folder.
export function buildOpencodeDb(
  fill: (db: DatabaseSync) => void,
  schema = OPENCODE_SCHEMA
): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), 'bridge-opencode-'))
  const path = join(root, 'opencode.db')
  const db = new DatabaseSync(path)
  try {
    // One transaction with no fsync: per-statement commits took over 5 s on a busy Windows disk.
    db.exec('PRAGMA journal_mode = MEMORY; PRAGMA synchronous = OFF; BEGIN;')
    db.exec(schema)
    fill(db)
    db.exec('COMMIT')
  } finally {
    db.close()
  }
  return { root, path }
}
