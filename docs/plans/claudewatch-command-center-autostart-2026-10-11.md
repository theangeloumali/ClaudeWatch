# ClaudeWatch as the command center: auto-start, install, release

## Context

The 3D office is built and open as PR #2 (`feature/3d-office`, 63 commits, 769 tests). Today it only runs from `npm run dev` plus a tray click, and the ClaudeWatch in `/Applications` is 1.2.15, which has no Office. Angelo wants it to run by itself as the command center: start at login, open the Office, come back where he left it, installed now, signed and released.

Tier T2 (score 8 capped by a single implementation slice; risk 3 because of install and release). Built inline, one review pair (@maya + @kai).

## Tickets

| Ticket              | Status                                                                        | Source link                                          | Conversation                                                               |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| none — needs filing | Planned; lands in PR #2 as follow-up commits                                  | https://github.com/theangeloumali/ClaudeWatch/pull/2 | "How can I run this? I want it be automatically run as our command center" |
| none — needs filing | Planned; merge of PR #2, then release 1.3.0 (release step blocked, see below) | https://github.com/theangeloumali/ClaudeWatch/pull/2 | "install it now and it should be signed and released"                      |

## Owner decisions (this round)

- Auto-start: **Login + Office** — ClaudeWatch starts at login and opens the Office when it starts.
- Install: "install it now and it should be signed and released".
- Window: **remember place and size**, including the display.

## Ledger

- [x] Phase 1 — Open the Office on start: `openOfficeOnLaunch` setting, Settings toggle, startup hook (TDD)
- [x] Phase 2 — Office window remembers its place, size and display (TDD)
- [x] Phase 3 — Gates, review, runtime smoke, push to PR #2
- [x] Phase 4 — Merge PR #2 to `main` (7fc04cd), install on this Mac, turn both toggles on, verify at next start (installed build is signed with the team's Apple Development certificate; the Office opened by itself on real sessions, login item registered, one running copy)
- [x] Phase 5 — Signed release 1.3.0: published to GitHub Releases as v1.3.0 on 2026-10-12T10:17:12Z (arm64 + x64 DMG/ZIP + latest-mac.yml), signed with the team's Developer ID Application certificate; notarisation still waits on Apple's agreement review (owner: Angelo), and 1.4.0 followed on 2026-10-13

## How it fits

```ascii
 login ──> macOS login item ──> ClaudeWatch (tray app)
                                      │  app.whenReady
                                      v
                        settings.openOfficeOnLaunch ? ──no──> tray only (today's behaviour)
                                      │ yes
                                      v
                        office.open()  (same call the tray item and --open-office use)
                                      │
                                      v
              createOfficeWindow( bounds = saved bounds if still on a connected display,
                                           else 1280x820 centred )
                                      │ close / quit
                                      v
                        store.officeWindowBounds = { x, y, width, height }
```

## Phases

**Phase 1 — Open the Office on start.**

