import { afterEach, expect, it } from 'vitest'
import { rmSync } from 'node:fs'
import { systemIo } from './io'
import { BridgePoller } from './poller'
import { fixtureIo } from './__fixtures__/helpers'
import { buildOpencodeDb, insertSession } from './__fixtures__/opencode-db'

const START = 'Sat Oct 10 15:29:12 2026'
const NOW = Date.parse(`${START} UTC`) + 60_000
const TOKENS = { input: 10, output: 20, reasoning: 5, cacheRead: 300, cacheWrite: 40 }

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// One OpenCode process in /repo, with whatever environment `ps -E` is made to print for it.
function pollerFor(environment = ''): BridgePoller {
  const { root } = buildOpencodeDb((db) =>
    insertSession(db, { id: 'ses_root', directory: '/repo', updatedAtMs: NOW, tokens: TOKENS })
  )
  roots.push(root)
  const io = fixtureIo({ '/repo/.git': null })
  io.readOpencode = systemIo.readOpencode
  io.exec = async (file, args) => {
    if (file.endsWith('lsof')) return 'p42\nn/repo\n'
    if (args[0] === '-xo') return `42 ${START} opencode`
    if (args[0] === '-E') return `opencode ${environment}`
    return args[1] === 'command=' ? 'opencode' : ''
  }
  return new BridgePoller({
    io,
    claudeRoots: [],
    codexRoot: '/codex',
    opencodeRoot: root,
    // The process table and folder above are what `ps` and `lsof` print on macOS.
    platform: 'darwin',
    now: () => NOW
  })
}

it('carries an OpenCode session and its source health in the snapshot', async () => {
  const snapshot = await pollerFor().tick()
  expect(snapshot.sessions).toHaveLength(1)
  expect(snapshot.sessions[0]).toMatchObject({
    key: 'opencode:ses_root',
    provider: 'opencode',
    host: 'terminal',
    orcaPaneKey: null,
    // Its own running total, not a transcript count.
    usage: { own: { input: 10, output: 25, cacheWrite: 40, cacheRead: 300 } }
  })
  expect(snapshot.sources).toContainEqual({ id: 'opencode', ok: true, detail: 'live' })
})

it('gives an OpenCode process in an Orca pane its pane key, as a Claude session gets one', async () => {
  const snapshot = await pollerFor('ORCA_PANE_KEY=tab-1:leaf-2').tick()
  expect(snapshot.sessions[0]).toMatchObject({
    key: 'opencode:ses_root',
    host: 'orca',
    orcaPaneKey: 'tab-1:leaf-2',
    usage: { own: { input: 10 } }
  })
})
