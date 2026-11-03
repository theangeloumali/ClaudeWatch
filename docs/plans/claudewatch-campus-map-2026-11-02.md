# ClaudeWatch Campus map: project rooms in a ring around the Brain

Repo copy on approval: `docs/plans/claudewatch-campus-map-2026-11-02.md` · branch `feat/campus-map-2026-11-02` · worktree `.claude/worktrees/campus-map/` · Tier T3 (score 8) · **Prototype session** (tests, review, /simplify and the video wait for the merge; build and typecheck run every phase)

## Context

On 2026-11-02 Angelo asked for "the same UI for our offices", pointing at a screenshot and the video _I Built an AI Office With 31 Agents_ (Bekhruz AI, youtube.com/watch?v=t0hGE-aaAds). The video shows about 8 solid-colour isometric rooms (one per team) on a ring around a glowing "THE BRAIN · 1,842 notes · shared memory" hub. Spoke roads with light trails run from the rooms to the hub, and small figures walk them. Each room has a card with an icon chip, the name, "3 agents · 2 running" and a stack of faces. The screen also has a toast stack top right, a minimap with − / + / fit, a "Runs on Opus · Sonnet · Haiku" strip and a dark starry background.

`main` was already current at `4d295b2a` (1.4.1); there was nothing to pull.

His answers (one question round, 2026-11-02):

| Question             | Answer                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| How it lands         | **New Campus map next to City and Office**, which stay as they are           |
| What the Brain shows | **Claude memory notes**: a read-only count that pulses on change             |
| What walks the roads | **Couriers for real tool calls**; agents stay seated (2026-10-17 rule holds) |
| Verify mode          | **Prototype**                                                                |

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
- [x] Phase 6: Constant motion
  - Clock: new `renderer/office/logic/campus-motion.ts` holds the `campusClock` uniform and pure curve functions (`breath`, `rippleAt`, `packetSpeedFor`, `arcPoints`). `CampusLayers.tsx` writes the uniform once a frame.
  - Brain (`CampusHub.tsx`):
    - the core breathes;
    - two ripple rings wave from the core to the rim;
    - the orbits spin, each carrying an electron (one instanced draw);
    - motes rise up the beam and sparks drift around the plaza (one `Points` shader each);
    - the beam shimmers;
    - a memory change fires a shockwave plus a flash along every arc.
  - Arcs: new `CampusArcs.tsx`.
  - Roads (`CampusSpokes.tsx`): a packet shader with per-vertex `along` and `speed` attributes.
  - Stars (`CampusStars.tsx`): per-star twinkle.
  - HUD (`RoomCards.tsx`, `ToastStack.tsx`, `CampusMap.tsx`, `hud/glass.ts`), CSS only and respecting `prefers-reduced-motion`:
    - the live dot pulses;
    - counts animate when they change;
    - toasts slide in and out;
    - the Brain count ticks;
    - the minimap hub pulses.
  - Verify: `npm run typecheck && npm run build`; two preview frames 1 s apart differ at the hub, roads and stars, and are identical under emulated reduced motion; Campus at 20 agents ≤ 300 draws / 600k triangles; renderer CPU idle-focused within 2 points of the round-1 baseline (`ps`, before and after)
- [x] Phase 7: Agents stroll their own room
  - New `office/sim/room-strolls.ts`:
    - eligibility, seeded timers and the per-room away cap;
    - target sampling inside the room footprint, off desk slots, at least 2 m from the door, reachable.
  - `behaviour.ts`: `goStroll` and the dwell, with return through `returnToDesk`.
  - `world.ts`: calls `reconcileStrolls` after `reconcileLeisure` (`world.ts:288`), at most one new route per tick, gated by `hasLoungeTrips`.
  - `shared/office/types.ts`: adds `place: 'stroll'`.
  - `renderer/office/logic/character-pose.ts`: a standing look-around pose for a stroll.
  - Card status unchanged.
  - Tests (TDD, RED first):
    - a stroll target never leaves the room or comes within 2 m of the door;
    - an urgent agent is called home;
    - the cap holds;
    - the lounge switch disables strolls;
    - the existing `lounge-trips` and `seated-agents` suites stay green.
  - Verify: `npx vitest run src/office/sim` green; `npm run typecheck && npm run build`; a 60 s preview capture in Campus shows agents leaving and returning to their desks inside their room, none passing a door, with at most a third of each room (rounded up) away at any sampled frame
