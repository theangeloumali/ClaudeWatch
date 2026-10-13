# ClaudeWatch Windows Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development via `zkidzdevteam:team-driven-development`. Steps use `- [ ]` tracking.

**Validated:** installed 1.3.0 on Windows 11 (build 26300). Repro output: (1) `HKCU\Control Panel\NotifyIconSettings` → `ClaudeWatch.exe promoted=1 snapshotBytes=0`, while all 36 other tray apps have 125–1280 bytes; (2) a screenshot of the installed dashboard shows no caption buttons and a blank 78px gap; (3) `node out/main/bridge.js --once` → `claude:…\.claude ok detail=empty`, `codex discovery failed`, `opencode … failed`, `orca unavailable`, with this session registered in `~/.claude/sessions/55152.json`; (4) `where wmic` → not found; (5) the installed `resources\` has no `sounds\`.

**Root causes:** `src/main/tray.ts:76` (empty tray image) + `:78`/`:323` (`setTitle` is darwin-only, `electron.d.ts:15776`) · `tray.ts:193` (popover placed below the tray, `y` unclamped) · `src/main/index.ts:47,52` + `office-setup.ts:35` (frameless/`hiddenInset` → no caption buttons on win32) · `src/bridge/registry.ts:40` (`cwd.startsWith('/')` drops every Windows session) · `src/bridge/process-table.ts:31,35` + `liveness.ts:34` (`/bin/ps`, `/usr/sbin/lsof`) · `src/bridge/io.ts:99-101` (path guard `/`-only; program allowlist macOS-only) · `src/main/platform/win32.ts:28,66` (`wmic`) · `electron-builder.yml` (`extraResources` under `mac:` only) · `sound-player.ts:33` (`.m4a` + path interpolated into PowerShell) · `ipc-handlers.ts:196` (`resources/resources/…` script path) · `terminal-opener.ts:25,151`, `orca-bundle.ts:5,9`, `orca-cli.ts:36`, `bridge/orca.ts:147`, `office-setup.ts:104`, `office-service.ts:59` (osascript / `open -a` / codesign / ps).

**Goal:** the installed app works on Windows with the same features as macOS (visible tray, usable windows, live Claude/Codex/OpenCode/Orca sessions, focus, sounds, statusline), and macOS behaviour is unchanged.

**Architecture:** every platform difference sits behind a `platform: NodeJS.Platform = process.platform` parameter, so both branches are unit-tested on one machine. Windows process data comes from one fixed-script `powershell.exe` CIM query (absolute path, minimal env, no shell, only integer pids interpolated). A Phase 0 contract module is committed first, so five owners build in parallel against real code.

**Tech Stack:** Electron 44.7, electron-vite 5, electron-builder 26.15, TypeScript strict, Vitest 3, PowerShell 5.1 (CIM), Node ≥ 22.12.

**Spec:** issues #4–#8 under epic #9 (acceptance criteria are the issue checklists).

## Tickets

| Ticket | Status                             | Source link                                            | Conversation                                                                                                                                                            |
| ------ | ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #4     | Open — this PR                     | https://github.com/theangeloumali/ClaudeWatch/issues/4 | "Why doesn't the application have an app? It doesn't show the icon on the tray"                                                                                         |
| #5     | Open — this PR                     | https://github.com/theangeloumali/ClaudeWatch/issues/5 | "the sessions are not being shown on the ClaudeWatch so that's a significant issue. We need to make sure we validate and verify that this is … working here on Windows" |
| #6     | Open — this PR                     | https://github.com/theangeloumali/ClaudeWatch/issues/6 | "the sessions are not being shown on the ClaudeWatch so that's a significant issue. We need to make sure we validate and verify that this is … working here on Windows" |
| #7     | Open — this PR                     | https://github.com/theangeloumali/ClaudeWatch/issues/7 | "make sure that this is fully compatible with Windows and Mac"                                                                                                          |
| #8     | Open — this PR                     | https://github.com/theangeloumali/ClaudeWatch/issues/8 | "make sure that this is fully compatible with Windows and Mac"                                                                                                          |
| #9     | Open — tracking, closed by this PR | https://github.com/theangeloumali/ClaudeWatch/issues/9 | "dispatch a team of agents to file and handle this and make sure that this is fully compatible with Windows and Mac"                                                    |

## Phase ledger

- [x] Phase 0: Branch, plan of record, contract module
- [x] Phase 1: Wave 1 — five parallel owners (S1–S5)
- [x] Phase 2: Integrate + gate chain
- [x] Phase 3: Live Windows verification on this machine
- [x] Phase 4: Wave 2 review (Maya + Kai)
- [x] Phase 5: Close — mandate steps, end-to-end check, PR

## Execution shape

```ascii
 Phase 0  primary ─ branch fix/windows-support (worktree) ─ contract module ─ commit C0
                                         │
            ┌───────────┬────────────────┼───────────────┬───────────────┐
 Phase 1   S1 @lena    S2 @ravi         S3 @ravi        S4 @ravi        S5 @jordan      ← 5 parallel,
 (Wave 1)  #4 shell    #5 bridge core   #6 codex/       #7 focus/       #8 packaging/     own worktree
           tray·popover process table   opencode        terminal/Orca   wmic·sound·       each, all
           chrome·AUMID liveness·guard  win argv/cwd    authenticode    statusline·upd    from C0
            └───────────┴────────────────┼───────────────┴───────────────┘
 Phase 2  primary ─ merge 5 branches ─ office-window chrome hookup ─ STEP 6 gate chain
 Phase 3  primary ─ build:win ─ reinstall ─ LIVE Windows checks (this session visible)
 Phase 4  Wave 2 ─ @maya + @kai (risk 2) ─ fixes ─ codex-review
 Phase 5  primary ─ simplify · review · dead-code · checklist · E2E · vault · PR Closes #4–#9
