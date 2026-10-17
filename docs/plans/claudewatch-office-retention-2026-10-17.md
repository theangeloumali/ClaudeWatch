# ClaudeWatch: agents stay in their office, idle agents play games in it

Branch `feat/city-port-2026-10-16` (this work ships inside the city-port PR) · 2026-10-17

## Context

Angelo, 2026-10-17, with a screenshot of three robots in an office doorway:

> "Hey I noticed some issues are fucking stuck on the door and they are not working or not being shown to work. This is quite weird. As much as possible we can just retain the agents inside their office and have an environment for them. For example if they are idle, they can play games in the section within the office"

This reverses his 2026-10-16 answer that idle agents "can roam the city".

**Validated:** `bash /tmp/office-audit-tools/lead/p9/door-capture.sh 3 /tmp/office-audit-tools/door-now` on `bffdf19e` (view-only server, real sessions, 146 samples over 179 s).

- Four agents stood within 1.6 m of a building entrance for 12–16 s:

  | Agent     | Time at the entrance | State                   |
  | --------- | -------------------- | ----------------------- |
  | 62c50c8e  | 13.1 s               | leaving, still thinking |
  | pid-38472 | 16.1 s               | arriving                |
  | e7246dc1  | 15.1 s               | —                       |
  | e72bfbd3  | 12.1 s               | —                       |

- From 10.7 s to 26.8 s, three leavers and one arriver were jammed in one doorway.
- e72bfbd3 then left its building and walked 130 m down the street on a city outing.

**Root cause:**

- `src/office/sim/world.ts:376-385`: `hasEntryTraffic` counts only _arriving_ walkers. A new arrival is therefore admitted at the entrance while leavers are still walking out through it, and the two meet head-on.
- `src/office/sim/movement-recovery.ts:8`: a blocked leaver fades only after `BODY_BLOCKED_LIMIT_SEC = 15`. That is the 13–16 s dwell.
- `src/office/sim/world.ts:198-216`: every leaver walks out through the street door.
- `src/office/sim/world-leisure.ts:198-257`: idle agents go out on venue visits and roaming loops. Between them, the doorway has traffic all day.
- `src/office/sim/effective-world-floors.ts:63-68`: only a company's first project gets a lounge, on its building's ground floor. Idle agents in every other building have nowhere indoors to go.

## Design

```ascii
 BEFORE                                         AFTER
 ──────                                         ─────
 street ─► entrance ─► desk      (arrival)      appears at its desk (grows in)
 desk ─► entrance ─► street      (leaver)       fades where it stands
 desk ─► lounge (1st project only)              desk ─► game corner on its own floor
      └─► entrance ─► venue / street loop       (no city outings)

 one building floor, after
 ┌──────────────────────── building ───────────────────────────┐
 │  ┌──── game corner ────┐                                     │
 │  │ ▓▓▓▓ big screen ▓▓▓▓│   arcade ▣        ▣ arcade          │
 │  │  ◍  ◍  ◍  ◍  seats  │   (seats face the screen)           │
 │  └─────────┬───────────┘                                     │
 │            │ indoor walk only                                │
 │  ┌ office ┐ ┌ office ┐ ┌ office ┐ ┌ office ┐                 │
 │  │ ▭ desk │ │ ▭ desk │ │ ▭ desk │ │ ▭ desk │  ◄ working      │
 │  └────────┘ └────────┘ └────────┘ └────────┘                 │
 │        entrance ▯  (no agent walks through it)              │
 └──────────────────────────────────────────────────────────────┘
```

- **Arrivals** appear seated at their desk; the robot grows in over the fade. Nobody walks in from the street.
- **Leavers** fade where they stand, at the desk or in the game corner.
- **A desk moved** to another floor or building: the robot fades and reappears at the new desk. A move on the same floor is a short indoor walk.
- **No city outings.** Agents no longer visit venues or walk roaming loops. Citizens, vehicles, trains and work trips are unchanged; venues stay as scenery.
- **A game corner on every building floor with offices:**
  - Placement: in the floor's free space. Each candidate is tried in turn:
    1. the strip on the screen-faces-camera side of the offices;
    2. the other three sides.

    A candidate is taken only if it keeps a 1 m wall margin, sits 1 m from every office, avoids the lift and stays 2 m from the entrance.

  - Seats: sized for that floor's crew, at most 8, in rows of 4. The seats face a screen on the corner's far side.
  - Who goes there: as today, an agent observed idle for 20 s walks to a free seat on its own floor.
  - Leaving it: when work arrives, the agent walks back to its desk.
  - When nobody can go: a full corner, or a floor with no room for one, leaves the agent at its desk.

