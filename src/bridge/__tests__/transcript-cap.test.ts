import { join } from 'node:path'
import { expect, it } from 'vitest'
import { observeSession } from '../../shared/office/observation'
import { fixtureIo } from '../__fixtures__/helpers'
import { discoverClaudeProcesses } from '../claude-processes'
import { parseProcessTable } from '../process-table'
import { collectClaude } from '../registry'
import { projectSlug } from '../transcript-tail'

// health-3: above 512 transcripts a folder's search never completed, so its lead was never claimed.
const ROOT = '/claude'
const CWD = '/repo'
const NOW = Date.parse('2026-10-15T12:00:00Z')
const LIVE = 'a1b2c3d4-0000-4000-8000-000000000001'
const FOLDER = join(ROOT, 'projects', projectSlug(CWD))
const [LEAD] = parseProcessTable(
  '4242 Thu Oct 15 11:50:00 2026 claude --dangerously-skip-permissions'
)

function folderWith(staleTranscripts: number, options: { hasLive?: boolean } = {}) {
  const files: Record<string, string | null> = { [join(CWD, '.git')]: null }
  const stamps = new Map<string, number>()
  const addStale = (count: number, from = 0): void => {
    for (let index = from; index < from + count; index++) {
      const path = join(FOLDER, `stale-${String(index).padStart(4, '0')}.jsonl`)
      files[path] = '{}\n'
      stamps.set(path, NOW - 86_400_000)
    }
  }
  addStale(staleTranscripts)
  const live = join(FOLDER, `${LIVE}.jsonl`)
  if (options.hasLive !== false) {
    files[live] =
      `${JSON.stringify({ type: 'user', sessionId: LIVE, cwd: CWD, timestamp: new Date(NOW - 5_000).toISOString() })}\n`
    stamps.set(live, NOW - 1_000)
  }
  const io = fixtureIo(files)
  const stat = io.stat
  io.stat = async (path) => ({ ...(await stat(path)), mtimeMs: stamps.get(path) ?? 1000 })
  io.exec = async (program, args) =>
    program.endsWith('lsof') ? `p${args[args.indexOf('-p') + 1]}\nn${CWD}\n` : ''
  const touchLive = (atMs: number): void => void stamps.set(live, atMs)
  return { io, addStale, touchLive }
}

const discover = (io: ReturnType<typeof folderWith>['io'], now: number) =>
  discoverClaudeProcesses({
    roots: [ROOT],
    io,
    rows: [LEAD],
    claimed: { sessionIds: new Set(), processes: new Set() },
    now,
    platform: 'darwin',
    onFailure: () => undefined
  })

async function claimedSessionAfterTicks(staleTranscripts: number, ticks = 3) {
  const { io } = folderWith(staleTranscripts)
  let sessionId: string | undefined
  for (let tick = 0; tick < ticks; tick++)
    sessionId = (await discover(io, NOW + tick * 2_000))[0]?.entry.sessionId
  return sessionId
}

it('claims the live conversation of a native lead whose folder holds few transcripts', async () => {
  expect(await claimedSessionAfterTicks(20)).toBe(LIVE)
})

it('still claims it once the folder holds more than 512 old transcripts', async () => {
  expect(await claimedSessionAfterTicks(600)).toBe(LIVE)
})

// Review Focus 5: a folder crossing 512 names mid-run keeps its claimed, working lead.
it('keeps a claimed lead across the cap', async () => {
  const folder = folderWith(500)
  let found = await discover(folder.io, NOW)
  expect(found[0]?.entry.sessionId).toBe(LIVE)
  folder.addStale(20, 500)
  for (let atMs = NOW + 2_000; atMs <= NOW + 40_000; atMs += 2_000) {
    folder.touchLive(atMs - 500)
    found = await discover(folder.io, atMs)
    expect(found[0]?.entry).toMatchObject({ sessionId: LIVE, status: 'busy' })
  }
})

// seating-6: no transcript means no evidence, so the lead stays seated instead of roaming.
it('an unclaimed lead carries no own idle evidence', async () => {
  const { io } = folderWith(3, { hasLive: false })
  const batch = await collectClaude([ROOT], io, NOW, undefined, async () => [LEAD], 'darwin')
  const [session] = batch.sessions

  expect(session?.pid).toBe(4242)
  expect(
    observeSession({ session, sources: batch.sources, connected: true, nowMs: NOW }).status
  ).toBe('unknown')
})