```

Budget: `T3 active=5 total=12` → Wave 1 = 5, Wave 2 = 2, 1 reserved retry/domain-fix slot (8 of 12).

## Global Constraints

- macOS behaviour unchanged: every existing test keeps passing unmodified in intent; darwin branches stay byte-for-byte where untouched.
- Platform is injected (`platform: NodeJS.Platform = process.platform`) at every branch point; tests cover `darwin` and `win32` for each.
- No new runtime dependencies, no native modules.
- Windows subprocesses: `POWERSHELL` absolute path from the contract; `execFile` only, never `shell: true`; never run a `.cmd`/`.bat`; scripts are string constants, with only `Number.isSafeInteger` pids interpolated. File paths and strings go in through the child env (`$env:CLAUDEWATCH_*`), never as argv after `-Command` (Windows PowerShell parses those as code, verified 2026-10-13) and never spliced into script text.
- Child env = `childEnv(platform)` (C locale + UTC, plus `SystemRoot`/`windir` on win32), never `process.env`.
- Comment mandate (1–2 lines, the why only), `clean-code-typescript` (no `any`, no `as unknown as`), prettier on every changed file.
- Each owner edits ONLY their FILES OWN list; a bug elsewhere is reported `FOUND:`.

## Review Focus

1. Taskbar on top, left or right, or a secondary monitor with negative coordinates → the popover opens fully inside that display's work area (S1 test: `popoverPosition` table over all four edges plus a negative-origin display).
2. A registry pid reused by an unrelated process → session not shown, because the FILETIME start differs (S2 test: same pid, different `CreationDate`).
3. Command lines with quotes, spaces, `\"` and Unicode (`"C:\Program Files\…\codex.exe" --cd "D:\my proj"`) → argv parsed as Windows does (Phase 0 test table for `splitCommandLine`).
4. PowerShell missing, blocked or slower than 5 s → that source reports `ok:false`, the app and the other sources keep running, and nothing is unhandled (S2 test with `io.exec` rejecting; S5 likewise for the detector).
5. 150%/200% display scaling and a light or dark taskbar → the tray icon is crisp and visible (S1 ships 16/32 px PNGs with `@2x`; checked in the Phase 3 screenshot).

---

## - [x] Phase 0 — Branch, plan of record, contract module (primary, inline) · 1h with Claude | 4h without

