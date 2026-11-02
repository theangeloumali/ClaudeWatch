# ClaudeWatch Campus map: project rooms in a ring around the Brain

Repo copy on approval: `docs/plans/claudewatch-campus-map-2026-11-02.md` · branch `feat/campus-map-2026-11-02` · worktree `.claude/worktrees/campus-map/` · Tier T3 (score 8) · **Prototype session** (tests, review, /simplify and the video wait for the merge; build and typecheck run every phase)

## Context

On 2026-11-02 Angelo asked for "the same UI for our offices", pointing at a screenshot and the video *I Built an AI Office With 31 Agents* (Bekhruz AI, youtube.com/watch?v=t0hGE-aaAds). The video shows about 8 solid-colour isometric rooms (one per team) on a ring around a glowing "THE BRAIN · 1,842 notes · shared memory" hub. Spoke roads with light trails run from the rooms to the hub, and small figures walk them. Each room has a card with an icon chip, the name, "3 agents · 2 running" and a stack of faces. The screen also has a toast stack top right, a minimap with − / + / fit, a "Runs on Opus · Sonnet · Haiku" strip and a dark starry background.

`main` was already current at `4d295b2a` (1.4.1); there was nothing to pull.

His answers (one question round, 2026-11-02):

| Question | Answer |
|---|---|
| How it lands | **New Campus map next to City and Office**, which stay as they are |
| What the Brain shows | **Claude memory notes**: a read-only count that pulses on change |
| What walks the roads | **Couriers for real tool calls**; agents stay seated (2026-10-17 rule holds) |
| Verify mode | **Prototype** |

We build our own geometry in our own engine and take no assets from the video. It is a UI reference, not a game recreation.

## What exists and gets reused (evidence)

- **One layout drives everything.** The sim never reads viewMode. `resolveEffectiveWorld` (`src/office/sim/effective-world.ts:43-83`) → `createWorldDocument` → `arrangeWorldDocument(doc,'streets')` (`src/shared/office/world-document-placement.ts:7-50`). Desks, seats, grids, the game corner, the minimap and the town all follow `WorldBuilding.footprint.x/z`. A ring is one more arrangement mode next to `'central'` (`world-document-packing.ts:62-77`). Buildings default to `floors: 1` (`world-document-layout.ts:159`).
- **Town layers** are gated by `settings.town` (`OfficeScene.tsx:206-342`). **Background** is `<color attach="background">`, with **ground** from `Horizon` and lights inline at `OfficeScene.tsx:252-264`. The cyberpunk special case shows the seam.
- **Themes** register through `registerTheme` (`themes/registry.ts:13-25`) and supply kit parts that `FloorView.tsx:51-142` draws. Everything is batched `PartSpec` (`scene/mesh-batches.ts:104-207`). Per-key hues already exist for Company Lens (`logic/company-lens.ts:68-96`).
- **Project counts card**: `logic/name-cards.ts:147-193` already gives "N agents · x Working · y Needs you"; it is hidden in City (`OfficeScene.tsx:166`). `CardProjector` places DOM cards from the render loop. `crestFor` gives project crests (`renderer/deck/roster.ts:77`).
- **Tool-call events**: `city-events.ts:98-121` fires `dispatch` per new `currentTool.callId`. `work-trip-store.ts:13-41` rate-limits to 1 per 2 s. Both are independent of roads; only `work-trips.ts` and `work-fleet.ts` need the road net.
- **Feed fields**: `projectsToday` is the template for an optional snapshot field: `types.ts:134-160` → producer in main → `office-feed.ts` diff → `apply-feed.ts:14-15` → `live-feed.ts` → `OfficeFrame` (`scene-model.ts:110`).
- **Model**: `SessionRef.selectedModel` is filled for OpenCode only (`bridge/opencode.ts:81-114`). Claude transcripts carry `message.model`, but `transcript-tail.ts` does not read it yet.
- **Minimap**: `logic/minimap-model.ts` draws floors from layout bounds, so ring rooms show automatically. It has no hub and no zoom buttons. The **toasts** source is `logic/attention-queue.ts:55-90` (today shown as one NewsLine).
- **Budget**: on-demand frameloop with quality tiers; ambient layers never request frames (`themes/types.ts:151`). Ceiling: 300 draws and 600k triangles at 20 agents (`themes/live-budget.test-utils.ts:29-30`).

## Design

