# ClaudeWatch Windows support batch — ledger (opened 2026-10-13)

Repo: `theangeloumali/ClaudeWatch`. Branch `fix/windows-support`, plan of record `docs/plans/claudewatch-windows-support-2026-10-13.md`. Source of every item: Angelo's messages in the session, 2026-10-13, after installing 1.3.0 on Windows 11.

Framing in his words: "I want you to dispatch a team of agents to file and handle this and make sure that this is fully compatible with Windows and Mac Make sure you dispatch a team of agents when building this so we can rapidly scale this up"

## Intake (verbatim, never re-derived)

| Ticket | Status                           | Source link                                            | Conversation                                                                                                                                                                                         |
| ------ | -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #4     | in progress — S1 @lena, win/s1   | https://github.com/theangeloumali/ClaudeWatch/issues/4 | "Why doesn't the application have an app? It doesn't show the icon on the tray"                                                                                                                      |
| #5     | in progress — S2 @ravi, win/s2   | https://github.com/theangeloumali/ClaudeWatch/issues/5 | "Also what I noticed is the sessions are not being shown on the ClaudeWatch so that's a significant issue. We need to make sure we validate and verify that this is fucking working here on Windows" |
| #6     | in progress — S3 @ravi, win/s3   | https://github.com/theangeloumali/ClaudeWatch/issues/6 | "Also what I noticed is the sessions are not being shown on the ClaudeWatch so that's a significant issue. We need to make sure we validate and verify that this is fucking working here on Windows" |
| #7     | in progress — S4 @ravi, win/s4   | https://github.com/theangeloumali/ClaudeWatch/issues/7 | "make sure that this is fully compatible with Windows and Mac"                                                                                                                                       |
| #8     | in progress — S5 @jordan, win/s5 | https://github.com/theangeloumali/ClaudeWatch/issues/8 | "make sure that this is fully compatible with Windows and Mac"                                                                                                                                       |
| #9     | tracking — closed by the PR      | https://github.com/theangeloumali/ClaudeWatch/issues/9 | "I want you to dispatch a team of agents to file and handle this and make sure that this is fully compatible with Windows and Mac"                                                                   |

## Confirmed answers (grill round, 2026-10-13)

- Scope: full Windows support, all five gaps, including session detection.
- Delivery: feature branch, push, open a PR against `main` (push/PR authorized for this branch).
- Window buttons: native Windows caption buttons over the header; no mock-up.
- Workspace: worktree at `.claude/.worktree/windows-support`, slice worktrees `win-s1…s5` from C0 `78a0cdb`.
- Acceptance headline: this live Claude Code session appears in the installed app on this machine.

## Baseline (main @ 4bec0a7 on Windows)

117 failing of 3708 tests across 25 files, all Windows-compatibility failures, each assigned to the owning slice in the plan.

## Known blockers

- macOS runtime smoke: no Mac here. Owner: Angelo.
- Slack ticket marking: Slack connector not authenticated. Owner: Angelo.

## Phase 2 integration checklist (cross-slice lines, primary applies after merging all slices)

- [x] `src/main/office-setup.ts` `createOfficeWindow`: spread `windowChrome()`; keep the Office's own `backgroundColor: '#0E0E10'`
- [x] `src/main/process-monitor.ts` `getPlatformDetector`: `Win32Detector({ runScript: runPowerShell })`
- [x] `src/bridge/io.ts` exec: env for `ORCA_CLI` = `orcaCliEnv()` (the Orca CLI needs APPDATA on win32)
- [x] `src/main/accounts/index.ts` Orca CLI spawn: env = `orcaCliEnv()`
- [x] `createOfficeService({ …, runScript: runPowerShell })` at `src/main/office-setup.ts:91` and `src/office-web/cli.ts:32`
- [x] `new TerminalResolver(process.platform, runPowerShell)` at `src/main/index.ts:120` and `src/office-web/cli.ts:37`
- [x] `src/bridge/poller.ts:61` `new OrcaSource(this.io, platform, runPowerShell)`; with the host the bridge's Orca tree no longer needs a cold POWERSHELL timeout (else widen `Exec` at `orca.ts:43` with `{ timeoutMs: 20_000 }`)
- [x] S3 merge lines: `readProcessTable(io, platform)` at `codex.ts:222` and `opencode.ts:194`; `rememberedFolder(io, folders, process, platform)` at `codex.ts:322` and `opencode.ts:174`; `readProcessTable(this.io, this.platform)` at `poller.ts:92`; `new OrcaSource(this.io, this.platform, runPowerShell)` at `poller.ts:65`
- [x] More S3 merge lines: `resolveProject(cwd, io, now, platform)` at `codex.ts:260` and `opencode.ts:231`; poller passes `this.platform` to `collectClaude` (S2 added the parameter), which clears the 8 poller Claude cases; switch `codex-rollouts.ts` back to plain `node:path` join; optionally replace `process-folders.ts` `processIdentity` with S2's exported `identityOf`
- [x] More S3 merge edits: `new TeammateSource(this.io, this.platform)` at `poller.ts:66`; `collectClaude(this.roots, this.io, now, this.teammates, readProcesses, this.platform)` at `poller.ts:94`
- [x] REQUIRED with S2: drop the "one transaction with no fsync" wrapper in `opencode.test.ts` setup() and its `OPENCODE_SCHEMA` import, back to `buildOpencodeDb(fill)`; S2's builder opens its own transaction, so the wrapper's PRAGMA throws
- [x] Cleanup: delete `processIdentity` from `process-folders.ts`; use S2's exported `identityOf` in `codex.ts` (claimedFolder) and `opencode.ts` (claimedFolder, locate)
- [x] Confirm S3's expected-green list after S2 merges (S3's overlay: its 13 targets 202/202): codex 17/19, codex-rollouts 6, codex-windows 5, codex-totals 1, poller 9; then project-root ×3 and opencode-db ×1
- [ ] Live: no console window flashes during polling, focus or sound