- [x] Phase 8: Free CC0 low-poly models
  - Spike first, in an empty temp folder: download the Kenney Furniture Kit and a character pack, read the licence, and inspect the node and bone trees with `npx @gltf-transform/cli inspect`.
  - Optimise the models and commit the GLBs plus `assets/campus/LICENSE.txt`.
  - New files:
    - `themes/night-campus/glb-props.ts`: bakes glTF into instanced geometry;
    - `themes/night-campus/MiniPerson.tsx`: maps glTF onto `RobotRig`.
  - `room-props.ts`, `CampusDesk.tsx` and `NightCampusRoom.tsx` swap to the baked props, with scrolling monitors, lamp glow and a scrolling wall chart.
  - `night-campus/index.ts` points `robot.Model` at `MiniPerson`.
  - Verify: typecheck and build; a close-zoom screenshot passes his bar (people face the viewer, sit and type at their own desks, stroll inside the room; the map rotates); ≤ 300 draws / 600k triangles at 20 agents; largest emitted file < 480 KB; Browser Office 0 console errors
- [x] Phase 9: Install for his look, then stop
  - Dev-signed build per the release memory recipe.
  - The previous app is kept as `~/Applications/ClaudeWatch-1.4.1-campus-r1.app`; the new one is installed to `/Applications`.
  - Stop for his approval (feedback memory 2026-10-12).
  - Verify: `codesign --verify --deep --strict /Applications/ClaudeWatch.app` passes and the app opens to Campus
- [x] Phase 10: Merge settle (after his approval)
  - The old Phase 6 scope, plus tests for `campus-motion.ts`, packet speed, the glTF rig mapping and prop baking.
  - Then:
    - `npm test` and lint;
    - the review pair Maya and Kai;
    - Codex;
    - /simplify;
    - the dead-code check;
    - a demo MP4 into `recordings/`;
    - the vault entry;
    - a PR when he says so.
  - Verify: `npm test && npm run lint` green, and every completion-mandate step recorded
  - Done 2026-11-03, after his approval ("I think this is all good for now. Let's merge and create a new build for this"):
    - /simplify: four cleanup reviews; Campus layers share one running-count map, one seeded draw and one baked material, and unused exports went.
    - Review: Kai (no veto) and Maya, then Codex for its three turns, then Maya again as the final review. Every finding was fixed with a test that failed first:
      - a toast keeping a real name after Hide names;
      - strollers pushed into the door zone, and walkers heading home left untracked;
      - outer-ring roads crossing inner rooms;
      - a ring too big for the world, now drawn as the city on screen too;
      - the decoder throwing or misreading bad bytes;
      - stroll starvation after a refused route;
      - right-click editing and an open editor in Campus.
    - `npm test`: 5,760 passed. Lint, typecheck and knip are clean.
    - Demo: `recordings/campus-map-demo.mp4` (local only), with a motion pass.

## Parallel vs sequential

Phase 1 runs first: everything sits on the ring. Phases 2, 3 and 4 then run in parallel in worktrees with disjoint files: **@lena** owns the theme kit and the scene files under `scene/campus/`; **@ravi** owns `src/main/memory-notes.ts`, the feed field and `transcript-tail.ts`; **@lena** (second slice) owns the HUD files. The one shared file is `OfficeScene.tsx`: only the Phase 1 owner edits it, and later slices mount through a single `CampusLayers.tsx` that Phase 1 creates. Phases 5 and 6 run in sequence.

## Estimate

| Phase                          | Without Claude | With Claude |
| ------------------------------ | -------------- | ----------- |
| 1 Layout and stage             | 10 h           | 1.5 h       |
| 2 Room kit                     | 12 h           | 2 h         |
| 3 Brain, couriers, memory feed | 14 h           | 2.5 h       |
| 4 HUD                          | 12 h           | 2 h         |
| 5 Install and budget check     | 3 h            | 0.5 h       |
| 6 Merge settle                 | 14 h           | 3 h         |
| **Total**                      | **65 h**       | **11.5 h**  |

## Verification (end to end)

