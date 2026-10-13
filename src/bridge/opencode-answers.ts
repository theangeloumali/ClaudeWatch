import type { BridgeIo } from './io'
import type { OpencodeQuery, OpencodeRow } from './opencode-db'

// What the database answered last time, while it, its log and the agents asking stay the same.
export interface Answers {
  stamp: string
  rows: Map<string, OpencodeRow[]>
}
const NOT_ANSWERED = Symbol('not answered')
const questionOf = (statement: string, values: (string | number)[]): string =>
  JSON.stringify([statement, ...values])

async function stampOf(io: BridgeIo, path: string, agents: string): Promise<string | null> {
  const stamp = async (file: string): Promise<string> => {
    const { mtimeMs, size } = await io.stat(file)
    return `${mtimeMs}:${size}`
  }
  try {
    const wal = await stamp(`${path}-wal`).catch(() => 'none')
    return `${await stamp(path)}|${wal}|${agents}`
  } catch {
    // Unreadable or gone: the read itself says why.
    return null
  }
}

// Reads through `read` from the database, or, when nothing it depends on has changed, from last
// time's answers: `read` still runs, so whatever depends on the clock is worked out afresh.
export async function readOrRecall<Result>(
  io: BridgeIo,
  path: string,
  agents: string,
  last: Answers | null,
  read: (query: OpencodeQuery) => Result
): Promise<{ result: Result; answers: Answers | null }> {
  const stamp = await stampOf(io, path, agents)
  if (stamp !== null && last?.stamp === stamp) {
    try {
      const recall: OpencodeQuery = (statement, ...values) => {
        const rows = last.rows.get(questionOf(statement, values))
        if (!rows) throw NOT_ANSWERED
        return rows
      }
      return { result: read(recall), answers: last }
    } catch (error) {
      // The clock led to a question not asked last time: the database is asked.
      if (error !== NOT_ANSWERED) throw error
    }
  }
  const rows = new Map<string, OpencodeRow[]>()
  const result = await io.readOpencode(path, (query) =>
    read((statement, ...values) => {
      const answer = query(statement, ...values)
      rows.set(questionOf(statement, values), answer)
      return answer
    })
  )
  return { result, answers: stamp === null ? null : { stamp, rows } }
}