```ascii
                         ┌───────────── Campus map (new) ─────────────┐
   feed (2 s / 30 s)     │                                            │
 ┌───────────────┐       │   ┌──────┐    ┌──────┐    ┌──────┐         │
 │ bridge        │       │   │proj A│    │proj B│    │proj C│ coloured│
 │ + Claude model│──┐    │   └──┬───┘    └──┬───┘    └──┬───┘ rooms   │
 └───────────────┘  │    │      ╲  courier ·│·        ╱             │
 ┌───────────────┐  ├──► │       ╲   ◦────► │        ╱  spoke roads  │
 │ main: memory  │  │    │        ╲  ╭──────┴─────╮  ╱               │
 │ notes reader  │──┘    │         ──┤  THE BRAIN ├──                 │
 │ (counts only) │       │           │ 612 notes  │  pulse on change  │
 └───────────────┘       │           ╰──────┬─────╯                   │
                         │      ╱           │           ╲            │
                         │  ┌──┴───┐    ┌───┴──┐    ┌───┴──┐          │
                         │  │proj D│    │proj E│    │proj F│          │
                         │  └──────┘    └──────┘    └──────┘          │
                         │  HUD: room cards (chip · counts · faces),  │
                         │  toasts ▸ top right, minimap − + ⤢,        │
                         │  "Runs on" chips ▸ bottom left             │
                         └────────────────────────────────────────────┘
   City / Office views unchanged · agents never leave their room
```

### Decisions (ASSUMPTION lines, my calls)

- ASSUMPTION: **Campus is a world layout, not a viewMode.** A persisted `worldLayout: 'city' | 'campus'` picks the arrangement, because the sim runs one layout for every view. The bottom bar becomes **City · Campus · Office**, and Office drills into the focused project in whichever layout is active. This avoids adding a branch to the ~20 `'city' | 'office'` checks.
- ASSUMPTION: in Campus, project buildings are **re-arranged on the ring every time**, ignoring saved editor positions. Venues and the town are off, and the world editor is disabled. City keeps its saved positions untouched.
- ASSUMPTION: **ring geometry**: rooms on one ring, ordered by company then project so a company's rooms sit together. The radius grows with room count and the widest room. Above 10 rooms a second, outer ring starts. Each room is one storey.
- ASSUMPTION: **room colour** comes from a per-project hue (reusing the Company Lens hue picker, keyed by `projectKey`), so neighbouring rooms differ.
- ASSUMPTION: bodies keep the active theme's character model. Campus gets its own theme, **"Night Campus"**: dark navy palette, coloured slabs, a lighter rug, two back walls, desks, floor lamp, bookshelf, wall chart screen and plants. It uses the existing HumanFrame body, seated facing the viewer.
- ASSUMPTION: **no post-processing bloom**, to stay inside the draw budget. Glow is faked with additive rings, sprites and a light beam. The stars are one static `Points` draw.
- ASSUMPTION: the **memory reader runs in main**, reading folder listings and mtimes only, never file contents or note titles. It scans `~/.claude`, `$CLAUDE_CONFIG_DIR` and Orca's `claude-profiles/*/home` for `projects/*/memory/*.md` (excluding `MEMORY.md`), every 15 s while a window is visible and every 60 s otherwise. It sends `memory?: { notes, changedAt }`. The Browser Office gets it too, because it is a bare count.
- ASSUMPTION: a **courier** runs for every tool call (read included), from the room's door along its spoke to the hub and back over about 4 s, with the existing 2 s city-wide gap. It reuses the citizen figure in its own instanced layer.
- ASSUMPTION: **"Runs on" chips** show the distinct models of live sessions with a count. Claude models come from transcript `message.model`, OpenCode from `selectedModel`, and Codex shows as "Codex". The chips are display only.
- ASSUMPTION: **toasts**: up to 3 stacked cards from `attention-queue`, each about 6 s, with a project colour chip. The NewsLine stays in City.

### Non-goals

The video's Tasks and Calendar tabs (our Needs-you queue already covers approvals), voice commands, the per-team panel with connected tools and skills, agents walking anywhere, night lighting in City, and any change to City or Office behaviour.

## Phases

- [x] Phase 1: Campus layout and stage. `arrangeWorldDocument(…,'ring')` (new `world-document-ring.ts`); `worldLayout` preference plus City · Campus · Office in `BottomBar.tsx`; `resolveEffectiveWorld` takes the layout and in Campus drops venues and saved positions. `OfficeScene.tsx`: town off, a dark background, a `CampusStars` Points layer and a dark ground. The camera's Fit frames the ring, and the player stands on the hub plaza.
  - Verify: `npm run typecheck && npm run build`, then an `npm run office:preview` screenshot with the fixture's 4 projects on a ring, agents seated, no town.