**Files:** Create `src/shared/platform-process.ts`, `src/shared/platform-process.test.ts`, `docs/plans/claudewatch-windows-support-2026-10-13.md` (+ `.mmd`).

**Produces (exact):**

```ts
export const POWERSHELL: string // `${SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
export function childEnv(platform?: NodeJS.Platform): Record<string, string>
export function powershellArgs(script: string): string[] // ['-NoProfile','-NonInteractive','-Command', script]
export function startTimeQuery(
  pid: number,
  platform?: NodeJS.Platform
): { file: string; args: string[] }
//   darwin → '/bin/ps' + startTimeArgs(pid); win32 → POWERSHELL, `[Diagnostics.Process]::GetProcessById(<pid>).StartTime.ToFileTimeUtc()`
export function filetimeToMs(filetime: string): number // (BigInt(ft) / 10000n) - 11644473600000n
export function splitCommandLine(commandLine: string): string[] // CommandLineToArgvW rules
export function programName(argv0: string): string // basename over / and \, lowercased, minus .exe/.cmd/.bat
export function isAbsoluteFolder(path: string, platform?: NodeJS.Platform): boolean // posix '/' · win32 drive `X:\` or UNC `\\`
```

- [ ] Create `fix/windows-support` in `.claude/.worktree/windows-support`; `npm ci`
- [ ] Copy this plan to `docs/plans/claudewatch-windows-support-2026-10-13.md`; write the `.mmd` sidecar; `bash ~/.claude/scripts/plan-to-html.sh <md>`
- [ ] Failing tests: `startTimeQuery(55152,'win32')` script equals the fixed string; non-integer pid throws; `filetimeToMs('134363332085558530') === 1791859608555`; the `splitCommandLine` table (Review Focus 3); `programName('C:\\x\\Codex.EXE') === 'codex'`; `isAbsoluteFolder('C:\\Users\\a','win32')` true, `('/Users/a','win32')` false, `('relative','darwin')` false
- [ ] Implement, then run Verify; commit C0; create 5 slice worktrees `.claude/.worktree/win-s1…s5` from C0 (branch `win/s1…s5`) and `npm ci` in each

**Verify:** `npx vitest run src/shared/platform-process.test.ts && npm run typecheck`

## - [x] Phase 1 — Wave 1, five parallel owners (each in its own worktree, all from C0)

### S1 · @lena · #4 tray, popover, window chrome, notifications · 2h | 10h

**Own:** `src/main/tray.ts`, `src/main/tray.test.ts`, `src/main/minimize-to-tray.test.ts`, `src/main/index.ts`, `src/main/window-bounds.ts` (+test), `src/main/window-chrome.ts` (new, +test), `src/preload/index.ts`, `src/renderer/components/Header.tsx`, `resources/tray/*` (new), `tsconfig.node.json` (only for `?asset` typing).
**Produces:** `popoverPosition(tray: Rectangle, workArea: Rectangle, size: { width: number; height: number }): { x: number; y: number }` (window-bounds.ts) · `windowChrome(platform?: NodeJS.Platform): Partial<BrowserWindowConstructorOptions>` (window-chrome.ts: darwin = today's `hiddenInset`/traffic lights/vibrancy; win32 = `titleBarStyle:'hidden'` + `titleBarOverlay` tinted to the header rail, opaque background, height 44).

- [ ] Tray: on non-darwin, a real icon from `resources/tray` (16/32 px PNG + `@2x`, derived from `build/icon.png`, imported with electron-vite `?asset` so it ships inside the asar); darwin keeps the empty image + `setTitle`
- [ ] Non-darwin tooltip carries the count: `ClaudeWatch — N active` (`2x · ` prefix during a promo)
- [ ] `positionPopoverAtTray` uses `popoverPosition`: above a bottom taskbar, below a top one, beside a left/right one, clamped on both axes
- [ ] Dashboard + popover use `windowChrome`; `Header.tsx` keeps the 78px gap on darwin only and reserves the caption-button width on win32 (platform exposed from preload as `window.api.platform`; preload imports stay `['electron']`)
- [ ] `app.setAppUserModelId('com.zkidzdev.claudewatch')` on win32 before the first notification
      **Verify:** `npx vitest run src/main/tray.test.ts src/main/window-bounds.test.ts src/main/window-chrome.test.ts src/main/minimize-to-tray.test.ts src/main/build-config.test.ts && npm run typecheck && npm run build`

### S2 · @ravi · #5 bridge core: Claude sessions on Windows · 3h | 16h

**Own:** `src/bridge/process-table.ts` (+ new test), `src/bridge/liveness.ts`, `src/bridge/io.ts` (+ `io.test.ts`, `io-programs.test.ts`), `src/bridge/registry.ts` (+test), `src/bridge/teammates.ts` (+test), `src/bridge/index.ts` (+test), `src/bridge/core.test.ts`, `src/bridge/__fixtures__/*`, `src/shared/ps.ts`.
**Produces (kept stable for S3/S4):** `ProcessRow { pid; lstart; startedAtMs; argv }`, where on win32 `lstart` is the FILETIME string, compared verbatim with the registry's `procStart` · `readProcessTable(io, platform?)` · `readWorkingFolder(io, pid, platform?)` → `undefined` on win32 (no foreign-memory reads).

- [ ] `registry.ts:40` and `teammates.ts:136` use `isAbsoluteFolder`
- [ ] win32 table: one CIM query (`ProcessId, CreationDate.ToFileTimeUtc(), CommandLine`) filtered to the caller's `SessionId` (the `ps -x` analogue), `ConvertTo-Json -Compress`, argv via `splitCommandLine`; rows with no CommandLine or CreationDate are skipped
- [ ] `liveness.ts` uses `startTimeQuery`; `io.ts` allowlist adds `POWERSHELL` and execs with `childEnv`; `CREDENTIAL_STORE` matches `[\\/]`
- [ ] Measured: a cold PowerShell table read costs ~1.1 s CPU + ~0.3 s WMI, about 50% of a core at the 2 s poll. Decision (2026-10-13): a persistent host in `src/shared/powershell-host.ts` (`runPowerShell(script, timeoutMs)`, `closePowerShellHost()`) with base64-framed requests over stdin, one in flight, timeout → restart, no orphan on exit and a cold-spawn fallback; the table is incremental (CIM CommandLine only for an unseen pid + start). Budget: bridge + host ≤ 3% of one core at idle over 60 s
      **Verify:** `npx vitest run src/bridge src/shared && npm run typecheck && npm run build && node out/main/bridge.js --once` → the claude source is `live` and lists sessionId `b57e65c7-b04f-4745-9a90-60e1aecea8f1` with cwd `…\ZKidz\ClaudeWatch`

### S3 · @ravi · #6 Codex + OpenCode on Windows · 3h | 14h

**Own:** `src/bridge/codex.ts`, `codex-rollouts.ts`, `codex-usage.ts`, `codex-totals`/`codex*.test.ts`, `src/bridge/opencode.ts`, `opencode-activity.ts`, `opencode-db.ts`, `opencode*.test.ts`, `src/bridge/poller.ts`, `poller*.test.ts`, `src/bridge/project-root.ts`.
**Consumes:** `ProcessRow` (win32 argv[0] = full exe path), `programName`, `readWorkingFolder → undefined` on win32.

- [ ] Recognise win32 command lines: `codex.exe`, `node.exe …\@openai\codex\…`, `opencode.exe`, and the Codex desktop app (`…\OpenAI.Codex_*\app\ChatGPT.exe`) as the app-server host
- [ ] With no process folder on win32, attribute each process to the newest unclaimed rollout/session whose recorded cwd and start time fit (rollout `session_meta.cwd`, OpenCode's session directory); macOS keeps `lsof` matching
- [ ] `isInsideAppBundle` also excludes Windows install roots (`Program Files`, `WindowsApps`, `%LOCALAPPDATA%\Programs`)
      **Verify:** `npx vitest run src/bridge && npm run typecheck && npm run build && node out/main/bridge.js --once` → codex and opencode sources `ok: true`

### S4 · @ravi · #7 focus, open-terminal, Orca on Windows · 3h | 16h

**Own:** `src/main/terminal-opener.ts`, `terminal-resolver.ts`, `pane-focus.ts`, `orca-cli.ts`, `office-setup.ts`, `office-interactions.ts`, `src/shared/orca-bundle.ts`, `src/bridge/orca.ts`, `src/office-host/office-service.ts`, and their tests (`*.test.ts`, `orca-bundle.codesign.test.ts`).
**Keeps stable:** `ORCA_APP`, `ORCA_CLI: string` (resolved per platform at load; `io.ts` imports it), `assertOrcaTrusted()`.

- [ ] win32 `ORCA_CLI` = `%LOCALAPPDATA%\Programs\orca\resources\bin\orca.exe`, never `orca.cmd`; trust = `Get-AuthenticodeSignature` `Valid` + pinned signer subject `CN=SignPath Foundation, O=SignPath Foundation, L=Lewes, S=Delaware, C=US` + `VersionInfo.CompanyName === 'stablyai'`; path passed as `$env:CLAUDEWATCH_*`
- [ ] Launch Orca on win32 by executing `Orca.exe` directly; the Orca pane key on win32 comes from Orca CLI output, not process environment
- [ ] Focus on win32: walk `ParentProcessId` to the nearest ancestor with a top-level window and bring it forward (`ShowWindow` + `SetForegroundWindow`); terminal resolution recognises `WindowsTerminal.exe`, `Code.exe`, `Cursor.exe`, `Orca.exe`, `conhost`
- [ ] Open terminal on win32: `wt.exe -d <folder>` when present, else `cmd.exe` spawned with `cwd: folder` (the folder never enters argv text)
- [ ] `office-service.ts:59`, `office-setup.ts:104`, `orca.ts:147` use `startTimeQuery` / the Orca CLI path
      **Verify:** `npx vitest run src/main src/shared src/bridge/orca.test.ts src/office-host && npm run typecheck && npm run build && node out/main/bridge.js --once` → orca source not `unavailable`

### S5 · @jordan · #8 detector, sounds, statusline, updater, packaging · 2h | 10h

**Own:** `src/main/platform/win32.ts` (+test), `src/main/platform/exec.ts`, `src/main/process-monitor.ts` (+test), `src/main/sound-player.ts` (+test), `resources/sounds/*`, `resources/claudewatch-statusline.sh`, `electron-builder.yml`, `src/main/build-config.test.ts` (only the files/resources specs), `src/main/ipc-handlers.ts` (+tests), `src/main/rate-limit-reader.ts` (+test), `src/main/auto-updater.ts` (+test).

- [ ] `Win32Detector` uses one CIM query via `POWERSHELL` + `childEnv` (no `wmic`)
- [ ] Top-level `extraResources` ships `resources/sounds` + `claudewatch-statusline.sh` on every platform (mac keeps the widget `extraFiles`)
- [ ] Add `task-complete.wav` (ffmpeg from the m4a); win32 plays the WAV with the path passed as `$env:CLAUDEWATCH_*`; darwin keeps `afplay` + m4a
- [ ] Statusline: packaged source = `join(process.resourcesPath, 'claudewatch-statusline.sh')`; on win32 the command is one Claude Code's Git Bash runs (forward-slash path), and the script runs under Git Bash
- [ ] Auto-updater on win32 with no Windows release: no error reaches the UI
      **Verify:** `npx vitest run src/main/platform src/main/sound-player.test.ts src/main/build-config.test.ts src/main/ipc-handlers.test.ts src/main/rate-limit-reader.test.ts src/main/auto-updater.test.ts src/main/process-monitor.test.ts && npm run typecheck && npm run build:win -- --publish never` → `dist/win-unpacked/resources/{sounds/task-complete.wav,claudewatch-statusline.sh}` exist

## - [x] Phase 2 — Integrate + gate chain (primary) · 1.5h | 6h

- [ ] Merge `win/s1…s5` into `fix/windows-support` (disjoint files → no conflicts); re-run every owner's Verify
- [ ] `office-setup.ts` `createOfficeWindow` spreads `windowChrome()`, and the `Win32Detector` injected runner defaults to `runPowerShell` (the two cross-slice lines)
- [ ] STEP 6: `npx prettier --write <changed>` → `npx eslint .` → `npm run typecheck` → `npx vitest run` → `npm run build` → `npx knip`
      **Verify:** `npx eslint . && npm run typecheck && npx vitest run && npm run build`

## - [x] Phase 3 — Live Windows verification on this machine (primary) · 1.5h | 6h

- [ ] `npm run build:win -- --publish never`; quit the running 1.3.0; silent reinstall; launch
- [ ] Tray: the registry `IconSnapshot` is non-empty; screenshot the tray; the tooltip shows the count
- [ ] Popover: click the tray → screenshot shows it fully on screen above the taskbar
- [ ] Dashboard + Office: screenshots show native minimize/maximize/close; each button works
- [ ] **Sessions (headline):** the dashboard and the Office list this session (`ClaudeWatch` folder, busy/idle live); start `codex` and `opencode` in a scratch folder in Windows Terminal → both appear in the right folder within 2 polls; closing one removes it
- [ ] Clicking a session raises its Windows Terminal window; "Open terminal" opens the folder; Orca panes appear when Orca runs
- [ ] Completion sound plays; statusline setup writes a working `statusLine` (run `claude` once and see it); the updater check logs no UI error
- [ ] `verify-claudewatch` office smoke on Windows: console errors = 0
      **Verify:** the evidence set above: screenshots in `recordings/windows-support/`, `bridge --once` JSON, registry snapshot bytes > 0

## - [x] Phase 4 — Wave 2 review: @maya + @kai (risk 2) · 1.5h | 8h

- [ ] Maya: diff-scoped review + FILES TOUCHED cross-check, coverage of both platforms and Review Focus 1–5
- [ ] Kai: PowerShell invocation (fixed scripts, pid-only interpolation, no shell), the path guard, the Authenticode trust check, the env passed to children
- [ ] Fix findings at the root; `bash ~/.claude/hooks/codex-review.sh` (exit 2 → fix, re-run once)
      **Verify:** `npx eslint . && npm run typecheck && npx vitest run && npm run build`

## - [x] Phase 5 — Close (primary) · 1h | 4h

- [ ] `/simplify` → code-review → reuse audit → `bash ~/.claude/hooks/dead-code-check.sh`
- [ ] Feature checklist `~/Desktop/eor-feature-checklists/CLAUDEWATCH-9-review-checklist.md`, every row Pass or Blocked
- [ ] Rebuild + reinstall the final build; end-to-end walk of tray → popover → dashboard with live sessions → Office → focus on the installed build
- [ ] `bash ~/.claude/hooks/vault-append.sh …`
- [ ] Commit (Angelo identity; no assistant attribution), push `fix/windows-support`, `gh pr create` with `**Tickets — Closes #4, #5, #6, #7, #8, #9**`; comment status on each issue
      **Verify:** `gh pr view --json url,state` → OPEN; `git log @{upstream}..HEAD --format='%an <%ae>'` → only Angelo

## Blockers already known (four-leg, surfaced now)

- **macOS runtime smoke**: no Mac on this machine. Attempt: macOS is covered by unit tests on the darwin branch + typecheck; `build:mac` can't run on Windows. Owner: Angelo, by running `verify-claudewatch`'s office smoke on his Mac (command goes in the PR body).
- **Slack ticket marking**: the Slack connector isn't authenticated in this session. Owner: Angelo (`/mcp` → slack auth). GitHub issues are marked regardless.

## Estimate

| Phase                       | With Claude                                        | Without |
| --------------------------- | -------------------------------------------------- | ------- |
| 0 Contract + setup          | 1h                                                 | 4h      |
| 1 S1–S5 (parallel; sum)     | 13h agent-time, ~3h wall                           | 66h     |
| 2 Integrate + gates         | 1.5h                                               | 6h      |
| 3 Live Windows verification | 1.5h                                               | 6h      |
| 4 Review + fixes            | 1.5h                                               | 8h      |
| 5 Close                     | 1h                                                 | 4h      |
| **Total**                   | **19.5h effort (~9.5h wall with parallel owners)** | **94h** |

Multiplier ≈ 4.8× (79% saved); familiar codebase with established patterns and test fixtures, but Windows process APIs are novel to it.