- `src/renderer/lib/types.ts`: `AppSettings.openOfficeOnLaunch: boolean`, default `false` (other users keep today's behaviour after updating; it is switched on for this Mac in Phase 4).
- `src/main/store.ts`: back-fill the field for existing settings files, like `minimizeToTray`.
- `src/main/ipc-handlers.ts` (`validateSettings`): accept the new key.
- `src/main/index.ts:128`: `if (settings.openOfficeOnLaunch || process.argv.includes('--open-office')) office.open()`.
- `src/renderer/components/Settings.tsx`, System section, next to "Launch at Login": a "Open the Office on start" toggle (reuses `SettingRow` and `ToggleSwitch`).
- Tests first: store back-fill, validator accepts and type-checks the key, startup decision as a pure function, Settings toggle calls `updateSettings`.
- Verify: `npx vitest run src/main src/renderer/__tests__ && npm run typecheck` exit 0.
- 1h with Claude | 3h without.

**Phase 2 — Remember place and size.**

- New `src/main/window-bounds.ts`: pure `restoreBounds(saved, displays, fallback)` — returns the saved rectangle only when it still overlaps a connected display's work area, clamped to it; otherwise the fallback.
- `src/main/store.ts`: `officeWindowBounds` beside the existing `popoverPosition` (same pattern, not part of `AppSettings`).
- `src/main/office-setup.ts` `createOfficeWindow`: size and position from `restoreBounds(store…, screen.getAllDisplays(), 1280x820)`; save `getNormalBounds()` on `close`.
- Tests first: saved bounds on a connected display are reused; a display that is gone falls back; an oversized rectangle is clamped; nothing saved gives the default.
- Verify: `npx vitest run src/main && npm run typecheck` exit 0; smoke: move and resize the Office, quit, start, same place.
- 1.5h with Claude | 4h without.

**Phase 3 — Gates, review, push.**

- prettier, `npm run typecheck`, `npx eslint .`, `npx vitest run`, `npm run build`.
- Runtime smoke with `.claude/skills/verify-claudewatch`: built app started without `--open-office` and the setting on opens the Office with 0 console errors; with the setting off it stays in the tray.
- `/simplify`, dead-code scan, review by @maya (logic) and @kai (settings validation, window bounds from stored data), fixes in session.
- Push the follow-up commits to `feature/3d-office`; PR #2 body gains the two additions.
- Verify: all gates exit 0; smoke evidence; PR #2 updated.
- 1.5h with Claude | 4h without.

**Phase 4 — Merge, install, switch on.**

- `gh pr merge 2 --squash` with a hand-written subject and body (this repo has no `develop`; `main` is linear feature commits plus version commits).
- Install on this Mac. If Phase 5's prerequisites are present, the installed app is the release build. If they are not, an interim build so the command center runs today: `npm run build && npm run build:widget`, then `electron-builder --mac dir --arm64 --publish never` with notarisation off, signed with the Apple Development certificate that is on this Mac (ad-hoc if electron-builder refuses it). The current `/Applications/ClaudeWatch.app` (1.2.15) is moved to `~/Applications/ClaudeWatch-1.2.15-backup.app` first, not deleted.
- With ClaudeWatch quit, set `launchAtLogin: true` and `openOfficeOnLaunch: true` in its own settings file (a backup copy is kept), then start the installed app: it registers its own login item at start (`src/main/index.ts:103`).
- Verify: `osascript -e 'tell application "System Events" to get the name of every login item'` lists ClaudeWatch; the installed app starts with the Office open on real sessions, 0 console errors; quit and start again, the window is where it was left.
- 1h with Claude | 2h without.

**Phase 5 — Signed release 1.3.0.**

- `npm run release:minor` (bumps to 1.3.0, tags, builds, signs, notarises, publishes to GitHub Releases); release notes from `scripts/generate-changelog.js`.
- Install the released DMG over the interim build; confirm `codesign -dv` shows the Developer ID authority and `spctl -a -vv` accepts it.
- Verify: release `v1.3.0` exists with dmg, zip and `latest-mac.yml`; the installed app is that build.
- 1h with Claude | 2h without.

## Blocker (Phase 5 only)

- **What is missing:** this Mac's keychain has no "Developer ID Application" certificate (the installed 1.2.15 is signed by team `7QZW432V8B`; `security find-identity` shows only Apple Development and an unrelated Apple Distribution certificate). `electron-builder.yml` also sets `notarize: true`, and the shell has no `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` or notarytool keychain profile, and no `GH_TOKEN` for publishing.
- **Attempt:** checked the keychain (valid and expired identities), the environment (names only), notarytool profiles, and the release scripts.
- **Owner:** Angelo.
- **To unblock:** import the Developer ID certificate into this Mac's login keychain, and make the notarisation credentials and a GitHub token available to the release command (in the shell profile, or by running the command yourself as `! APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=7QZW432V8B GH_TOKEN=… npm run release:minor`). I do not read or print those values.
- Phases 1 to 4 do not depend on it.

## Deploy

Approving this plan authorises: pushing follow-up commits to `feature/3d-office`, updating PR #2, squash-merging PR #2 into `main`, replacing `/Applications/ClaudeWatch.app` on this Mac (old copy kept), editing ClaudeWatch's own settings file on this Mac, and, once unblocked, pushing the `v1.3.0` version commit and tag to `origin` and publishing the GitHub release. No force-push, no history rewrite, `origin` only.

Worth knowing before approving the release: publishing 1.3.0 delivers Electron 44 and the Office to every installed copy through auto-update. Talk and permission answers have not been fired at real running agents yet; the interim install in Phase 4 is the chance to try them before Phase 5.

## Estimate

Total **6h with Claude | 15h without** (2.5x): Phase 1 1|3, Phase 2 1.5|4, Phase 3 1.5|4, Phase 4 1|2, Phase 5 1|2. Phases run in order; nothing is parallel.

## Assumptions

- ASSUMPTION: the new setting defaults to off for everyone and is switched on for this Mac — chose this because a tray app that starts opening a 3D window after an update would surprise other users.
- ASSUMPTION: squash-merge for PR #2 — chose this because `main` has no `develop` behind it and its history is one commit per feature.
- ASSUMPTION: the interim install replaces the app in `/Applications` rather than sitting beside it — chose this because login items and the single-instance lock work on one copy, and the old app is kept as a backup.
- ASSUMPTION: local-database question skipped — ClaudeWatch has no data layer.
- ASSUMPTION: version 1.3.0 (minor) — new feature and a major Electron upgrade, no breaking change for users.

## Review fixes (2026-10-11)

Found by the QA, security and code-review passes on the first commit, each fixed with a test or a runtime check:

- Cmd+Q left a process with no tray and no window (`before-quit` never set the quitting flag). Reproduced on the built app, fixed, and checked on the packaged app.
- No single-instance lock existed, so a login item plus a manual start ran two copies. A packaged app now keeps one.
- `settings:set` kept values of the wrong type (a null group, a NaN interval), which could stop the next start. Settings are shape-checked on the way in and when the stored file is read.
- The window was saved on every close, so one start without its display overwrote the remembered place. It is now saved when the user moves or resizes it.
- A window that mostly sat on an unplugged display was squeezed onto the remaining one. The display under the window's centre decides; otherwise the default is used.
- The Office opened in the middle of startup; a failure there would have cost the tray. It now opens last and is contained.

Left as they are: full-screen or maximised state is not restored; the Dock icon still opens the dashboard, not the Office; Windows-specific snapped-window and mixed-DPI behaviour (this milestone is macOS only).

## Deviations

- `src/main/bugfix-issues.test.ts` holds the new validator tests, because the existing `validateSettings` tests live there.
- `src/main/office-window.ts` holds `opensOfficeOnStart`, so the start decision is testable without Electron.
- The scope check lists 116 files that this work does not touch: 114 mode-only changes (100644 → 100755) and 2 deleted Xcode user-state files that were already in the working tree before the session. They are never staged.
- `claudedocs/project_claudewatch-prerelease_batch.md` is the intake ledger of the next batch (eight pre-release items raised in the same session). It is not part of this plan.
- `src/main/settings-shape.ts` was added by the review fixes: the one rule set for a valid setting (known key, shape of its default, number inside its range), used by `settings:set` and by the store when it reads the file. `src/main/store.test.ts` holds its read-path tests.