- **Renderer:**
  - One shared `GameCorner`, coloured from each theme's palette and batched by shape and colour: a rug, beanbag seats, a large wall screen and two arcade cabinets.
  - A `gaming` pose: arms forward on a controller, with a small bob.
  - The name card reads "Playing games".
  - The overview draws the corner's seats.
- **Setting:** "Lounge trips" becomes "Game corner". The key stays `loungeTrips`, so a saved Off still means Off.

## Assumptions

- ASSUMPTION: "office" means the project's building floor that holds its agent rooms. I chose a corner on that floor because a 4 × 4 m agent room has no space for games, and the corner keeps agents inside the building, a short walk from their desks.
- ASSUMPTION: new agents appear at their desk instead of walking in. I chose this because the walk-in is the traffic that jammed the door, and you asked to keep agents inside "as much as possible".
- ASSUMPTION: a floor with no free space for a corner keeps its idle agents at their desks. They are never sent to another floor or outside.
- ASSUMPTION: the saved city document is untouched. The corner is derived on every build, as the lounge is today, so there is nothing to migrate and nothing new to sync between hosts.
- ASSUMPTION: city venues stay as scenery, and only agents' visits to them go. The agent-only outing code (`roaming.ts`, the sim's venue bookings, the sidewalk legs of `homeRoute`, venue seats in `worker-seat-presence.ts`) is deleted under the dead-code mandate.

## Phase ledger