- [x] Phase 2: Night Campus room kit (`themes/night-campus/*`). Coloured slab, rug, two back walls, lamp, shelf, chart screen and plants as `PartSpec`s through the existing batches, with the per-project hue.
  - Verify: typecheck and build, then a preview screenshot checked against his bar: robots face the viewer, sit at their own desks, and the map rotates.
- [x] Phase 3: Brain, spokes, couriers, memory feed. `scene/campus/CampusHub.tsx` (rings, sphere, beam, orbit lines; pulse requested only on `changedAt`), `CampusSpokes.tsx` (road strips plus a dashed centre line plus trail lines), `CampusCouriers.tsx` (fed by `city-events` dispatch through `work-trip-store`). Main: `src/main/memory-notes.ts` plus `memory?` through `types.ts` → `office-feed.ts` → `apply-feed.ts` → `live-feed.ts` → `OfficeFrame`.
  - Verify: typecheck and build; the preview hub shows the fixture count; a dev run against a temp `--user-data-dir` shows the real count change after touching a note in a temp root.
- [x] Phase 4: HUD. The project card in Campus gets an icon chip (`crestFor`), "N agents · M running" and an avatar stack (up to 3 faces from provider skin colours plus roster initials, then "+n"), plus a Brain card. Also a `ToastStack.tsx` top right; minimap Campus mode (hub disc, coloured rooms) with − / + / ⤢ wired to the existing camera zoom and fit; a `RunsOnChips.tsx` bottom left; and `transcript-tail.ts` reading Claude `message.model` into `selectedModel`.
  - Verify: typecheck and build; preview screenshots at 1440 and 1100 px wide; 0 console errors in Chrome DevTools on the Browser Office.
- [x] Phase 5: Install for Angelo's look, then stop. Local dev-signed build per the release memory recipe, installed to `/Applications`.
  - Verify: frame budget check in Campus: draws and triangles at 20 agents, recorded against 300 and 600k. **Stop for his approval** (feedback memory 2026-10-12).
- [ ] Phase 6: Merge settle (after his approval). Tests for the ring arrangement, worldLayout persistence, memory reader (temp dirs, counts only, MEMORY.md excluded), feed field, courier trigger, model parsing, cards and toasts, plus the live-budget case. Then `npm test`, lint, the review pair Maya + Kai (risk 2: a new filesystem reader), Codex review, /simplify, dead-code check, a demo MP4 into `recordings/`, the vault entry, and the PR when he says to open it.
  - Verify: `npm test && npm run lint` green; review pair verdicts recorded

## Parallel vs sequential

Phase 1 runs first: everything sits on the ring. Phases 2, 3 and 4 then run in parallel in worktrees with disjoint files: **@lena** owns the theme kit and the scene files under `scene/campus/`; **@ravi** owns `src/main/memory-notes.ts`, the feed field and `transcript-tail.ts`; **@lena** (second slice) owns the HUD files. The one shared file is `OfficeScene.tsx`: only the Phase 1 owner edits it, and later slices mount through a single `CampusLayers.tsx` that Phase 1 creates. Phases 5 and 6 run in sequence.

## Estimate

| Phase | Without Claude | With Claude |
|---|---|---|
| 1 Layout and stage | 10 h | 1.5 h |
| 2 Room kit | 12 h | 2 h |
| 3 Brain, couriers, memory feed | 14 h | 2.5 h |
| 4 HUD | 12 h | 2 h |
| 5 Install and budget check | 3 h | 0.5 h |
| 6 Merge settle | 14 h | 3 h |
| **Total** | **65 h** | **11.5 h** |

## Verification (end to end)

1. `npm run typecheck && npm run build` green at every phase close.
2. `npm run office:preview`, Campus selected: the fixture's 4 projects on a ring around the Brain with spokes, stars and coloured rooms; agents seated facing the viewer; rotate and zoom work; switching back to City and Office looks unchanged.
3. Dev run with a temp `--user-data-dir` and a temp memory root: the Brain count matches `ls projects/*/memory/*.md | grep -v MEMORY.md | wc -l`, and touching a note pulses the hub within one scan.
4. Live sessions: a tool call sends a courier from that project's room to the hub; no agent leaves its room.
5. Browser Office in Chrome DevTools: 0 console errors, cards, toasts and minimap present.
6. Phase 6: `npm test` and `npm run lint` green, the live-budget Campus case under 300 draws and 600k triangles.

## Ticket table

| Ticket | Status | Source link | Conversation |
|---|---|---|---|
| none (needs filing) | Planned; no PR yet | https://www.youtube.com/watch?v=t0hGE-aaAds | "Follow up on the latest changes from the main branch and check on how we can implement the same fucking same UI for our offices" |
