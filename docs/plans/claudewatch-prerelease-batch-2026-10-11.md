# ClaudeWatch pre-release batch: nine items before 1.3.0

Branch `feature/prerelease-batch`. Ledger of the batch with the owner's words: `claudedocs/project_claudewatch-prerelease_batch.md`. Research per item: `/tmp/cw-research-b/out/` (local).

## Context

Angelo listed eight things to finish before the next release and reported a ninth while the research ran. He then set the run to continue without further questions, so every open choice below is decided here and marked as an assumption.

## Tickets

| Ticket                  | Status                   | Source link                 | Conversation                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0 — none, needs filing | Planned, Phase 3         | session message, 2026-10-11 | "The zooming, the panning, zooming in, zooming in and zooming out, and the panning in and panning out should also be optimized and smoothened out"                                                                                                                                                                                                |
| B1 — none, needs filing | Planned, Phases 2 and 5  | session message, 2026-10-11 | "Where is the button for us to start the office? Do we already have that on the CloudWatch main frame?"                                                                                                                                                                                                                                           |
| B2 — none, needs filing | Planned, Phases 5 and 6  | session message, 2026-10-11 | "I want you to overhaul and redesign the whole CloudWatch aggressively. You can use UI/UX Pro Max. Coordinate with Codex for possible redesign choices. As much as possible we need to overhaul the design for that. We need it to be better."                                                                                                    |
| B3 — none, needs filing | Planned, Phases 1 and 6  | session message, 2026-10-11 | "On the office we need to know how many contacts or how many tokens the company or the office has used. For example on a project basis how many tokens have they used? We also need to know how many agents and how many tokens the agent has already used"                                                                                       |
| B4 — none, needs filing | Planned, Phase 2         | session message, 2026-10-11 | "The ability for us to focus on the exact pane, terminal, or tab to Orca, because this is strictly integrating with Orca. We need to properly implement it correctly."                                                                                                                                                                            |
| B5 — none, needs filing | Planned, Phases 4 and 8  | session message, 2026-10-11 | "I want to also introduce a set of themes: also each office can have a configurable theme instead of everything are the same a. code geass inspired team - full mecha of code geass and some significant characters like lelouch, kallen, shirley, zero, suzaku and other interesting characters b. gundam team c. a nature chill inspired theme" |
| B6 — none, needs filing | Planned, Phase 7         | session message, 2026-10-11 | "We need to also make sure we track all of the token usage, overall token usage for each of the accounts in Claude. For example in Orca, you can have multiple Claude accounts. If possible every authenticated account should also be watched here."                                                                                             |
| B7 — none, needs filing | Planned, Phases 9 and 10 | session message, 2026-10-11 | "Also I want you to make sure that this is properly wired with ZKidz claude Team. Even without Cloud Watch I should be able to use it with just the ZKidz claude team repo"                                                                                                                                                                       |
| B8 — none, needs filing | Validated, Phase 1       | session message, 2026-10-11 | "the agents are not reflecting in the office, but it shows on our mod commanenter"                                                                                                                                                                                                                                                                |

Validated (B8): with six teammates running, `node out/main/bridge.js --once` reported `subagents: 0` for the lead while `ps` showed six `--agent-id … --parent-session-id …` processes. Root cause: `src/bridge/registry.ts` lists only `~/.claude/sessions/<pid>.json` (teammates write none) and `src/bridge/subagents.ts:19-27` reads only in-process subagent sidecars; the roster in `~/.claude/teams/session-<id>/config.json` is never read.

## Ledger

