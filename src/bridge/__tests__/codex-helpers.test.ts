import { expect, it, vi } from 'vitest'
import { fixtureIo } from '../__fixtures__/helpers'
import { codexProcesses, collectCodex } from '../codex'
import { opencodeProcesses } from '../opencode-activity'
import { parseProcessTable } from '../process-table'

// health-2: `ps` splits on whitespace, so a helper in "Codex Framework.framework" reads as `codex`.
const START = 'Thu Oct 15 14:23:38 2026'
const CHATGPT_HELPERS = [
  `1575 ${START} /Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/155.0.8059.40/Helpers/browser_crashpad_handler --monitor-self`,
  `1654 ${START} /Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/155.0.8059.40/Helpers/Codex (Service).app/Contents/MacOS/Codex (Service) --type=utility`,
  `8063 ${START} /Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/155.0.8059.40/Helpers/Codex (Renderer).app/Contents/MacOS/Codex (Renderer) --type=renderer`
].join('\n')

it('takes no ChatGPT desktop helper process for a Codex agent', () => {
  expect(codexProcesses(parseProcessTable(CHATGPT_HELPERS), 'darwin')).toEqual([])
})

it('still takes a terminal codex for a Codex agent', () => {
  const [agent] = codexProcesses(parseProcessTable(`4242 ${START} codex --yolo`), 'darwin')
  expect(agent?.pid).toBe(4242)
})

it('takes no opencode an app bundles for an OpenCode agent', () => {
  const rows = parseProcessTable(
    [
      `51 ${START} /Applications/OpenCode.app/Contents/MacOS/opencode`,
      `52 ${START} /Users/dev/.opencode/bin/opencode`
    ].join('\n')
  )
  expect(opencodeProcesses(rows, 'darwin').map(({ pid }) => pid)).toEqual([52])
})

// A space before `.app` leaves no bundle in argv[0] at all: `…/computer-use/Codex`.
it('asks macOS for the program file when ps split a bundle path before its .app', async () => {
  const program =
    '/Users/a/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'
  const io = fixtureIo()
  io.exec = async (file, args) => {
    if (file !== '/bin/ps') return 'p8602\nn/\n'
    if (args[0] === '-xo') return `8602 ${START} ${program}\n4242 ${START} codex --yolo\n`
    return `8602 ${START} ${program}\n 4242 ${START} /opt/homebrew/bin/codex\n`
  }
  const collect = () => collectCodex('/codex', io, undefined, false, Date.now(), 'darwin')
  const asked = vi.spyOn(io, 'exec')
  const { sessions } = await collect()
  await collect()

  expect(sessions.map(({ pid }) => pid)).toEqual([4242])
  // Asked once per process, not once per tick.
  expect(asked.mock.calls.filter(([, args]) => args.includes('pid=,lstart=,comm='))).toHaveLength(1)
})