1. `npm run typecheck && npm run build` green at every phase close.
2. `npm run office:preview`, Campus selected: the fixture's 4 projects on a ring around the Brain with spokes, stars and coloured rooms; agents seated facing the viewer; rotate and zoom work; switching back to City and Office looks unchanged.
3. Dev run with a temp `--user-data-dir` and a temp memory root: the Brain count matches `ls projects/*/memory/*.md | grep -v MEMORY.md | wc -l`, and touching a note pulses the hub within one scan.
4. Live sessions: a tool call sends a courier from that project's room to the hub; no agent leaves its room.
5. Browser Office in Chrome DevTools: 0 console errors, cards, toasts and minimap present.
6. Phase 6: `npm test` and `npm run lint` green, the live-budget Campus case under 300 draws and 600k triangles.

## Ticket table

| Ticket              | Status             | Source link                                 | Conversation                                                                                                                      |
| ------------------- | ------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| none (needs filing) | Planned; no PR yet | https://www.youtube.com/watch?v=t0hGE-aaAds | "Follow up on the latest changes from the main branch and check on how we can implement the same fucking same UI for our offices" |

## Round 2 (2026-11-02): constant motion, room strolls, free models

**Round 2 as built (2026-11-02):** typecheck, lint and `npm test` green (553 files, 5732 tests); build green, largest office-web file 428,584 B. Campus at 22 agents: 60 draws / 80.9k triangles overview, 68 / 80.9k close (round 1: 62 / 143k). Idle CPU in headless Chrome on the M5 Max: 25.2% of a core against 23.6% for round 1, after an infinite CSS pulse was found tripling the GPU process (fixed in 732397a0). Strolls seen in a 70 s preview capture. Packs: Kenney Furniture Kit 2.0 and Mini Characters 1.0, CC0.

The Phases ledger above carries phases 6–10.

### Round 2 context

Phases 1–5 shipped the Campus map, and Angelo has used the build installed in `/Applications`. On 2026-11-02 he gave three asks:

1. "this can still be improved, like having a lot of animations and motion graphics here that can make this fucking alive… the brain that you generated, it's not fucking alive"
2. "Can we somehow replicate their models or is it a paid model?"
3. "I want the AI agents not to just be sitting… they can roam around the room or whatever… If we can already use the same concept that we have on default view mode"

**What causes the stillness (evidence):**

- The Brain's only `useFrame` returns early unless a memory pulse is running (`scene/campus/CampusHub.tsx:114-124`). Its rings, core, halo, beam and orbits sit frozen.
- Roads and kerb trails are static (`CampusSpokes.tsx:93`). The stars are a static `Points` draw (`CampusStars.tsx`).
- Night Campus registers no `Ambient` component (`themes/night-campus/index.ts`). Orbital Garrison's `GarrisonAmbient.tsx` is the pattern to copy.
- **Agents move between only two places.** A finished agent waits `LOUNGE_DELAY_MS = 20_000` (`office/sim/behaviour.ts:30`), then walks to the game corner (`world-leisure.ts:71`). That trip only happens when the agent is observed fresh and at rest (`world-leisure.ts:35-57`). In his app the header reads "Activity unavailable", so nobody qualifies and everyone stays seated. Working agents never leave the desk at all.

**Frame cost.**

- Ambient motion: the governor already draws continuously at the idle rate (`logic/frame-governor.ts:43-47`: 30 fps focused, 10 blurred, 5 blurred idle, 0 hidden). Motion driven from the clock or a shader `uTime` therefore adds **no frames**.
- Walking: it holds the walking rate. Focused, that is the same 30 fps. Blurred, it is 10 instead of 5 while someone strolls, about 1% of a core more by the governor's own note.

**His models question.**

- The video doesn't name its models.
- Its chunky rounded people, star-base office chairs, shaded floor lamps and round potted plants look like free **CC0 low-poly packs** in the Kenney style, not paid assets.
- Kenney assets are CC0: free for commercial use, no credit required. They ship as OBJ, FBX and glTF.
- We can't take the video's own files, but we can use free CC0 packs of the same kind.

**His answers (one question round, 2026-11-02):**

