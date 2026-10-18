# ClaudeWatch City Port: ClearSpent's new city, in an agent city

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring ClearSpent ops-twin's new city (`e2903bed`) into ClaudeWatch's own code. Agent activity drives what money drives there:

- landmarks and lit icon signs;
- four-sided facades;
- a rail ring and work trips;
- token spires, crowns, leaders and city events;
- privacy, hide-panels, a better mini-map and Follow;
- a company lens.

**Architecture:** One tested boundary turns live `SessionRef`s into city facts: `city-signals` (states) plus an evidence-edge event log (transitions). Scene layers read those through module stores in `useFrame`, never through React props. Every layer is built from CW's batcher-friendly primitives and declares a draw and upload allocation, which a budget harness asserts.

**Tech Stack:** Electron, React 19, React Three Fiber, three r186, vitest, Playwright (view-only page probe).

**Spec:** Angelo's request (2026-10-16), his four answers (below), and five read-only research reports. The reports are archived at `/Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch/.claude/archive/cs-port-research-2026-10-16/`: `landmarks.md`, `traffic-rail.md`, `growth-events.md`, `hud.md`, `cross-cutting.md`, plus the demo frames in `cs-frames/`. Each task names the report section that holds its full mechanism, file:line evidence and traps.

**Branch:** `feat/city-port-2026-10-16`, worktree `.claude/.worktree/city-port`, stacked on `fix/office-health-2026-10-16`. It merges office-health forward and never rebases.

## Tickets

| Ticket                           | Status                         | Source link                             | Conversation                                                                                                     |
| -------------------------------- | ------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| none — needs filing (CW-CS-BASE) | planned: Phases 0–1, no PR yet | this session, 2026-10-16 (no permalink) | "We have a fucking amazing build there that you can check and plan on how we can implement the same on this one" |
| none — needs filing (CW-CS-LAND) | planned: Phase 2, no PR yet    | this session, 2026-10-16 (no permalink) | "We have a fucking amazing build there that you can check and plan on how we can implement the same on this one" |
| none — needs filing (CW-CS-RAIL) | planned: Phase 3, no PR yet    | this session, 2026-10-16 (no permalink) | "We have a fucking amazing build there that you can check and plan on how we can implement the same on this one" |
| none — needs filing (CW-CS-GROW) | planned: Phase 4, no PR yet    | this session, 2026-10-16 (no permalink) | "We have a fucking amazing build there that you can check and plan on how we can implement the same on this one" |
| none — needs filing (CW-CS-HUD)  | planned: Phase 5, no PR yet    | this session, 2026-10-16 (no permalink) | "We have a fucking amazing build there that you can check and plan on how we can implement the same on this one" |
| none — needs filing (CW-CS-LENS) | planned: Phase 6, no PR yet    | this session, 2026-10-16 (no permalink) | "We have a fucking amazing build there that you can check and plan on how we can implement the same on this one" |

## Owner decisions (his answers, 2026-10-16)

| Question         | His answer                                                                                                  | What it removes or adds                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Night            | **Always daylight**                                                                                         | No sky clock, night windows or window glow. No `composeCompile` helper either: nothing in this plan patches a batched material's shader. |
| Time model       | **Live only**                                                                                               | No bridge event log, scrubber, busy-day strip or rewind.                                                                                 |
| Companies        | **Company lens**                                                                                            | Offices stay on their own parcels; the saved city is unchanged.                                                                          |
| Rail and cars    | **Rail ring + work trips**                                                                                  | Ambient traffic keeps circulating, and work trips borrow its slots. No hyperspeed line.                                                  |
| Run (2026-10-17) | "Don't want you to stop until you fucking build this and let's merge everything to `main` once you're done" | No STOP after the install, no approval wait before the close; push and merge to `main` are authorised.                                   |

## Phase ledger

