import { expect, it } from 'vitest'
import { codexProcesses } from '../codex'
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