- [x] Phase 1: Merge the three Codex pass-4 fixes (lift release, Windows CLI, day usage by conversation)
- [x] Phase 2: Sim — agents stay inside (arrive and leave in place, cross-floor moves fade, no outings, outing code deleted)
- [x] Phase 3: Sim — a game corner on every office floor; idle agents play there
- [x] Phase 4: Renderer — GameCorner furniture, gaming pose, grow-in, "Playing games", setting copy
- [ ] Phase 5: Integrate, gates, live re-measure, page probe
- [ ] Phase 6: Close (simplify, review, Codex, dead code, checklist, install, MP4, vault)
- [ ] Phase 7: Push and merge to main (#12, office-health PR, city-port PR)

| Phase | Owner                                           | Verify                                                                                                                                                                                                                                                                                                                         |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | lead                                            | `npx vitest run src/office src/bridge src/renderer/office-live --maxWorkers=6` exits 0 after the three `--no-ff` merges                                                                                                                                                                                                        |
| 2     | @lena (worktree `or-sim`)                       | RED first: a door-churn spec where leavers and arrivals share a doorway fails today with a ≥ 12 s dwell. Then `npx vitest run src/office/sim --maxWorkers=6` exits 0 and `grep -rn "RoamOutings\|VenueBookings" src` returns nothing                                                                                           |
| 3     | @lena (same worktree, after 2)                  | RED first: an idle agent in the second project of a company has no indoor seat today. Then `npx vitest run src/office/sim` exits 0, with specs for a corner on every floor with offices, no overlap with any office/lift/entrance, at most 8 seats, a full corner keeping agents at their desks, and work calling a gamer back |
| 4     | @lena (worktree `or-render`, parallel with 2–3) | `npx vitest run src/renderer/office --maxWorkers=6` exits 0; GameCorner adds ≤ 1 draw at full (batched-shape spec); the gaming pose has a spec; a robot that mounts faded starts at scale 0                                                                                                                                    |
| 5     | lead                                            | prettier, `eslint .`, both `tsc`, `knip`, the full vitest suite and `npm run build` all exit 0. A 10-minute live capture shows: 0 agents within 1.6 m of an entrance for ≥ 3 s, 0 agent samples off their building, idle agents seated in corners, 0 working agents off their desks. Page probe at full: ≤ baseline + 12 draws |
| 6     | lead + @maya                                    | `dead-code-check.sh` exits 0; Maya approves; `codesign --verify --deep --strict` passes on the install; the MP4 is frame-verified and shows a corner with gamers and agents at desks                                                                                                                                           |
| 7     | lead                                            | `gh pr view <n> --json state -q .state` prints MERGED for all three PRs                                                                                                                                                                                                                                                        |

## Parallel and sequential

- Phases 2 and 3 share `world.ts`, `world-leisure.ts` and `effective-world-floors.ts`. One owner runs them in order.
- Phase 4 shares no file with them, so it runs in parallel. The contract between them:
  - The corner is the floor company zone's `lounge`, with id `<floorId>:games`.
  - Each seat's heading faces the screen, and the screen stands beyond the seats in the direction they face.
  - An agent on a corner seat has `place: 'lounge'`.

## Estimate

| Phase               | With Claude | Without  |
| ------------------- | ----------- | -------- |
| 1 merge fixes       | 0.5 h       | 2 h      |
| 2 stay inside       | 3 h         | 12 h     |
| 3 game corner (sim) | 3 h         | 10 h     |
| 4 renderer          | 3 h         | 12 h     |
| 5 integrate + live  | 1.5 h       | 5 h      |
| 6 close             | 2 h         | 6 h      |
| 7 merge             | 0.5 h       | 1 h      |
| **Total**           | **13.5 h**  | **48 h** |

## Results

| Measure (view-only server, real sessions)            | Before (`bffdf19e`, 3 min)         | After (`3986ef23` + chunk, 10 min)                                                                            |
| ---------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Agents within 1.6 m of a building entrance for ≥ 3 s | 4 (12–16 s each)                   | 0                                                                                                             |
| Agent samples outside their building                 | 475                                | 0                                                                                                             |
| Agent samples in a game corner                       | 0 (lounges only in first projects) | 1,908                                                                                                         |
| Office floors with a game corner                     | —                                  | 4 of 4                                                                                                        |
| Working agents walking, not seated                   | 101 samples (stuck in doorways)    | 44 samples, all walks back from the corner when work arrived (desk distance falling ~10.7 → 0.7 m over ~11 s) |

- Gates on the integrated tree: both `tsc`, `eslint .`, `knip` and prettier are clean, and vitest passed 5,439 tests.
- Draw and triangle checks:
  - the corner costs at most 1 draw per theme at full;
  - the 512-worker overview drew 589,874 triangles against a 600,000 ceiling, using one beanbag body per seat.
- The page chunk is 475,307 bytes against the framework sync's 480,000-byte limit. The shared office model now ships in the simulation chunk.

### Rulings

- **Kept as a fade, not an explicit direction:** the sim's `fade` stays 0 → 1 for both arrival and departure, and the robot reads the direction from whether it mounted faded. Cost if wrong: an arrival spends 500 ms invisible before it grows in.
- **Not a tagged "no route" result:** an empty route still means fade. Cost if wrong: a seat walled off by an edit looks like a move to another floor, so the agent pops instead of walking.
- **The corner is computed on every build, not stored in the world document, and validation doesn't require one.** A floor with no room keeps its idle agents at their desks. Cost if wrong: a crowded saved building silently has no corner. On today's real city, 4 of 4 floors have one.
- **The baseline company lounge in `projects.ts` stays**, because legacy (non-city) worlds and their specs use it. Cost if wrong: dead geometry in production builds.
- **No deeper split of the bundle.** Themes import from scene, town, logic and citizens, so a themes chunk would be circular with the page chunk. Cost if wrong: about 4.7 KB of growth breaks the sync again.
- **Generated buildings leave room for the corner (Ruling 8 of the sim builder).** After the cleanup pass the corner is shallower, so a generated city leaves 48 filler lots (smallest 4.45 m). Cost if wrong: smaller filler lots on a freshly generated city.
- **Corner rows sit a walkway apart (cleanup pass).** Rows are 2.95 m apart, derived from body radius plus route clearance, so a walker fits between two seated rows. The front row is 1.2 m from the screen, and a spec fails if any gamer walks through the screen strip. Cost if wrong: in a full eight-seat corner, one late gamer can pause about 12 s behind a sitter before going round the row end.