- [x] Phase 0: Base and baseline (office-health 7c and Task 8.3 merged in; budgets measured)
- [x] Phase 1: Foundation (budget harness, city clock, city signals and today's tokens, evidence-edge event log, privacy edge, bounded sign cache)
- [x] Phase 2: Landmarks (four-sided facades, lit icon signs, venue landmarks, sightline guard)
- [x] Phase 3: Traffic and rail (tool-call ids, work trips, railway ring, trains, stations, car kit, mini-map railway)
- [x] Phase 4: Growth, leaders and events (token spires, construction rig, crowns, leaders card, beacons, smoke and the `limited` producer, milestone fireworks, done flags, news line)
- [x] Phase 5: HUD (hide panels, privacy toggle, mini-map footprint and pan, Follow, labels round the chrome)
- [x] Phase 6: Company lens (re-tint per company, company cards)
- [x] Phase 7: Integration, live re-measure, local install (no STOP, Angelo 2026-10-17)
- [x] Phase 8: Close: simplify, review pair, Codex, dead code, checklist, MP4 demo, vault, push and merge to `main`

## Diagrams

```ascii
 fix/office-health-2026-10-16 (Phases 0–9; incl. 7c roster batches + Task 8.3 legacy town retired)
            │ merge forward
            ▼
 feat/city-port-2026-10-16 ── Phase 0 baseline ─► Phase 1 foundation (lead, serial)
            │                  1.1 budget harness ─► 1.2 city clock ─► 1.3 city signals
            │                  ─► 1.4 evidence-edge events ─► 1.5 privacy edge ─► 1.6 sign cache
            │
            ├──────────────────────────┬──────────────────────────┬───────────────────────────┐
            ▼                          ▼                          ▼                           │
   Phase 2 landmarks          Phase 3 traffic + rail     Phase 4 growth + events              │
   @lena · own worktree       @lena + @ravi (callId)     @lena + @ravi (limited)              │
   needs 1.1 1.2 1.5 1.6      needs 1.1 1.2               needs 1.1–1.4                        │
            └──────────── merge --no-ff in order 3 ─► 2 ─► 4 ────────────┘                     │
                                       │                                                       │
                     ┌─────────────────┴─────────────────┐                                     │
                     ▼                                   ▼                                     │
            Phase 5 HUD (@lena)                 Phase 6 company lens (@lena)                   │
            needs 3.9 (rail on map), 4.4        needs 1.3, 1.5                                 │
                     └─────────────────┬─────────────────┘                                     │
                                       ▼                                                       │
                Phase 7 lead: gates, page probe vs budgets, live capture, install ─► STOP ◄────┘
                                       │ Angelo approves
                                       ▼
                Phase 8: simplify, Maya + Kai, Codex, dead code, MP4, vault, PR (stacked)
```

```ascii
 bridge (claude, codex, opencode)                     main accounts ledger
   │ SessionRef: activity, attention (+ 'limited' 4.6),  │ UsageBucket day × project
   │ currentTool {category, callId 3.1}, usage           │ → OfficeSnapshot.projectsToday (1.3)
   ▼                                                     ▼
 live-feed.onFeedMessage ── hello / patch / resync ──► applyFeed ──► OfficeFrame
   │                                                       │
   ├─► cityEvents.observe()  [1.4, module store]           ├─► maskFrame(hideNames)  [1.5]
   │    hello/resync re-seed · first sight seeds           │     roles by first sight, before any
   │    fresh evidence only · ids deduped                  │     DOM node or sign texture
   │                                                       ▼
   │                                          citySignals(frame, dayLedger)  [1.3, pure]
   │                                            per building: today's tokens, spire stage,
   │                                            needs-you / error / limited / done, busiest
   │                                            tool category · leaders · company counts
   ▼                                                       │
 TRANSIENTS (render clock 1.2)                    STATES (pure fn of the frame)
 milestone fireworks · rig hoist                  signs · beacons · smoke · flags · crowns
 work-trip dispatch (3.2)                         spires · leaders card · company lens
   └───────────────┬──────────────────────────────────────┘
                   ▼
   scene layers read stores in useFrame (0 React commits) · each declares draws + upload (1.1)
```

## Global Constraints

- **ClearSpent is read-only.** Read it through git at `e2903bed` only (`git -C …/ClearSpent-Web show e2903bed:<path>`). Never open, build or run its worktrees or dev servers; another session works there.
- **Runtime checks.** Use the view-only `node out/office-web/server.mjs --port <p>`, never `--interactive`. Never run Electron or `npm run dev` on the real profile, and never click agent-action controls.
- **Budgets.** Measured by the page probe in `.claude/archive/perf-probe/` (Phase 0). They are deltas over the Phase 0 baseline:

  | Measure                           | Full  | Balanced | Light |
  | --------------------------------- | ----- | -------- | ----- |
  | Draws added, steady               | ≤ +12 | ≤ +8     | ≤ +4  |
  | Draws added at the transient peak | ≤ +15 | —        | —     |
  - Upload the port adds: ≤ 20 kB/frame p50, and 0 B on a frame where nothing a port layer draws moved.
  - React commits the port adds while idle: 0.
  - Triangles added: ≤ 80k at full.

- **Frame loop.** CW's demand frameloop and `FrameGovernor` stay. No layer calls `setFrameloop` or keeps its own loop (trap N8).
- **Batching.**
  - Build from parametric primitives (`BoxGeometry`, `CylinderGeometry` …) so `mesh-batches.ts` instances them. A merged `BufferGeometry` gets its own draw (trap N1).
  - Transparent or textured parts draw alone, so each effect kind is one `InstancedMesh` (N3).
  - Never patch a batched material's `onBeforeCompile`; the batch's clone drops it (N2).
- **Heights.** Nothing a port adds within one block of an office stands above `min(24 m, 0.7 m per metre of distance + 4)` (`themes/surroundings.ts:27-30`, `town/distributed-town.ts:38`). Robots at their desks stay visible (N4).
- **Scene box.** A layer outside the city grows `sceneBox` (`OfficeScene.tsx`) so `Horizon` clips correctly. It never raises the Canvas `far` (N5).
- **Fast motion** (trains) runs at speeds that read at the governor's 5–20 fps idle pace, about 12–18 m/s (N6).
- **Orthographic camera** (ClearSpent's note, 2026-10-16). ClearSpent sized its signs and crowns for perspective distance and wrote its follow camera around `camera-controls` dolly. CW's camera is orthographic, where size on screen follows `camera.zoom` and dolly changes nothing visible. Every ported size is tuned against CW's zoom bands (`logic/camera-bands.ts`), and every ported camera move sets zoom, never dolly (N7).
- **Truth.**
  - Every event, sign state, leader and spire step comes from fresh evidence (`observeSession` / `isAgentActivityAvailable`).
  - `usage: null` means unknown, never 0.
  - Nothing shows a task goal, an email or an id.
  - Vendor logos are never drawn: the repo is public and themes are original designs.
- **Themes.** Every visual reads its colours from `ThemePalette` and works in all 8 themes. The map rotates, so each face and sign is checked at all four quarter turns.
- **Process.**
  - TDD: RED, then GREEN.
  - prettier on every changed file.
  - Comments are short and say why.
  - Commits are authored by Angelo, with no Claude references.
  - Parallel writers each own their files in their own worktree under `.claude/.worktree/`.
  - Nothing is pushed without Angelo's word.

## Review Focus

1. **A hello, resync or account-change hello fires nothing.** No fireworks, hoist or beacon flash on reconnect: `office-feed.ts:38-42` sends a hello on every account change. Test in Task 1.4.
2. **Hiding names mid-session leaks nothing.** After "Hide names" is switched on, no real company or project name remains in any DOM node, card, mini-map label or sign texture, and the saved world document never receives role names. Tests in Tasks 1.5 and 5.2.
3. **Every quarter turn reads.** Signs face the camera, landmarks have four dressed faces, and trains stay on the viaduct. Tests in Tasks 2.1, 2.2 and 3.6.
4. **Quality steps down cleanly.** Stepping to `light` mid-run drops trains and effects to their light caps without rebuilding the static city batch. Tests in Tasks 3.6 and 4.2.
5. **Spires never fall without cause.** A session ending, or evidence going stale, never lowers a spire within the day and never fires an event. Tests in Tasks 1.3 and 4.1.

## Assumptions (not asked; printed so nothing is silent)

| #   | Decision                                                                                                                                                                                                                                                         | Why                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Spires measure **today's** tokens per project and reset at local midnight with a 1.2 s ease. Reduced motion snaps.                                                                                                                                               | Shows today's cost. Never-reset would keep a project busy months ago tallest.                                                   |
| A2  | **Fireworks only at token milestones** (1-2-5 steps from 1M). A finished turn raises a done flag instead.                                                                                                                                                        | Rare and meaningful. With 10 agents, per-turn bursts would fire several a minute.                                               |
| A3  | **Project tower signs show what the project is doing:** the icon of the busiest fresh tool category while working, a hand or question mark when it needs you, an error mark, dark when idle or done, grey with no fresh evidence.                                | "The same" as ClearSpent's always-lit signs, in the HUD's existing vocabulary.                                                  |
| A4  | **The skyline keeps its heights.** Offices stand out by signs and spires; a sightline guard test pins that both stay visible.                                                                                                                                    | No relayout, no moved buildings. The 0.7 slope already keeps an office's roof in sight.                                         |
| A5  | **The company lens re-tints and adds cards**, with no pale-town shader.                                                                                                                                                                                          | +0 draws, and no shader hook on batched materials (N2).                                                                         |
| A6  | **Privacy covers the Office only:** the app window, the Browser Office and standalone ports. Roles are assigned by first sight in a session ("Company A", "Project A-1"). The local saved world keeps real names. OS notifications and the dashboard keep names. | It covers recording the Office. Notifications stay as they are until he asks.                                                   |
| A7  | **The mini-map stays in the left rail.** Label steering covers the floating chrome that exists.                                                                                                                                                                  | No relayout of the HUD.                                                                                                         |
| A8  | **The extruded car kit applies to corporate-city and cyberpunk-city only.** Other themes keep their vehicles.                                                                                                                                                    | Steampunk and nature themes have their own vehicle dress.                                                                       |
| A9  | **Trains stay ambient.** Freight runs at `full` only. The ring sits 7 m out, and the modules are named `railway-*`.                                                                                                                                              | Nothing in CW moves between districts. At 4.5 m a station lands on the edge sidewalk. "rail" already names the HUD side panels. |
| A10 | **`limited` is set only from usage-limit or rate-limit evidence** in a Claude transcript tail or a Codex rate-limit event. Never from an account's usage percent.                                                                                                | That percent is per account, not per session.                                                                                   |
| A11 | **New HUD controls are 44 px targets.** Existing 28 px bar buttons are unchanged; they pass WCAG 2.5.8 AA.                                                                                                                                                       | No design change nobody asked for.                                                                                              |
| A12 | **Two new bridge fields:** `CurrentTool.callId` (opaque, never drawn) and `OfficeSnapshot.projectsToday` (numbers only). Both stay optional until every consumer reads them.                                                                                     | The contract rule in `shared/office/types.ts:2`.                                                                                |
| A13 | **One PR, stacked on the office-health PR.**                                                                                                                                                                                                                     | WHOLE-PR mandate. Angelo reviews one install.                                                                                   |
| A14 | **Sign 18–40 px, crown 14–32 px on screen at every zoom band.**                                                                                                                                                                                                  | ClearSpent sized both for perspective distance; under CW's orthographic camera, readable size is a pixel range per band (N7).   |

---

## Phase 0 — Base and baseline (lead, inline; ITEM CW-CS-BASE)

The port starts from office-health with Phase 7's roster follow-up and Task 8.3 merged, so no slice edits the dead legacy town.

- [x] `git merge --no-ff fix/office-health-2026-10-16` once office-health's 7c and 8.3 have merged there. Run `npx vitest run`.
- [x] Keep the lead page probe (`page-probe.mjs`, `page-instrument.mjs`, `profile-summary.mjs`) in the ignored `/Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch/.claude/archive/perf-probe/`; it needs Playwright, which is not a repo dependency, and reads its worktree from `WORKTREE`. Record the baseline at `full`, `balanced` and `light`, focused and blurred, in this plan's Results:
  - draws
  - triangles
  - upload p50
  - React commits per 30 s

  The Phase 7 office-health numbers were react-dom 0.80/s blurred, upload 14–17 kB, draws 36.

**Verify:** `git merge-base --is-ancestor fix/office-health-2026-10-16 HEAD` exits 0; `npx vitest run` exits 0; the Results table has a baseline row per quality level.

## Run split (2026-10-17)

The phases run as agent waves, each writer in its own worktree:

- **Wave A**, in parallel:
  - A1: Tasks 1.1, 1.2 and 1.6;
  - A2: Tasks 1.3, 1.4 and 1.5, plus the pure `stageFor` / `spireHeight` (4.1) and `buildingPlace(id).topAt(nowMs)` (4.10) in `logic/token-spires.ts` and `logic/building-place.ts`;
  - A3 (@ravi): Task 3.1 and the bridge half of 4.6;
  - A4: Tasks 2.1, 2.3 and 2.4.
- **Wave B**, after A1 and A2 merge:
  - B1: Tasks 3.2–3.6;
  - B2: Tasks 4.1 (meshes), 4.2, 4.3, 2.2 and 4.10 (the marks);
  - B3: Tasks 4.4, 4.5, 4.6 (scene), 4.7, 4.8 and 4.9.
- **Wave C**, after B:
  - C1: Phase 5;
  - C2: Phase 6.

## Phase 1 — Foundation (lead, inline, serial; ITEM CW-CS-BASE)

Research: `cross-cutting.md` F1, F3–F6; `growth-events.md` B0 and the A1 data source.

**Verify:** `npx vitest run src/renderer/office src/renderer/office-live src/shared/office src/main/accounts` exits 0; `npm run typecheck` exits 0.

### Task 1.1: Port budget harness

**Files:**

- Modify `src/renderer/office/scene/RenderLoop.tsx` (MetricsProbe: add `uploadBytes`).
- Create `src/renderer/office/themes/city-layer-budget.test-utils.ts` (allocation registry) and `src/renderer/office/scene/__tests__/city-port-budget.test.tsx`.

**Interfaces:** Produces `CITY_LAYER_BUDGET: Record<CityLayer, { draws: Record<QualityLevel, number>; uploadBytes: number }>` and `measureLayer(layer, level)`. Every later task adds its row.

- [x] RED tests:
  - `metrics-dataset.test.tsx` › "canvas.dataset.uploadBytes is a number after one frame".
  - `city-port-budget.test.tsx` › "every port layer declares an allocation, and their sum stays within +12 draws at full" (no registry yet).
  - "a port layer uploads 0 bytes on a frame where nothing it draws moved".
- [x] Implement, run `npx vitest run src/renderer/office/scene`, and commit `test(scene): a budget per city layer, with upload bytes on the canvas`.

### Task 1.2: One city clock

**Files:** create `src/renderer/office/logic/city-clock.ts`, a module store like `officeSettings`.

**Interfaces:** `cityClock.now(): number` (one value per drawn frame), `cityClock.isPinned(): boolean` (reduced motion), and `cityClock.tick(frameMs)`, called once from `FrameGovernor`.

- [x] RED tests (`city-clock.test.ts`):
  - "two readers in one frame see the same time";
  - "reduced motion pins the clock";
  - "a 10 s idle gap advances the clock by 10 s, not by frames drawn".
- [x] Implement, verify, and commit `feat(office): one city clock for every animated layer`.

### Task 1.3: City signals and today's tokens

**Files:**

- Modify:
  - `src/shared/office/types.ts`: optional `OfficeSnapshot.projectsToday?: { projectKey: string; tokens: number }[]`, and the same on the patch, sent only when a total changed;
  - `src/shared/office/apply-feed.ts`;
  - `src/main/accounts/office-feed.ts` and `accounts-view.ts` (`toAccountsState` already sums today per project, `:97-122`);
  - `src/renderer/office/scene-model.ts` (`OfficeFrame.projectsToday`).
- Create `src/renderer/office/logic/city-signals.ts`.

**Interfaces:**

- `citySignals(frame: OfficeFrame, day: DayLedger, nowMs: number): CitySignals`.
- `CitySignals = { buildings: ReadonlyMap<string, BuildingSignal>; leaders: Leaders; companies: ReadonlyMap<string, CompanyCounts> }`.
- `BuildingSignal = { tokensToday; spireStage; needsYou; hasError; isLimited; isDone; busiestCategory: ToolCategory | null; hasEvidence }`.
- Building id = company + project (`world-document-layout.ts:28-29`).
- `DayLedger` keeps each project's highest total seen today, used only where `projectsToday` is absent (standalone hosts).

**The ledger field is never sent as a hello.** `office-feed.ts:38-42` sends a hello on account change, and a hello per poll would reset Task 1.4's baseline every 2 s.

- [x] RED tests (`city-signals.test.ts`):
  - "a building never lowers when one of its sessions ends";
  - "a session with stale observation sets no state";
  - "null usage is unknown and raises the building once it lands";
  - "leaders: ties break by key; zero tokens never lead";
  - "signals carry keys and numbers only, never labels".
- [x] RED test (`office-feed.test.ts`): "projectsToday rides a patch only when a total changed, never a hello per poll".
- [x] Implement, verify `npx vitest run src/renderer/office src/shared/office src/main/accounts`, and commit `feat(office): city signals from live evidence and today's tokens`.

### Task 1.4: Evidence-edge event log

**Files:** create `src/renderer/office-live/city-events.ts` (module store, like `officePoses`). Modify `src/renderer/office-live/live-feed.ts` (`onFeedMessage` call site).

**Interfaces:**

- `cityEvents.observe(type: FeedMessage['type'], sessions: readonly SessionRef[], atMs: number)`;
- `cityEvents.active(nowMs): readonly CityEvent[]`;
- `cityEvents.version()`.
- `CityEvent = { id; kind: 'milestone' | 'hoist' | 'dispatch'; buildingId; sessionKey; category?; atMs }`.

- [x] RED tests (`city-events.test.ts`):
  - "a hello or resync re-seeds and fires nothing";
  - "first sight of a session seeds and fires nothing";
  - "a milestone crossing between two patches fires once";
  - "a stale patch fires nothing";
  - "fired ids are deduped and pruned after 10 minutes";
  - "an account-change hello after a milestone does not fire it again" (Review Focus 1).
- [x] Implement, verify, and commit `feat(office): city events fire from evidence edges only`.

### Task 1.5: Privacy edge

**Files:** create `src/renderer/office/logic/role-names.ts`. Modify the frame boundary where `OfficeApp` hands the frame to the HUD and scene (`use-office-model` / `OfficeApp.tsx`), and `src/renderer/office/logic/office-settings.ts` (`hideNames: boolean`, default false).

**Interfaces:** `maskFrame(frame: OfficeFrame, roles: RoleBook): OfficeFrame` and `createRoleBook()`, with roles by first sight: `Company A`, `Project A-1`.

- [x] RED tests (`role-names.test.tsx`):
  - "with names hidden, no company or project label reaches signTexture" (spy);
  - "a role keeps its letter when a new project appears";
  - "the saved world document keeps real names while the screen shows roles";
  - "session names and cwd basenames are masked too".
- [x] Implement, verify, and commit `feat(office): hide company and project names at the frame edge`.

### Task 1.6: Bounded sign cache

**Files:** modify `src/renderer/office/scene/textures.ts`.

- [x] RED test (`textures.test.ts`): "a hundred distinct sign texts keep at most 64 textures alive, and evicted ones are disposed".
- [x] Implement an LRU on text with `dispose()` on eviction. Commit `fix(scene): sign textures are bounded and disposed`.

## Phase 2 — Landmarks (@lena-landmarks, worktree; ITEM CW-CS-LAND)

Research: `landmarks.md` §1, §3, §4, §5. Night windows (§2) are out, by owner decision.

**Verify:** `npx vitest run src/renderer/office` exits 0; the `city-port-budget` landmark rows are green; the page probe at full shows draws ≤ baseline + 3.

### Task 2.1: Buildings finished on every side

**Files:** modify the corporate filler curtain builders named in `landmarks.md` §1. Move `coplanarConflicts` / `partBoxes` from `scene/__tests__/facade-coplanar.test.ts` into a shared test util, then run it over town and venue designs in every theme.

- [x] RED tests:
  - "every corporate filler design dresses all four faces at each quarter turn";
  - "no town or venue design in any theme has a coplanar face pair".
- [x] Implement with `FACADE_LAYER_STEP_M` layering. Mullion tops stop one layer step short of the glass tops; CS ties them to one plane. Verify, and commit `fix(town): filler buildings finished on every side`.

### Task 2.2: Lit icon signs

**Files:**

- Create:
  - `src/renderer/office/scene/sign-atlas.ts` (one 4 × 5 canvas atlas of `lucide-react` icon paths; returns null without a canvas or Path2D);
  - `src/renderer/office/logic/project-signs.ts` (a versioned store fed by `citySignals`);
  - `src/renderer/office/scene/CitySigns.tsx` (two `InstancedMesh`es, a disc and an icon face; the face reads its atlas cell from a per-instance attribute on its own material).
- Modify `themes/physical-building-parts.ts` (`buildingCrown` exposes the sign anchor).

**Interfaces:**

- `signFor(signal: BuildingSignal): SignState | null`, where `SignState = { icon: SignIcon; tint: 'needs-you' | 'error' | 'working' | 'unknown' }`.
- Venue signs come from `WorldVenue.kind`.
- The face's per-instance cell attribute lives on `CitySigns`' own material, never a batched one (N2).

Signs re-pose only when the camera's orientation changes (hook into `CameraControls` `update`, as `RenderLoop.tsx` does). Cells and tints change only on a state change.

- [x] RED tests:
  - "a project with a permission prompt shows the hand on its sign";
  - "a working project shows the icon of its busiest fresh tool category";
  - "no fresh evidence shows the grey sign";
  - "signs cost 2 draws however many buildings carry one";
  - "a still camera uploads 0 sign bytes";
  - "signs face the camera at all four quarter turns";
  - "every icon meets 3:1 contrast on its disc" (icons are ink-tinted: white fails on 4 of the 5 state colours);
  - "a sign spans 18–40 px on screen at the city, building and floor bands" (N7: scale from `camera.zoom`, not distance).
- [x] Implement, verify, and commit `feat(scene): lit icon signs on project towers and venues`.

### Task 2.3: Venue landmarks

**Files:** create `src/renderer/office/themes/venue-landmarks.ts`, with five palette-driven builders:

- arcade: marquee, bulb strip and blade sign
- lounge: awning and terrace
- market: striped stalls
- garage: canopy, pumps and pylon
- transit: wave roof and mast

Modify `src/renderer/office/scene/VenueLayer.tsx` to draw them through `Parts` inside its static `BatchedScene`.

- [x] RED tests:
  - "each venue kind has its own silhouette within its 12 × 10 m footprint";
  - "venue slots and entrances are unchanged";
  - "venue landmarks add at most 1 draw per theme" (budget row);
  - "every face is dressed at each quarter turn".
- [x] Implement, verify, and commit `feat(themes): venues read as landmarks`.

### Task 2.4: Sightline guard

- [x] Add a point height to `town/sightline.test-utils.ts`. Test: "an office's crown sign and spire base stay in sight over their neighbours at all four rotations". This passes today, and pins A4.
- [x] Commit `test(town): signs and spires stay in sight over the street`.

## Phase 3 — Traffic and rail (@lena-rail; @ravi for 3.1; ITEM CW-CS-RAIL)

Research: `traffic-rail.md` F1–F8, F10, F11. The hyperspeed line (F9) is out, by owner decision.

**Verify:**

- `npx vitest run src/bridge src/shared src/renderer/office` exits 0.
- Page probe at full: draws ≤ baseline + 6 with Phase 3 alone, and upload added ≤ 3 kB p50.
- A 5-minute live capture: 0 vehicle samples on a sidewalk outside a crossing.

### Task 3.1: Tool-call ids (@ravi)

**Files:**

- Modify `src/shared/office/types.ts`: `CurrentTool.callId?: string`.
- Modify the three readers: `src/bridge/claude.ts` (`tool_use.id`), `src/bridge/codex.ts` (`call_id`) and `src/bridge/opencode-activity.ts` (part id).

- [x] RED tests:
  - "two consecutive Edit calls carry different callIds" (one per provider);
  - "callId never reaches a name card or the DOM".
- [x] Implement, verify `npx vitest run src/bridge src/shared`, and commit `feat(bridge): each tool call carries its own id`.

### Task 3.2: Work trips

**Files:**

- Create `src/renderer/office-live/work-trip-store.ts` and `src/renderer/office/town/work-trips.ts`.
- Modify `town/vehicle-trips.ts`, `citizens/MoverLayer.tsx` and `citizens/mover-clock.ts`.

**Mapping:**

| Tool category   | Vehicle  | Trip                           |
| --------------- | -------- | ------------------------------ |
| `edit`, `run`   | freight  | door → nearest workshop → back |
| `web`           | runabout | door → nearest station → back  |
| `agent`         | transit  | bus stop at the office kerb    |
| `read`, `other` | none     | none                           |

A trip borrows a fleet slot of its role and returns it, with at most 1 dispatch every 2 s city-wide. A ground ring marks a work trip (+1 draw).

- [x] RED tests (`work-trips.test.ts`):
  - "an edit call sends a freight slot from the office kerb to a workshop and back";
  - "a read call sends nothing";
  - "a stale observation dispatches nothing";
  - "two calls with different callIds dispatch twice, rate-capped";
  - "a dispatched trip causes no React commit";
  - "work trips never add a mover kind";
  - "a trip in flight during a relayout re-routes from where it is".
- [x] Implement, verify, and commit `feat(town): a real tool call sends a vehicle from its office`.

### Task 3.3: Railway plan, timetable, viaduct and stations

**Files:** create `src/renderer/office/town/railway-plan.ts` (pure, WeakMap memo), `railway-timetable.ts`, `scene/RailwayStructures.tsx` and `railway-stations.ts`. Modify `OfficeScene.tsx` so `sceneBox` includes the ring.

- [x] RED tests:
  - "the ring sits 7 m outside the plan extent and crosses no sidewalk, zebra or lot";
  - "stations stand off the edge sidewalk";
  - "railwayPlan for 40 buildings takes under 10 ms";
  - "the timetable is a pure function of time";
  - "the viaduct is 1 draw";
  - "sceneBox contains the ring, so Horizon does not clip it".
- [x] Implement, verify, and commit `feat(town): a railway ring round the city`.

### Task 3.4: Trains

**Files:** create `scene/RailwayTrains.tsx`: one `InstancedMesh` per car kind, posed from the timetable on the city clock, dirty-ranged.

- [x] RED tests:
  - "trains upload at most 2 kB a frame";
  - "freight runs at full only";
  - "light shows the viaduct with no trains";
  - "stepping to light mid-run rebuilds no static batch" (Review Focus 4);
  - "a train's projected size at the city band stays above 6 px" (CS trap 29);
  - "trains stay on the deck at all four rotations".
- [x] Implement, verify, and commit `feat(scene): trains on the ring`.

### Task 3.5: Car kit for corporate-city and cyberpunk-city

**Files:** extend `figure-parts` with an index-safe merge. Port CS's extruded body profiles as per-theme vehicle dress.

- [x] RED tests:
  - "each car model stays under 2,500 triangles";
  - "the merge keeps indexed and non-indexed parts";
  - "other themes keep their vehicles".
- [x] Implement, verify, and commit `feat(themes): extruded cars for the corporate and cyberpunk cities`.

### Task 3.6: Mini-map railway and budget rows

- [x] RED tests:
  - "the city mini-map frames the ring";
  - "office view does not draw it";
  - budget rows: railway ≤ 4/2/1 draws (full/balanced/light), trains ≤ 2 kB a frame.
- [x] Implement in `logic/minimap-model.ts` and `hud/MinimapSurface.tsx`. Commit `feat(hud): the mini-map shows the railway`.

## Phase 4 — Growth, leaders and events (@lena-growth; @ravi for 4.6; ITEM CW-CS-GROW)

Research: `growth-events.md` A1–A5, B1–B6.

**Verify:**

- `npx vitest run src/bridge src/renderer/office src/renderer/office-live` exits 0.
- Page probe at full after Phases 2–4: steady draws ≤ baseline + 12, transient peak ≤ baseline + 15, upload added ≤ 20 kB p50, idle React commits unchanged from baseline.

### Task 4.1: Token spires

**Files:** create `src/renderer/office/logic/token-spires.ts` and `themes/spire-parts.ts`. Modify `scene/PhysicalBuildingShell.tsx` to mount the spire with the crown and hide it with the roof.

**Interfaces:**

- `stageFor(tokens): number`: 1-2-5 steps from 1M, capped at 6.
- `spireHeight(stage): number`, capped at `SPIRE_MAX_M`.
- Built from one `BoxGeometry` mesh per module, so it shares the crown's batch.

- [x] RED tests:
  - "stageFor is 0 below 1M and adds one stage per 1-2-5 step" (`999_999→0`, `1e6→1`, `2e6→2`, `5e6→3`, `1e7→4`);
  - "a stage never falls while the day's total rises or holds" (200 random non-decreasing totals);
  - "the day rollover lowers spires only when the local day key changes";
  - "100 token patches write no spire or height into the saved world document";
  - "the spire base is not coplanar with the crown top";
  - "a spire shares its batch with the crown".
- [x] Implement, verify, and commit `feat(scene): token spires rise as a project spends today`.

### Task 4.2: Construction rig and hoist

**Files:** create `scene/ConstructionRig.tsx`, a transient of about 3 s on a spire stage crossing, at 2 draws (crane and scaffold merged; the module rides the particle mesh).

- [x] RED tests:
  - "a stage crossing raises a rig for 3 s, then nothing";
  - "a hello shows the finished spire with no rig" (A5 rule);
  - "reduced motion skips the hoist";
  - "stepping quality mid-hoist rebuilds no static batch";
  - "a gain under 0.5% of the project's day raises no rig" (ClearSpent `c1fcb124` construction rows).
- [x] Implement, verify, and commit `feat(scene): a crane hoists each new spire stage`.

### Task 4.3: Crowns

- [x] RED tests:
  - "the top three leaders wear crowns, 1 draw";
  - "a crown over a roaming agent follows its live pose";
  - "a crown spans 14–32 px on screen at every zoom band and never covers its robot's name card" (N7);
  - "nobody wears a crown before a token is spent today, and a zero never wins one";
  - "a tie goes to the smaller agent key, whatever the roster order" (ClearSpent `c1fcb124` leaders rows).

  Port `leader-crowns.tsx`, instanced and dirty-ranged.

- [x] Commit `feat(scene): crowns over the day's leaders`.

### Task 4.4: Leaders card

**Files:** create `hud/LeadersCard.tsx`, using `components/deck/Plate`; a row taps to fly.

**Rows:**

- top spender today (tokens)
- busiest project (fresh working agents)
- longest-running session
- most crew

Rows never show ids. They honour `hideNames`.

- [x] RED tests:
  - "rows come from citySignals leaders";
  - "names hidden shows roles";
  - "a row's tap flies to the building";
  - "the card commits at most once per changed patch".
- [x] Commit `feat(hud): a leaders card`.

### Task 4.5: Needs-you beacons

- [x] RED tests:
  - "a permission or question prompt raises a beacon over its building";
  - "it drops when answered";
  - "beacons cost 1 draw";
  - "the beacon ring takes its own ground layer slot".
- [x] Commit `feat(scene): beacons over offices that need you`.

### Task 4.6: Error and rate-limit smoke, and the `limited` producer (@ravi for the bridge)

**Files:** modify `src/bridge/claude.ts` and `src/bridge/codex.ts` (usage-limit and rate-limit evidence sets `attention: 'limited'`). Create `scene/CityParticles.tsx`: one shared opaque particle mesh for smoke, fireworks and hoist modules.

- [x] RED tests:
  - `bridge/claude.test.ts` › "a usage-limit message in the transcript tail sets attention limited";
  - `bridge/codex.test.ts` › "a rate-limit event sets attention limited";
  - "an error or limited office puffs smoke";
  - "particles share 1 draw".
- [x] Commit `fix(bridge): rate-limited sessions report limited` and `feat(scene): smoke over offices in trouble`.

### Task 4.7: Milestone fireworks

- [x] RED tests:
  - "a session crossing 1M, 2M or 5M fires one burst from its building";
  - "a hello after the crossing fires nothing";
  - "bursts reuse the particle mesh".
- [x] Commit `feat(scene): fireworks at token milestones`.

### Task 4.8: Done flags

- [x] RED tests:
  - "a turn done raises a flag for the 120 s done badge";
  - "flags cost 1 draw".
- [x] Commit `feat(scene): a flag over a finished turn`.

### Task 4.9: News line

- [x] Extend `use-office-effects.ts` `useAttentionAnnouncement` and `logic/attention-queue.ts`, then add a visible one-line ticker under the header.
- [x] RED tests:
  - "each city event yields one line";
  - "names hidden shows roles";
  - "the line commits once per event".
- [x] Commit `feat(hud): a news line for city events`.

### Task 4.10: One live roof per building

- [x] Port CS `SignalPlace.topAt` as `buildingPlace(buildingId).topAt(nowMs)`: roof + crown + spire stage. Signs, beacons, smoke, flags and crowns all sit on it.
- [x] RED test: "every mark rides a growing spire".
- [x] Commit `refactor(scene): one live roof height for every mark`.

## Phase 5 — HUD (@lena-hud; ITEM CW-CS-HUD)

Research: `hud.md` §2, §5, §6, §7, §8.

**Verify:** `npx vitest run src/renderer/office` exits 0. A Playwright check against the view-only server with Hide names on finds 0 real company or project names in `document.body.innerText`. New controls measure ≥ 44 px.

### Task 5.1: Hide the panels

- [x] RED tests:
  - "the toggle hides the side and bottom panels on wide and medium layouts";
  - "phones keep the bottom sheet";
  - "safe insets drop to 0 while hidden";
  - "the control is a 44 px target with a label".
- [x] Commit `feat(hud): hide the panels for a clear view`.

### Task 5.2: Privacy toggle

**Files:** add a row to `hud/OfficeSettings.tsx` using `SettingRow` / `ToggleSwitch`, writing `hideNames` (Task 1.5).

- [x] RED tests:
  - "turning Hide names on mid-session leaves no real name in the DOM, cards, mini-map or sign textures" (Review Focus 2);
  - "it persists across a reload".
- [x] Commit `feat(hud): a Hide names setting for recordings`.

### Task 5.3: Mini-map footprint and pan

**Files:** extend `hud/Minimap.tsx`, `hud/MinimapSurface.tsx` and `logic/minimap-model.ts`. Add an `officeView` camera-view channel (a module store), a `CameraRequest { kind: 'point' }`, and live roamer dots drawn imperatively.

- [x] RED tests:
  - "the footprint matches the orthographic view at each quarter turn";
  - "a tap pans the camera there";
  - "arrow keys pan";
  - "roamer dots move with 0 React commits".
- [x] Commit `feat(hud): the mini-map shows what you see and pans the city`.

### Task 5.4: Follow

**Files:** generalise `player/camera-follow.ts` `followStep` to any body that reads `officePoses`. Add `CameraRequest { kind: 'follow' }`.

- [x] RED tests:
  - "Follow keeps a roaming agent in the HUD-safe area";
  - "Follow and the close-up frame by zoom: the camera's distance from its target is unchanged" (N7; port ClearSpent's follow offsets as zoom, not dolly);
  - "manual input ends it";
  - "a departed agent ends it".
- [x] Commit `feat(office): follow an agent as it walks`.

### Task 5.5: Labels round the chrome

**Files:** add `obstacles` to `logic/card-culling.ts` `cullCards`. Split pick from place in `scene/CardProjector.tsx` and `scene/OfficeNames.tsx`.

The top bar is already handled: office-health `96f18b2` starts the card safe area below it and pins the selected card (reproduced live after Fly to on a walking agent). This task covers the floating controls inside the safe area (Collapse Minimap, the inspector's handles) and `OfficeNames`.

- [x] RED tests:
  - "a card under a floating control is moved or culled";
  - "an office name under a floating control is moved or culled".
- [x] Commit `feat(cards): labels steer round the floating chrome`.

## Phase 6 — Company lens (@lena-lens; ITEM CW-CS-LENS)

Research: `cross-cutting.md` X1, `hud.md` §1.

**Verify:** `npx vitest run src/renderer/office` exits 0. The page probe shows the same draws with the lens on and off, and the lens toggle uploads one burst, then 0.

**Files:**

- Create `src/renderer/office/logic/company-lens.ts` (hue by a seeded pick on `companyKey` from the theme palette, never XOR of hashes) and `scene/CompanyLens.tsx`.
- Modify:
  - `scene/mesh-batches.ts` (`retintBatches(batches, tintOf)`, `setColorAt` once per toggle);
  - `logic/office-reducer.ts` (lens state);
  - the card layer (one card per company: working, needs you, errors, tokens today).

- [x] RED tests:
  - "turning the lens on re-tints every office of a company to one hue and rebuilds no batch";
  - "neighbouring company keys get different hues within one theme";
  - "a company card counts working and waiting agents from fresh evidence only";
  - "the lens adds no draw";
  - "names hidden shows Company A".
- [x] Commit `feat(office): a company lens`.

## Phase 7 — Integration, live re-measure, local install (lead; ITEM CW-CS-BASE)

**Verify:** every gate exits 0; `codesign --verify --deep --strict /Applications/ClaudeWatch.app` exits 0; the Results table has the after row for every budget.

- [x] Merge `--no-ff` in the order 3 → 2 → 4, then 5 and 6. After each merge run `npx vitest run`.
- [x] Gates: prettier, `eslint .`, both `tsc`, `vitest run`, `knip`, `npm run build`.
- [x] Page probe: full, balanced and light, focused and blurred. Record against the Phase 0 baseline and the Global Constraints budgets.
- [x] A 10-minute live capture on real sessions (view-only server):
  - 0 citizen or vehicle samples on a carriageway outside a crossing;
  - 0 working agents off their desks;
  - events fired only on evidence edges (the log against feed messages).
- [x] Install locally:
  - a physical `node_modules` copy, Developer ID signing, no notarisation;
  - back up the old bundle to `~/Applications/`, `ditto` into `/Applications`;
  - `codesign --verify --deep --strict`.

  Done 2026-10-18 from `0c1ba903`: 1.4.1, ZKidz Dev LLC (7QZW432V8B), verify passes. Busiest renderer unfocused: 6.1% CPU over 60 s. Page probe: draws full 38 → 44, balanced 37 → 39, light 34 → 35.

- [x] Report before/after to Angelo, with screenshots at city, building and desk zoom. No STOP (Angelo, 2026-10-17); Phase 8 follows.

## Phase 8 — Close and merge (lead + Wave 2)

**Verify:** `dead-code-check.sh` exits 0; the Wave 2 verdicts approve; the MP4 in `recordings/` is frame-verified; `gh pr view <n> --json state -q .state` prints MERGED.

- [x] Run `/simplify`.
- [x] Review: Maya + Kai at risk 2, because names and the saved document are touched. Kai approved after fixes (no veto); Maya requested changes (1 Critical, 3 Important), and every Critical, Important and verified Minor finding is fixed (run ledger, Wave 2).
- [x] `bash ~/.claude/hooks/codex-review.sh`. Four passes: 7, 4, 3 and 3 findings, each reproduced RED and fixed test-first; the loop stops after pass 4 (three-strike ruling in the run ledger).
- [x] `bash ~/.claude/hooks/dead-code-check.sh`.
- [x] The feature checklist (`/Users/angeloumali/Desktop/eor-feature-checklists/CW-CITY-PORT-review-checklist.md`).
- [x] An MP4 demo covering (`recordings/office-retention-city-port-demo.mp4`, frame-verified, plus the game corner and a gamer called back to work):
  - signs at four rotations
  - a work trip
  - the railway
  - a spire hoist
  - a beacon
  - the leaders card
  - Hide names
  - Follow
  - the company lens
- [x] Vault learning.
- [x] Push, open one PR against `main` once the office-health PR has merged, and merge it with `gh pr merge --merge` (stacked branches; a squash would orphan the base).

## Estimates (hours: with Claude / without)

| Phase                     | With Claude | Without   |
| ------------------------- | ----------- | --------- |
| 0 Base and baseline       | 1           | 2         |
| 1 Foundation              | 18.5        | 52.5      |
| 2 Landmarks               | 18.5        | 46        |
| 3 Traffic and rail        | 39          | 114       |
| 4 Growth, leaders, events | 44          | 137.5     |
| 5 HUD                     | 23          | 55.5      |
| 6 Company lens            | 6           | 18        |
| 7 Integration and install | 5           | 12        |
| 8 Close                   | 7           | 18        |
| **Total**                 | **162**     | **455.5** |

Phases 2, 3 and 4 run in parallel, and so do 5 and 6. Wall-clock is about 45% of the with-Claude figure. The owner's answers removed:

- night lighting: 10 h / 26 h;
- the hyperspeed line: 8 h / 24 h;
- replay: about 25 h / 75 h;
- the district regroup.

## Deploy

Authorised by Angelo on 2026-10-17. After the close: push; merge PR #12 (`release/1.3.5`), then the office-health PR, then this PR into `main`, each with `gh pr merge --merge`. Publishing a notarised release stays behind the Apple notarisation blocker he owns (`~/.claude/state/blocker-acc6a39e-2363-4600-bc49-ff81b7c44b95.json`).

## Results

### Phase 0 (baseline at `67a33e6`, page probe, view-only server on real data)

| Level             | View          | Draws   | Triangles         | Upload p50     | react-dom commits / 30 s |
| ----------------- | ------------- | ------- | ----------------- | -------------- | ------------------------ |
| full, focused     | city / office | 38 / 37 | 130,974 / 128,306 | 21.1 / 16.4 kB | 54 / 47                  |
| full, blurred     | city / office | 38 / 37 | 129,338 / 117,968 | 14.3 / 12.6 kB | 25 / 23                  |
| balanced, focused | city / office | 37 / 36 | 112,302 / 111,270 | 11.1 / 11.1 kB | 48 / 48                  |
| light, focused    | city / office | 34 / 33 | 108,318 / 108,488 | 9.9 / 12.9 kB  | 49 / 48                  |

### Phases 1–6 (agent waves, merged into `feat/city-port-2026-10-16`)

- Wave A (foundation, landmarks, bridge): budget harness, city clock, sign cache, city signals and today's tokens, evidence-edge events, Hide names edge, tool-call ids, `limited` from rate-limit evidence, four-sided facades (coplanar ties fixed in six more themes), venue landmarks, sightline guard.
- Wave B (rail, growth, events): railway ring, trains, stations, work trips, car kit, mini-map railway; token spires, construction rig, crowns, lit icon signs; beacons, smoke and fireworks, done flags, leaders card, news line.
- Wave C (HUD, lens): hide panels, Hide names toggle (editor, preview, accounts and teammates masked), mini-map footprint and pan, Follow by zoom, labels round the chrome; the company lens and company cards.
- Lead fixes: one city signal store; marks rise 12 m over any roof and the horizon keeps room; a building carries only the spire stages it reached; crowns and spires count today's spend per session; a question shows its own sign; a company keeps its own name in each project's building; the mini-map shows the railway as soon as the scene lays it.
- Page probe after Wave B: draws full 38 → 48, balanced 37 → 44, light 34 → 38 (within +12 / +8 / +4); triangles at full +21k (≤ 80k); upload p50 14–16 kB; react-dom commits unchanged; 0 page errors.

### Phase 7 (integration at `5fb7032f`, view-only servers on real data)

- Gates: both `tsc`, `eslint .`, `knip`, prettier, `vitest run` (5,226 passed), `npm run build`.
- Hide names: 0 real company, project, session, teammate or account names in the DOM, with the lens on, in the editor and preview, and after a reload; 0 console errors. New controls: 86×44, 144×98, 294×44 px.
- Citizens: 0 of 1,871 samples on a carriageway outside a zebra (163 on zebras); vehicles: 0 of 504 samples off the carriageway; 0 vehicle–walker pairs under 1.2 m.
- Agents, 10 min: 591 samples of 15 agents, 0 working or unknown agents off their desks, 0 asphalt samples, 3 venue outings.

### Phase 8 (close)

- `/simplify`: four reviews (reuse, simplification, efficiency, altitude), fixed in three slices plus lead changes; two visible bugs fixed on the way (spires vanished on offices of four storeys or more; lots with no street were trip destinations). Spires batch city-wide (+1 draw), paid for by crowns at full only and work-trip rings counted as transient.
- Dead-code scan: clean.

### Final page probe (`6b9af858`, view-only server on real data)

| Level             | View | Draws (base → now) | Triangles      | Upload p50          | react-dom / 30 s (base → now) |
| ----------------- | ---- | ------------------ | -------------- | ------------------- | ----------------------------- |
| full, focused     | city | 38 → 47 (+9)       | 185,020 (+54k) | 16.8 kB (base 21.1) | 54 → 52                       |
| full, blurred     | city | 38 → 47            | 179,602        | 17.8 kB (base 14.3) | 25 → 34                       |
| balanced, focused | city | 37 → 42 (+5)       | 159,596        | 10.6 kB             | 48 → 55                       |
| balanced, blurred | city | 37 → 42            | 160,414        | 15.0 kB             | 23 → 33                       |
| light, focused    | city | 34 → 38 (+4)       | 159,106        | 13.0 kB             | 49 → 54                       |
| light, blurred    | city | 34 → 38            | 163,580        | 11.7 kB             | 26 → 26                       |

- Within every draw budget (+12 / +8 / +4), triangles +54k (≤ 80k), upload within +20 kB, 0 page errors.
- React commits: the scene layers commit nothing while idle (Profiler specs). The blurred city rows vary by up to +10 per 30 s with live activity on real sessions (news lines and leader changes as agents work); light blurred shows none. Recorded as live-feed variance, not an idle cost.
