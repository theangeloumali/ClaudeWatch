# ClaudeWatch Windows support batch — ledger (opened 2026-10-13)

Repo: `theangeloumali/ClaudeWatch`. Branch `fix/windows-support`, plan of record `docs/plans/claudewatch-windows-support-2026-10-13.md`. Source of every item: Angelo's messages in the session, 2026-10-13, after installing 1.3.0 on Windows 11.

Framing in his words: "I want you to dispatch a team of agents to file and handle this and make sure that this is fully compatible with Windows and Mac Make sure you dispatch a team of agents when building this so we can rapidly scale this up"

## Intake (verbatim, never re-derived)

| Ticket | Status                      | Source link                                            | Conversation                                                                                                                                                                                         |
| ------ | --------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #4     | done — PR #10               | https://github.com/theangeloumali/ClaudeWatch/issues/4 | "Why doesn't the application have an app? It doesn't show the icon on the tray"                                                                                                                      |
| #5     | done — PR #10               | https://github.com/theangeloumali/ClaudeWatch/issues/5 | "Also what I noticed is the sessions are not being shown on the ClaudeWatch so that's a significant issue. We need to make sure we validate and verify that this is fucking working here on Windows" |
| #6     | done — PR #10               | https://github.com/theangeloumali/ClaudeWatch/issues/6 | "Also what I noticed is the sessions are not being shown on the ClaudeWatch so that's a significant issue. We need to make sure we validate and verify that this is fucking working here on Windows" |
| #7     | done — PR #10               | https://github.com/theangeloumali/ClaudeWatch/issues/7 | "make sure that this is fully compatible with Windows and Mac"                                                                                                                                       |
| #8     | done — PR #10               | https://github.com/theangeloumali/ClaudeWatch/issues/8 | "make sure that this is fully compatible with Windows and Mac"                                                                                                                                       |
| #9     | tracking — closed by the PR | https://github.com/theangeloumali/ClaudeWatch/issues/9 | "I want you to dispatch a team of agents to file and handle this and make sure that this is fully compatible with Windows and Mac"                                                                   |

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
- [x] Live: no console window flashes during polling, focus or sound (0 visible PowerShell windows over 30 s)

## Wave 2 fix-wave integration (after S2/S4 fixes merge)

- [x] `cwd: POWERSHELL_CWD` on `src/shared/orca-bundle.ts`'s Authenticode execFile and on `src/main/windows-terminals.ts`'s PowerShell spawns (both through `POWERSHELL_SPAWN`)
- [x] DRY: `windows-console.ts` `checkedInteger` → S2's exported `checkedPid`
- [x] Kai re-review of the fix commits (veto lifted)

## Security notes for the PR body

- PowerShell child env pins `PSModulePath` and runs with a System32 cwd (Kai CRITICAL, fixed)
- Residual risk, accepted: the Windows Orca trust check verifies the signed `orca.exe`/`Orca.exe` (signer, company, original filename, product name) but not the unsigned CLI script it runs from `app.asar.unpacked`, which the user's own account can write. macOS's `codesign --deep --strict` seals bundle resources; Windows Authenticode does not
- Windows limitation, accepted: two terminals of the same kind (two interactive Codex terminals, or any two OpenCode terminals), one never prompted, stay unplaced until one of them is prompted or exits; an idle Codex/OpenCode terminal appears only after its first conversation (Windows cannot report another process's folder without reading its memory, which this port does not do)
- Windows Start agent runs claude/codex only from an absolute PATH entry (never the project folder), and only when the path has none of cmd.exe's syntax characters and is not UNC; an agent under e.g. "Program Files (x86)" is refused with "Couldn't find claude or codex on your PATH." by design

## /simplify pass (2026-10-13)

Applied: one Windows folder fold (folderKey on windowsFolderKey; drive roots stay roots), one POWERSHELL_SPAWN for cwd + windowsHide, LOCAL_APP_DATA, WINDOWS_CMD on POWERSHELL_CWD, powershellScriptOf for script extraction, the terminal map checked against WINDOW_HOSTS; efficiency (detector CIM caching, recent-day rollout walks, OpenCode DB reuse, dead-record cache, per-script host cache, disposed process objects, one tree read per tick); dead code (unused brand, isLive, ORCA_APP), typed ForbiddenError and host errors, redundant branches and wrong comments.

Skipped, with reason:

- Options objects for the long collector signatures: broad signature churn across every source and test.
- `platform` and `runScript` on BridgeIo: re-architects the injected IO; powershellScriptOf already removed the fragile unwrap by position.
- One `placeProcesses` for Codex and OpenCode: refactors two tested placement paths whose drift is not a defect; the redundant ternary it pointed at is removed.
- Narrowing the hard-link guard to known credential stores: loosens a security rule and needs Kai's sign-off.
- Moving folderKey to shared: a layering preference, not duplication.
- Consolidating test-only FILETIME helpers and `row()`: different input shapes; merging adds wrappers.
- Typed PowerShell host errors: the exit-code contract between the host and liveness is small and tested on both sides; re-typing it adds churn without a defect.

## Close (2026-10-13)

- Gates on the final tree: prettier, eslint, typecheck, 4100 tests passed / 0 failed / 5 skipped, build, knip, dead-code check clean
- Reviews: Maya APPROVE_WITH_FINDINGS (fixed), Kai veto lifted, Codex `approve` on the final tree
- Installed final build, live: tray icon with its count, popover inside the work area, this session Working in the dashboard, Jump raised Orca, Office with 3 agents across 3 projects, idle CPU 0.83% of one core
- Still blocked: macOS runtime smoke (Angelo, on his Mac; command in the PR) and Slack ticket marking (Slack not connected)
