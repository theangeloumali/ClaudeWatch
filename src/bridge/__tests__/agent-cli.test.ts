import { describe, expect, it } from 'vitest'
import { isAgentCli } from '../agent-cli'

// Where each installer puts its program, and where the desktop apps run theirs from.
describe('a standalone Windows CLI is an agent, and a desktop app’s bundled helper is not', () => {
  it.each([
    [
      'Codex’s install.ps1 bin',
      'C:\\Users\\a\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe',
      true
    ],
    ['Claude Code’s install.ps1 bin', 'C:\\Users\\a\\.local\\bin\\claude.exe', true],
    ['a machine-wide winget link', 'C:\\Program Files\\WinGet\\Links\\claude.exe', true],
    [
      'an npm global Codex',
      'C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe',
      true
    ],
    [
      'the ChatGPT Store app’s Codex',
      'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT-Desktop_1.2026.286.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe',
      false
    ],
    [
      'the ChatGPT app’s runtime copy of Codex',
      'C:\\Users\\a\\AppData\\Local\\OpenAI\\Codex\\bin\\2e5e00daee91c61d\\codex.exe',
      false
    ],
    [
      'the Claude desktop app',
      'C:\\Users\\a\\AppData\\Local\\AnthropicClaude\\app-1.0.0\\claude.exe',
      false
    ]
  ])('%s', (_where, program, isAgent) => {
    expect(isAgentCli(program, 'win32')).toBe(isAgent)
  })
})