- [x] Phase 0 — Contract: optional fields for teammates, tokens, accounts and focus in `src/shared/office/types.ts` (31d253b); this plan
- [x] Phase 1 — Data: teammates in the Office (B8) and token counters per session, subagent and teammate (B3) (merged 4f69ee5: the live bridge reports token totals for six Claude sessions and this session's three running agents; a process-backed teammate was then observed live under its lead with its name, pid, Orca pane key and its own token count)
- [x] Phase 2 — Orca: exact pane focus (B4), an Open Office entry for the dashboard (B1, main side), one Orca binary and a signature check (merged 00c068f, gate fix 35511af; live check passed: the built app focused this session's own Orca pane by process id and returned `target: pane`, and a stale handle returns `terminal_handle_stale` with exit 1)
- [x] Phase 3 — Camera: continuous zoom toward the cursor, inertial pan, interaction frame policy (B0) (merged e039129: cursor drift during zoom 1,565–2,449 px to 0.01 px, pan gain 2.0 to 1.0, name cards 0 px behind while rotating, two-finger scroll pans instead of zooming; headless Chromium on the real GPU)
- [x] Phase 4 — Theme engine: a theme per company with a project override (B5) (merged 898cdf7; two themes on one floor measure 245 to 264 draw calls, three measure 283 to 292, ceiling 300)
- [x] Phase 5 — Dashboard and popover redesign, "Dispatch Deck", with the Open Office button (B2, B1) (merged 5f7403f, wired to the real preload in eb95d99; the built app on live sessions shows the hold lane, squads, tokens by project and Open Office with 0 console errors)
- [x] Phase 6 — Office HUD redesign: tokens, teammates, theme picker and focus in the HUD (B2, B3, B4, B5) (merged 94a2105, then 94e3a14, d874a89, d5d77fb: tokens per office, project, agent and teammate; theme picker per company and project; Focus terminal through the feed on every host; talk and peek reach a teammate's own pane; zoom and fit buttons; 0 console errors on the preview)
- [x] Phase 7 — Accounts: ledger, attribution, Accounts view (B6) (merged 9ac0aac and 33ec28d, then the review fixes: a ledger that reads names and plans only, kept in a 0600 file; an Accounts screen with tokens for today, 7 days and since tracking, split exact and inferred; this Mac's live ledger lists 5 accounts)
- [x] Phase 8 — Three themes: Violet Court, Orbital Garrison, Quiet Grove (B5) (merged 005d539 + 67f02c5, ce0404b, c18b50a: 12 named characters and three parked frames or helpers per theme; alone 86 to 128 draw calls, mixed with Neo Edo Steam 212 to 231, three themes on one floor 258, ceiling 300)
- [x] Phase 9 — Standalone Office: loopback web host and web bridge in ClaudeWatch (B7) (merged edb65a4: `npm run build:office-web` emits 10 files, 1.44 MB, largest 383,551 bytes; view-only server on 127.0.0.1 refused a request without the token and a POST to an action route; 26 guards each have a test that fails when the guard is removed)
- [x] Phase 10 — zkidz-claude-team: vendored Office bundle and the `zkoffice` command (B7) (framework PR #96 merged as fff5c03, closes #95: `office/` bundle of 9 files and 1.5 MB, `bin/zkoffice`, `/zk:office`, 70-case harness in that repo's gate; installed on this Mac and started from `~/.claude/bin/zkoffice`: page 200, no token 401, port free after stop)
- [x] Phase 11 — Release readiness: notarisation switch, changelog, README, clean-clone check (cdaccf5: the builder skips notarisation when its credentials are absent and does not fail; README now describes the local release; Node version declared)
- [x] Phase 12 — Integration: gates, QA and security review, second review, cleanup pass, dead-code scan, demo, notes (two review rounds and an independent one, all findings fixed; cleanup pass applied; 1,924 tests in 187 files, typecheck, eslint, both builds and the dead-code scan pass at 3baf3d0; that build is installed in `/Applications`; demo re-recorded on it and frame-checked; learnings recorded; worktrees removed)
- [x] Phase 13 — Signed release 1.3.0: published to GitHub Releases as v1.3.0 on 2026-10-12T10:17:12Z (arm64 + x64 DMG/ZIP + latest-mac.yml), signed with the team's Developer ID Application certificate; notarisation still waits on Apple's agreement review (owner: Angelo), and 1.4.0 followed on 2026-10-13

## How the work is cut

```ascii
 Phase 0 contract (done)
   |
   +--> P1 data [bridge/**] -------------+----> P7 accounts [bridge, main, dashboard view]
   +--> P2 orca [main/**, preload/**] ---+----> P9 web host [office-host, office-web, office main.tsx]
   +--> P3 camera [scene/CameraRig, RenderLoop, CardProjector, logic/camera-*]
   +--> P4 theme engine [themes/**, scene/Floor*, OfficeScene, BatchedScene] --> P8 three themes [themes/<name>/**]
   +--> P5 dashboard + popover [renderer/** except office]
                                         |
                                         +----> P6 Office HUD [office/hud/**, OfficeApp, logic/interactions]
                                                                   |
                                 P10 framework repo <-- P9 --------+--> P11 release readiness --> P12 integration
```

One owner per file in a wave. A slice that needs a file outside its list reports it and the lead integrates.

| Phase | Owner                         | Owns (others do not edit these in the same wave)                                                                                                                                                 |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | @ravi                         | `src/bridge/**`                                                                                                                                                                                  |
| 2     | @ravi                         | `src/main/**`, `src/preload/**`                                                                                                                                                                  |
| 3     | @lena                         | `src/renderer/office/scene/{CameraRig,RenderLoop,CardProjector,NameCards}.tsx`, `logic/{camera-bands,frame-governor,zone-framing,card-culling}.ts`                                               |
| 4     | @lena                         | `src/renderer/office/themes/**`, `scene/{OfficeScene,FloorView,Robot,WorldView,BatchedScene}.tsx`, `scene/mesh-batches.ts`, `logic/zone-model.ts`, `src/renderer/office-live/layout-geometry.ts` |
| 5     | @lena with @priya's direction | `src/renderer/**` except `office/` and `office-live/`; `tailwind.config.ts`; `src/renderer/styles/globals.css`                                                                                   |
| 6     | @lena                         | `src/renderer/office/hud/**`, `OfficeApp.tsx`, `logic/{interactions,hotkeys,office-reducer,name-cards,floor-model}.ts`, `fixture/**`                                                             |
| 7     | @ravi, @kai reviews           | `src/main/accounts/**` (new), the accounts view in the dashboard                                                                                                                                 |
| 8     | @lena ×3                      | one folder per theme under `src/renderer/office/themes/`                                                                                                                                         |
| 9     | @ravi                         | `src/office-host/**`, `src/office-web/**`, `src/renderer/office/{main.tsx,web-bridge.ts}`, the web build configs                                                                                 |
| 10    | @jordan                       | `zkidz-claude-team/office/**`, `bin/zkoffice`, the command and its docs                                                                                                                          |
| 11    | @jordan                       | `electron-builder.yml`, `README.md`, release scripts                                                                                                                                             |

## Phases

Each phase is test-first and ends with its own Verify line passing. Hours are with AI help | without.

**Phase 1 — Data.** A bridge source for agent teams: for each live lead session read its roster, keep members whose process is alive (matching `--agent-id` and `--parent-session-id`), and report them in `subagents[]` with `kind: 'teammate'`, name, pid, start time and Orca pane key. Token counters: cumulative per session, subagent and teammate, read incrementally with the dedupe key the research measured; `tokens` on `SessionRef` and `SubagentRef`. The sim seats teammates like subagents. Verify: `npx vitest run src/bridge src/office src/shared && npm run typecheck`, and `node out/main/bridge.js --once` lists this session's teammates with token counts. 10h | 26h.

**Phase 2 — Orca.** `focus(agentKey)` behind the existing ownership checks: `orca terminal switch --terminal <handle> --json`, then raise Orca; app-only focus with a message when the pane cannot be proven. A pid-keyed jump for dashboard rows, tray rows and notification clicks. `app:open-office` for the dashboard page. One Orca binary path for bridge and main, with a code-signature check before first use. Verify: `npx vitest run src/main src/preload && npm run typecheck`; one live switch on this Mac. 9h | 23h.

**Phase 3 — Camera.** Continuous zoom toward the cursor with the three bands kept as level-of-detail thresholds, trackpad pan and pinch, inertial pan, a raised frame rate while interacting that decays when idle, name cards that track the canvas. Verify: the frame-time script from the research meets its targets; `npx vitest run src/renderer/office`. 8h | 20h.

**Phase 4 — Theme engine.** Kit split into floor-scoped and zone-scoped parts; theme resolved per zone (company default, project override) from `claudewatch.office.themes`; merged world layer to stay inside the draw budget; unit-part batching for rosters. Verify: budget tests green with two themes on one floor. 17h | 44h.

**Phase 5 — Dashboard and popover.** The Dispatch Deck direction (`recordings/redesign-mocks/game-hud.html`) with Mission Control's hold lane and wait clocks: shared tokens, the squad roster, tokens by project, the Open Office button, pane focus on rows. Verify: `npx vitest run src/renderer/__tests__ && npm run build`; dev-tools check with 0 console errors. 16h | 44h.

**Phase 6 — Office HUD.** The same direction in the HUD: work-order slips in the queue and inspector, tokens per company, project and agent in the Offices panel, inspector and list view, teammates named, the theme picker per office row, Focus terminal. Verify: `npx vitest run src/renderer/office && npm run build`; preview screenshots. 14h | 38h.

**Phase 7 — Accounts.** An accounts ledger in main: identity sampled from the five identity keys (never tokens), sessions attributed by which account was active, daily buckets persisted, limits shown with their age. Accounts view on the dashboard; label only in the Office. Verify: `npx vitest run src/main && npm run typecheck`; @kai signs off. 12h | 32h.

**Phase 8 — Themes.** Violet Court (knightly court of mecha and pilots), Orbital Garrison (white-armour space garrison), Quiet Grove (a garden office). Original designs and names. Verify: budget tests; one screenshot per theme. 36h | 96h.

**Phase 9 — Standalone host.** A transport-agnostic office service shared by the Electron window and a zero-dependency loopback server; the Office page picks a web bridge when no preload exists. View-only unless started with `--interactive`. Verify: `npx vitest run src/office-host src/office-web`; the page served from the built bundle shows live sessions. 12h | 37h.

**Phase 10 — Framework repo.** `office/` bundle, `bin/zkoffice`, `/zk office`, installer links, docs, the repo's own gate. Verify: `bash scripts/validate-framework.sh` exit 0 in that repo; `zkoffice` opens the Office with ClaudeWatch absent. 5h | 14h.

**Phase 11 — Release readiness.** Whatever the release study lists, each as a checkable fix. Verify: its own list. 4h | 10h.

**Phase 12 — Integration.** Full gates, runtime smoke on real sessions, @maya and @kai review, one second review, cleanup pass, dead-code scan, the walkthrough, notes. Verify: every gate exits 0. 10h | 24h.

Total **153h with AI | 408h without**. Phases 1 to 5 run in parallel, then 6 to 9, then the rest.

## Assumptions (decided without asking, as instructed)

- ASSUMPTION: redesign direction is **Dispatch Deck** with Mission Control's hold lane — chose it because it shares the Office's world and still reads fast; Codex's Dispatch Desk contributes the rule that a waiting agent looks identical on all three surfaces.
- ASSUMPTION: the franchise themes ship as **original inspired-by designs with original names** — chose this because the repo is public and the app auto-updates to other users. A local roster file on this Mac, not in the repo, gives the characters the names Angelo asked for.
- ASSUMPTION: theme granularity is **company default with a project override**.
- ASSUMPTION: token numbers are **session totals with a today figure**, one total with the breakdown in the inspector, no dollar cost; "contacts" is read as agent counts, which the Offices panel already shows.
- ASSUMPTION: accounts read the **five identity keys only**, behind a setting that defaults on; the email shows on the dashboard only; usage per account means tokens on this Mac since tracking starts; no statusline tee in this batch.
- ASSUMPTION: the non-Orca terminal openers **stay as the fallback**.
- ASSUMPTION: the standalone page is **view-only by default**; typing into terminals from the web page needs `--interactive`.
- ASSUMPTION: the framework repo carries a **prebuilt bundle** with each file under that repo's commit-size guard, so the guard is not overridden.
- ASSUMPTION: writers work in worktrees under `.claude/.worktree/`; no local-database question, the app has no data layer.
- ASSUMPTION: the bridge runs for the whole life of the app, not only while the Office window is open — chose this because the dashboard's "Needs you" lane, tray rows, notification clicks and the accounts ledger all read it.
- ASSUMPTION: the fly-to frame target (worst frame at or under 34 ms) is left at the measured 36 and 43 ms on two of six fly-tos — chose this because the only known lever is caching the batch key per material, and a material's colour changes in place when a theme changes, so a cached key could batch two different colours together. One dropped frame per fly-to is the smaller harm.
- ASSUMPTION: view-only on the web page still allows "focus this agent's pane" — chose this because it types nothing into a terminal.
- ASSUMPTION: account watching stays on by default — chose this because the owner asked for every signed-in account to be watched; the switch and the Accounts screen say that names, plans and email addresses are read and kept on this Mac, and that turning it off keeps what was counted.
- ASSUMPTION: Talk types only when the agent's own input line is at the bottom of its screen — chose the positive proof over a list of known dialogs after the review showed a list misses unnumbered pickers; the cost is that an unusual prompt layout is refused until its shape is added.
- ASSUMPTION: the view-only web page still lets you focus an agent's terminal — chose this because it types nothing; outside Orca it only brings the terminal app forward.
- ASSUMPTION: a transcript is append-only — the ledger counts a line when it lies beyond the furthest byte counted or is later than the latest time counted; a file rewritten in place to a larger size could have old lines counted again.
- ASSUMPTION: no CI workflow is added — chose this because none was asked for; the README no longer claims one.
- ASSUMPTION: nothing is pushed for ClaudeWatch without Angelo's word; the framework repo follows its own standing merge rule.

## Deviations

Fixed in session, outside the phase file lists:

- `src/main/{store,process-monitor,session-tracker,ipc-handlers,index,window-bounds,settings-shape}.ts`, `src/shared/{range,settings-ranges}.ts`, `src/renderer/components/Settings.tsx`, `src/renderer/components/settings/{controls,NotificationSettings}.tsx` (c6c5ce5, eb95d99): four older settings defects a review surfaced — the CPU threshold never reached the process monitor, a changed polling interval and history size waited for a restart, a chosen 1.0 threshold was rewritten to 3.0 on every read, and the weekly-target field saved every keystroke.
- `src/main/auto-updater.ts`, `src/renderer/hooks/useUpdater.ts`, `src/renderer/lib/types.ts` (ad11ba2): the updater payload is a union keyed by status, so the hook no longer casts it.
- `src/main/orca-cli.ts` and its tests (35511af): the signature gate verifies nested code, re-checks after ten minutes and raises the verified path.
- `src/renderer/office/themes/violet-court/{frame-parts,roster}.ts` (67f02c5): the crimson frame lost its single oversized clawed arm, which the themes study lists as a design to stay clear of.
- `src/main/office-interactions.ts`, `src/main/office-setup.ts`, `src/preload/office.ts`, `src/renderer/office-live/live-feed.ts`, `src/renderer/office/{scene-model,web-bridge,use-office-effects}.ts`, `src/renderer/office/fixture/fixture-feed.ts` (94e3a14, d874a89): talk and peek resolve a teammate's own terminal; the older `jump` call is removed everywhere now that `focus` replaces it.
- `src/shared/office/feed-message.ts`, `src/main/bridge-host.ts`, `electron-builder.yml` (6494a4b): one feed-message check for both hosts; the web bundle stays out of the packaged app.
- `src/renderer/deck/roster.ts` (fa02c77): unique crests per roster.
- `src/renderer/office/scene/NameCards.tsx`, `src/renderer/components/deck/WorkOrderSlip.tsx` (d5d77fb): paper name tag for an agent that needs the owner.
- Review fixes, by both reviews and the independent one (911616e..1f14739, about forty commits): Talk refuses unless the agent's input line is on screen; the Orca signature check is one requirement anchored at Apple and guards the bridge too; a one-time launch code for the web page; a finished teammate keeps its tokens; the dashboard and the Office share one token roll-up; a lost-server and a view-only state on the web page; the ledger counts by file position; `knip.json` for the dead-code scan.
- Cleanup pass (be42ce0..9a5122c): shared helpers under `src/shared/office/` (`agent-key`, `attention`, `token-counts`), one roster builder for the three themes, one trusted IPC handler helper, and the bridge's tick cut from 8 spawned processes to 1.
- Found while recording the demo and fixed (5f190ac, 3baf3d0): the bridge stayed on its 30-second background pace under a visible Office or dashboard, because a window created visible emits no `show` event and Electron does not report every way a window ends up on screen. The pace now looks at a window when it is created and re-checks every five seconds.
- Last-tokens fixes (65a259c): a session that exits between two polls is read to its end, and Codex totals reach the ledger without the display's ten-second hold.
- `src/main/auto-updater.ts` (e497c75): a failed update check is no longer an unhandled rejection.
- `README.md`, `package.json` (cdaccf5): the release section and the Node version.

Files named in full, because the scope check reads paths literally:

- Settings fixes (c6c5ce5): `src/main/process-monitor.ts`, `src/main/process-monitor.test.ts`, `src/main/session-tracker.ts`, `src/main/bugfix-issues.test.ts`.
- Updater fix (e497c75): `src/main/auto-updater.test.ts`.
- Not changed by this batch. These were last changed earlier in the same session by the Office work that is already merged (PR #2, 7fc04cd), and they show as modified here only through permission-bit changes that predate the session and are left for the owner: `.gitignore`, `tsconfig.web.json`, `src/renderer/env.d.ts`, `src/renderer/__tests__/useUpdater.test.ts`, `src/main/platform/darwin.ts`, `src/main/platform/exec.ts`, `src/main/rate-limit-reader.ts`, `src/main/rate-limit-reader.test.ts`, `src/main/sound-player.ts`, `src/main/sound-player.test.ts`, `src/main/widget-stats-writer.ts`, `src/main/widget-stats-writer.test.ts`, `src/main/widget-sync.ts`, `src/main/widget-sync.test.ts`.

## Not in this batch

Windows and Linux builds of the Office; the statusline tee; notarisation credentials. The release itself waits on the Developer ID certificate.
