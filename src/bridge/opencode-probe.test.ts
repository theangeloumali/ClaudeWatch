import { expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { systemIo } from './io'

// The owner's own database, when this Mac has one: shapes and counts only. Nothing read here is
// printed, and a failed assertion names a column and a type, never a value.
const REAL_DATABASE = join(homedir(), '.local/share/opencode/opencode.db')

const typesOf = (rows: Record<string, unknown>[]): Record<string, string>[] =>
  rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([column, value]) => [column, typeof value]))
  )

it('reads the installed OpenCode database through the fixed statements, or says it is missing', async () => {
  if (!existsSync(REAL_DATABASE)) {
    // No OpenCode on this machine: the reader reports that, and nothing is read.
    await expect(systemIo.readOpencode(REAL_DATABASE, () => 'read')).rejects.toMatchObject({
      reason: 'missing'
    })
    return
  }
  const sizeBefore = statSync(REAL_DATABASE).size
  const direct = new DatabaseSync(REAL_DATABASE, { readOnly: true })
  let newestRoot: Record<string, unknown> | undefined
  try {
    // OpenCode 2 writes its own table, and the reader asks that one wherever it exists.
    const isOpencode2 = direct
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'")
      .get()
    const table = isOpencode2 ? 'session_v2' : 'session'
    newestRoot = direct
      .prepare(
        `SELECT id, directory FROM ${table} WHERE parent_id IS NULL ORDER BY id DESC LIMIT 1`
      )
      .get()
  } finally {
    direct.close()
  }
  const directory = typeof newestRoot?.directory === 'string' ? newestRoot.directory : '/'
  const sessionId = typeof newestRoot?.id === 'string' ? newestRoot.id : 'none'

  const shapes = await systemIo.readOpencode(REAL_DATABASE, (query) => {
    const message = query('newestMessage', sessionId)
    const messageId = typeof message[0]?.id === 'string' ? message[0].id : 'none'
    return {
      roots: typesOf(query('rootSessions', directory)),
      children: typesOf(query('childSessions', sessionId)),
      message: typesOf(message),
      parts: typesOf(query('messageParts', messageId, sessionId))
    }
  })

  expect(shapes.roots.length).toBeLessThanOrEqual(4)
  expect(shapes.children.length).toBeLessThanOrEqual(32)
  expect(shapes.message.length).toBeLessThanOrEqual(1)
  expect(shapes.parts.length).toBeLessThanOrEqual(16)
  for (const root of shapes.roots) {
    expect(root).toMatchObject({ id: 'string', title: 'string', time_updated: 'number' })
    for (const column of ['input', 'output', 'reasoning', 'cache_read', 'cache_write'])
      expect(root[`tokens_${column}`]).toBe('number')
  }
  for (const child of shapes.children)
    expect(child).toMatchObject({ id: 'string', time_updated: 'number', tokens_input: 'number' })
  for (const message of shapes.message)
    expect(message).toMatchObject({ id: 'string', role: 'string' })
  for (const part of shapes.parts) expect(part.type).toBe('string')
  // Read-only: the database file is the size it was.
  expect(statSync(REAL_DATABASE).size).toBe(sizeBefore)
})