| Question  | Answer                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Models    | **Motion now, free models next**: CC0 low-poly glTF furniture and people in a later phase                                         |
| Road life | **Light pulses always, people on real calls**: packets run every road constantly; a walking courier still means a real tool call  |
| Agents    | (his follow-up message) **Agents move around their own room** instead of only sitting, reusing the default view's in-office trips |

### Design

```ascii
 ┌──────────────────────────── one project room (agents never leave it) ──────────────────────────┐
 │                                                                                                │
 │  desk ●──stroll──► chart wall ··· look 5–12 s ···──► back to desk     (working: every 45–120 s)│
 │  desk ●──stroll──► bookshelf / plant / a colleague's desk ──► back    (idle: every 15–40 s)    │
 │  desk ●──20 s done──► game corner (existing lounge trip) ◄──► strolls between games            │
 │  needs-you ●  stays seated, and a stroller is called straight home the moment it needs you     │
 │  door zone ✕  never a stroll target (the 2026-10-17 "stuck at the door" fix stays true)        │
 └────────────────────────────────────────────────────────────────────────────────────────────────┘

         shared uTime (frozen under reduced motion) drives every ambient layer:
   STARS twinkle · BRAIN breathes, ripples, spins orbits, beam motes, neural arcs, memory shockwave
   ROADS packets flow to the hub, faster for busy rooms · ROOMS screens scroll, lamps glow
   HUD live-dot pulse, toast slide, Brain count tick, minimap hub pulse
   no new frames requested · ≈ +9 draws (62 → ~71 of 300)
```

### Decisions (ASSUMPTION lines, my calls)

**Motion**

- ASSUMPTION: All motion runs on the shared clock in `useFrame` or on a shader `uTime`, never through `invalidate`.
- ASSUMPTION: Reduced motion (`usePrefersReducedMotion`) freezes `uTime`, which leaves a lit, still frame.
- ASSUMPTION: No bloom post-processing. Glow stays additive and unlit, inside the 300-draw / 600k-triangle budget.
- ASSUMPTION: Road packets flow from each room to the Brain. Their speed and density come from the room's count of running agents. That count is written into a vertex attribute only when it changes, and an idle room keeps a slow trickle.
- ASSUMPTION: A neural arc runs from each room's door to the core, in the room's colour, with a dash travelling inward. All the arcs are one `LineSegments` draw.
- ASSUMPTION: A working agent's monitor scrolls a shared code-line `CanvasTexture`; an idle desk's monitor is dim and still.
- ASSUMPTION: No idle camera drift. He rotates the map himself.

**Strolls (phase 7)**

- ASSUMPTION: **A stroll is a short walk inside the agent's own room.** It goes to a free spot (a wall, the chart, the shelf, a plant, a colleague's desk), pauses 5–12 s facing that spot, then walks back to the desk. Targets are sampled on the room's nav grid and must:
  - be inside the room's footprint;
  - be off every desk slot;
  - be at least 2 m from the doorway;
  - be reachable by `navigation.around`.
- ASSUMPTION: **Who strolls and how often.**
  - Working agents: every 45–120 s.
  - Done or idle agents: every 15–40 s, alternating with the existing game-corner trip.
  - Agents that need you never stroll. One that turns urgent mid-stroll is called home at once through the existing `callHome`.
  - The jitter is seeded from the agent key, so tests are deterministic.
- ASSUMPTION: **Strolls don't need observation.** Unknown activity ("Activity unavailable") no longer pins an agent to its desk for strolls, because he asked for them "as much as possible". This reverses my unconfirmed 2026-10-16 reading that unknown activity stays seated. Game-corner trips keep their existing evidence rule, because sitting in the game corner claims the agent is idle; a stroll claims nothing.
- ASSUMPTION: **Caps.** At most a third of a room's agents (rounded up) are away at once, so every room still shows people working. The sim plans at most one new stroll route per tick. That bounds pathfinding CPU, the lesson of 2026-10-12 ("Office CPU was crew churn").
- ASSUMPTION: **The existing "lounge trips" switch governs strolls too.** When it's off, agents stay seated, so he keeps a calm mode.
- ASSUMPTION: **Strolls run in every layout** (City, Campus, Office), because the sim runs one layout for every view (vault learning 2026-11-02). It is the same in-office concept as the default view, now with more places to go.
- ASSUMPTION: The new view state is `place: 'stroll'`, beside `'lounge'` (`shared/office/types.ts:191`). `character-pose.ts` gives it a standing look-around pose and keeps the agent's card status unchanged.

**Models (phase 8)**

- ASSUMPTION: Kenney CC0 packs: the Furniture Kit for desk, chair, lamp, plant, shelf and sofa, plus a mini or blocky character pack.
  - Optimised to GLB with `gltf-transform` and committed under `src/renderer/office/assets/campus/` with the CC0 licence text.
  - Each file stays under the 480 KB per-file guard.
  - Loaded with `GLTFLoader` from `three/examples`; no new package.
- ASSUMPTION: A new `MiniPerson` model maps the glTF nodes or bones onto the existing `RobotRig`, so `applyHumanPose` keeps agents sitting, typing and strolling. If a pack can't be mapped onto the rig, Night Campus keeps `HumanFrame` for people and ships the furniture only, and I report that to him.
- ASSUMPTION: Each glTF prop is baked once into a vertex-coloured geometry, then drawn as one `InstancedMesh` per prop kind. Draws then grow with the number of prop kinds, not the number of rooms.

### Non-goals

- Decorative road walkers.
- Agents leaving their room, or walking through its door, outside today's arrive and leave.
- Idle camera movement.
- Bloom.
- Visual changes to City or Office beyond agents strolling there too.

### Round 2 parallel vs sequential

`logic/campus-motion.ts` (the clock) is created first, inline. After that, three slices own disjoint files and run **in parallel** worktrees:

| Slice   | Owner          | Files                                                                                   |
| ------- | -------------- | --------------------------------------------------------------------------------------- |
| Motion  | @lena          | `scene/campus/*`, `logic/campus-motion.ts`, the Phase 6 HUD files                       |
| Strolls | @ravi          | `src/office/sim/*`, `shared/office/types.ts`, `renderer/office/logic/character-pose.ts` |
| Models  | @lena (second) | `themes/night-campus/*`, `assets/campus/*`                                              |

- Phase 9 waits for all three slices.
- Phase 10 waits for his approval.
- One risk-based review pair closes it, in Phase 10.

### Estimate

| Phase              | Without Claude | With Claude |
| ------------------ | -------------- | ----------- |
| 6 Constant motion  | 12 h           | 2 h         |
| 7 Room strolls     | 10 h           | 2 h         |
| 8 CC0 models       | 16 h           | 3 h         |
| 9 Install and stop | 1 h            | 0.3 h       |
| 10 Merge settle    | 18 h           | 4 h         |
| **Round 2 total**  | **57 h**       | **11.3 h**  |

### Verification (end to end)

1. `npm run typecheck && npm run build` green at each phase close.
2. Preview in Campus, quality pinned to balanced: frames 1 s apart differ at the Brain, roads and stars; they're identical under reduced motion.
3. Strolls: over 60 s, agents walk to spots inside their own room and return, never through a door or within 2 m of it. At most a third of each room (rounded up) is away at once, so a one-agent room may stroll. A needs-you agent goes straight home.
4. Live sessions: a busy room's packets run faster than an idle room's, and a tool call still sends a courier.
5. Budget: ≤ 300 draws and ≤ 600k triangles at 20 agents; idle-focused CPU within 2 points of the baseline.
6. After the model swap, at close zoom: people face the viewer, sit and type at their own desks, and stroll; the map rotates.
7. Browser Office: 0 console errors.

### Round 2 tickets

| Ticket              | Status                                               | Source link                                 | Conversation                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none (needs filing) | Approved 2026-11-03; merged to main in the Campus PR | https://www.youtube.com/watch?v=t0hGE-aaAds | "Okay I think this is a good start but this can still be improved, like having a lot of animations and motion graphics here that can make this fucking alive."                              |
| none (needs filing) | Answered: free CC0 packs; merged in the Campus PR    | https://www.youtube.com/watch?v=t0hGE-aaAds | "Can we somehow replicate their models or is it a paid model?"                                                                                                                              |
| none (needs filing) | Approved 2026-11-03; merged in the Campus PR         | https://www.youtube.com/watch?v=t0hGE-aaAds | "Also I want the AI agents not to just be sitting. If possible as much as possible, they can roam around the room or whatever instead of just them fucking sitting without doing anything." |
