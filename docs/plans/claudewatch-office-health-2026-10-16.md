# ClaudeWatch Office Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fix every defect the 2026-10-16 office audit reproduced.

- Agents seated at their desks instead of jammed at the door.
- Idle agents roaming the city on sidewalks.
- Citizens off the carriageway.
- Office walls that no longer flicker.
- The Office's CPU cost cut.
- The whole-app health and release defects.

ClearSpent's ops-twin patterns are ported into ClaudeWatch's own code, not consumed as a package.

**Architecture:** four independent tracks, then two dependent ones, then perf last.

- **Independent tracks:** bridge truth (`src/bridge`), the door and departure fixes (`src/office/sim`), one shared street and sidewalk network (`src/office/sim/sidewalks.ts`), and render fixes (`src/renderer/office/scene`).
- **Dependent tracks:** citizens and roaming agents move onto the shared network.
- **Perf runs last:** it reshapes the feed and the batches, so every other change must land first.

**Tech Stack:** Electron 44 · React 19.3 · three 0.186 + @react-three/fiber 9.8 · TypeScript 5.7 · vitest 3.2 · Playwright 1.64 (verification only, from `/tmp/office-audit-tools`).

**Spec:** the audit reports, all on 2026-10-16 against `release/1.3.5` @ 368f586.

- `/tmp/office-audit-tools/seating/REPORT.md` (seating)
- `/tmp/office-audit-tools/citizens/REPORT.md` (citizens)
- `/tmp/office-audit-tools/flicker/REPORT.md` (flicker)
- `/tmp/office-audit-tools/perf/REPORT.md` (perf)
- `/tmp/office-audit-tools/health/REPORT.md` (health)
- `/tmp/office-audit-tools/clearspent/REPORT.md` (clearspent, incl. its "Port map" P1–P10)
- Adversarial verdicts: `/tmp/office-audit-tools/verify-*/VERDICTS.md`.

Finding ids below (`seating-1`, `P3` …) refer to those reports.

**Validated:** `cd .claude/.worktree/office-audit && npx vitest run $(find src -path '*__tests__/audit/*' -name '*.test.ts*') --testTimeout=120000` → **25 failed | 3 passed (13 files)**.

- Re-run by the lead, not the auditors. Log: `/tmp/office-audit-tools/probes-red-baseline.log`.
- The 3 passes are the controls: terminal `codex` is still detected, a small transcript folder is still claimed, and a moved part still uploads.

**Branch / worktree:** `fix/office-health-2026-10-16` off `release/1.3.5`, in `.claude/.worktree/office-health`. The probes live untracked in `.claude/.worktree/office-audit`, and each task copies its own probe in as its RED test.

**Deploy:** local only.

- Phases 0–9 commit on the branch and end with a local install, then STOP for Angelo's look (his 2026-10-12 rule: review, cleanup and the demo wait for his approval).
- Push, and the PR stacked on draft PR #12 (base `release/1.3.5`, said so in the body), happen in Phase 10 and only on his word.
- Publishing stays behind the Apple-agreement blocker of the 1.3.5 release plan.

## Tickets

| Ticket                          | Status                                                          | Source link                             | Conversation                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| none — needs filing (CW-SEAT)   | Phase 2 + Phase 5; root cause reproduced (seating-1..6)         | this session, 2026-10-16 (no permalink) | "The agents that are supposed to be sitting and working are fucking standing on the door"                                                   |
| none — needs filing (CW-WALK)   | Phase 3 + Phase 4; root cause reproduced (citizens-1..8, P1–P6) | this session, 2026-10-16 (no permalink) | "There are also times that the pedestrians are fucking blocking the roadways and not walking on the pedestrian pathways."                   |
| none — needs filing (CW-FLICK)  | Phase 6; root cause reproduced (flicker-1, flicker-2)           | this session, 2026-10-16 (no permalink) | "Also there is flickering on the walls of the office"                                                                                       |
| none — needs filing (CW-PERF)   | Phase 1 (bridge) + Phase 7; measured (perf-1..10)               | this session, 2026-10-16 (no permalink) | "I want you to check the possible optimizations that you can do"                                                                            |
| none — needs filing (CW-HEALTH) | Phase 0, 1, 8; reproduced (health-1..15)                        | this session, 2026-10-16 (no permalink) | "find any issues that you can fix"                                                                                                          |
| none — needs filing (CW-CS)     | Ported across Phases 3–6 (P1–P10); decided                      | this session, 2026-10-16 (no permalink) | "Also I want you to check what we built on ClearSpent. We have a nice idea of how we are implementing it the same way here on ClaudeWatch." |
| none — needs filing (CW-ROAM)   | Phase 5 (owner answer)                                          | this session, 2026-10-16 (no permalink) | "they can roam the city"                                                                                                                    |

## Phase ledger

- [ ] Phase 0 — Baseline and guards: signing-file ignore rules, heavy-test timeouts, stale ledger ticks
- [ ] Phase 1 — Bridge truth: phantom ChatGPT agents, the 512-transcript cap, false idle, resume flags, retention, OpenCode SQL, usage backfill, process monitor, peek, Codex ledger
- [ ] Phase 2 — Door, departures and honest cards: ungameable churn gates, cycle-only tie-break, body-blocked bound, gate skips blocked arrivers, subagents fade at desks, "Leaving" and honest unknown cards
- [ ] Phase 3 — Legacy town decision, one street source, one crosswalk source, the sidewalk network, lane-centre vehicles (P1, P2, P3, P6)
- [ ] Phase 4 — Citizens on the network: pedestrian ground, deadlock breaker that survives replans, zebra right-of-way, ambient loops
- [ ] Phase 5 — Roaming agents via the leisure system: idle or done roam the sidewalks, unknown stays seated, working returns; guarded move of arrivals onto the network
- [ ] Phase 6 — Render fixes: facade layer steps, cutaway hysteresis, desk-band card culling, context loss, canvas metrics
- [ ] Phase 7 — Performance: static and dynamic batches, motion out of React, cached batch keys, memoised validation, shader prewarm, host-served world document
- [ ] Phase 8 — Release and repo hygiene: one version line (1.4.1), honest Windows updater status, main-checkout mode noise, worktree cleanup
- [ ] Phase 9 — Integration: full gate chain, live re-measure on real data, local install, STOP for Angelo's look
- [ ] Phase 10 — After Angelo approves: simplify, review pair, Codex, dead code, checklist, MP4 demo, vault, push and stacked PR

## Diagrams

```ascii
 Phase order (│ = sequential, ║ = parallel, each writer in its own worktree, exclusive files)

 Phase 0 (lead, inline)
    │
    ├────────────────┬───────────────────────┬──────────────────────┐
    ▼                ▼                       ▼                      ▼
 Phase 1 ║        Phase 2 ║               Phase 3 ║              Phase 6
 @ravi            @lena-sim               @lena-town             @lena-render
 src/bridge,      sim door/departure,     sim streets +          facades, cutaway,
 main/platform    name cards              sidewalks.ts           cards, context loss
    │                │                       │                      │
    │                └──────────┬────────────┤                      │
    │                           ▼            ▼                      │
    │                     Phase 5 ║      Phase 4                    │
    │                     @lena-sim      @lena-town                 │
    │                     roaming        citizens on network        │
    │                           │            │                      │
    └───────────────────────────┴─────┬──────┴──────────────────────┘
                                      ▼
                         Phase 7 @lena-perf (OfficeScene, feed, batches)
                                      │
                         Phase 8 (lead) ─► Phase 9 (lead) ─► STOP: Angelo looks
                                                               │ approves
                                                               ▼
                                                           Phase 10
```

```ascii
 Why agents stand at the door today, and what each phase removes

 bridge ──► 19 ChatGPT helpers read as Codex agents ──► phantom building, seated, "Idle"  [P1: health-2]
        ──► lead in a >512-transcript folder → placeholder ────► reported idle with
                                                                  fresh evidence → walks out  [P1: health-3, seating-6]
 sim    ──► crew turns over: finished guests walk OUT ─┐
                              new crew walks IN ───────┤
                                                       ▼
            two walkers yield to each other forever (worker-navigation.ts:54-70)  [P2: seating-1]
            stall clock reset by every repath (movement-recovery.ts:61-64)         [P2: seating-2]
            arrival gate holds the whole crew, never drawn (world.ts:356-364)      [P2: seating-3]
 cards  ──► departing guest reads "Activity unavailable" (name-cards.ts:86-91)      [P2: seating-5]
 town   ──► idle agents' "roaming" = 16 s venue stops through the same door          [P5: sidewalk roaming]
```

```ascii
 One street source → one crosswalk source → one sidewalk network → two kinds of walkers (Phases 3–5)

 src/shared/office/
   city-block-layout.ts ─┐
   city-access.ts ───────┼──► district-streets.ts (moved; TownRoad, widths)
                         │        │ roads[] (city streets + access lanes)
                         │        ▼
                         │    crosswalks.ts ◄── ONE source: zebra paint, stop lines, crossing edges
                         ▼        ▼
                    sidewalks.ts (pure; split at crossings, trim at sidewalk centre,
                                  one-way runs, heap-Dijkstra + cache, pedestrianGround)
                 ┌───────────────┴──────────────────────────┐
                 ▼                                          ▼
 renderer: citizen-trips, MoverLayer               sim: world-leisure.ts (REUSE: idle/done →
   pedestrianGround · breaker (stuckSec)                venue | roam loop) · FloorRoutes.sidewalkPath
   vehicles: lane centres + zebra right-of-way ◄─── roamers join the vehicles' `others`
 sim + renderer + editor preview all read LayoutMap.streets from effective-world.ts
```

## Global Constraints

These come from the owner's answers (2026-10-16) and his standing decisions, and bind every task.

**Owner behaviour rules:**

- Working agents sit at their own desks, facing the viewer at the default camera.
- An agent not actively working roams the city ("they can roam the city").
- An agent with unknown activity ("Activity unavailable") stays at its desk.
- Roamers walk the same sidewalk network as citizens.
- Nothing stops, idles or spawns on a carriageway, except on a painted zebra.

**ClearSpent:**

- Port its patterns into ClaudeWatch's own code; never import `@zkidz/ops-twin`.
- Do NOT port `camera-math.ts nearFar()`: the camera is orthographic, and depth precision is ruled out (flicker report, "Ruled out").
- Do NOT add a merge-by-material pass (clearspent-9).

**Process:**

- TDD: every task starts by copying its probe (or writing its RED test), runs it RED, then GREEN.
- Never `git stash`.
- Prettier on every changed file.
- No Claude/Anthropic text in commits or PRs.
- Commits are authored by Angelo Umali <angelo@theangeloumali.com>.
- Never touch ClearSpent-Web.
- Never start Electron dev on the real profile. Runtime checks use `node out/office-web/server.mjs --port <p>` from the branch worktree, view-only.

**Code:**

- Comments are short and only say the non-obvious why. Cite finding ids (`seating-1`) instead of narrating.

## Review Focus

These five conditions are what most likely bite Angelo, and none of the findings' probes covers them. Each is pinned by a test in its owning task.

1. **A crew turning over on a floor whose only door is also where roamers leave and return.** A dense door must still clear within 30 s. Test: Task 2.0's `door-churn.test.ts` (asserted again in Task 2.3) "clears a mixed swap with two roamers returning".
2. **The map rotated 90°/180° by the mouse.** Facades must not blink, cards must not stack at desk zoom, and seated robots keep their seat poses. Test: Task 6.2's `facade-cutaway.test.ts` "holds sides across a ±0.4° wobble at every quarter turn".
3. **Quality stepping down mid-session (full → light) while citizens and roamers walk.** No walker re-spawns on asphalt, and no stale trip set stays (citizens open question 1). Test: Task 4.4's `crowd-quality-step.test.ts`.
4. **The Office window blurred for an hour with 6 idle roamers.** React commits stay ≤ 1 per second, and the heap returns to its GC baseline. Test: Task 7.2's `pose-store.test.ts` "emits no frame while only poses change".
5. **A project folder crossing 512 transcripts while a lead is running.** The lead keeps its desk and its working state across the crossing. Test: Task 1.2's `transcript-cap.test.ts` "keeps a claimed lead across the cap".

## Assumptions (decided after the one question round; printed so nothing is silent)

| #   | Topic                    | Decision                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | seating-4                | A finished **subagent** fades out at its desk over 0.5 s and never walks out. Teammates and sessions still walk out with full clearance, and a stuck leaver fades in place after 15 s of being body-blocked (Task 2.2). **Why:** walk-outs are most of the door traffic, a non-colliding walk-out breaks 3 clearance tests (verifier E6), and the owner wants working agents at desks. |
| A2  | seating-5                | Departing teammates and sessions are carded **"Leaving"**. "Activity unavailable" stays only for live agents with no evidence. The existing `departed-worker-labels.test.ts:27,62` changes with it.                                                                                                                                                                                    |
| A3  | citizens open question 5 | City sidewalks are **one-way per side**, keeping today's keep-left sign (`trip-paths.ts:47`). Zebras are the only two-way edges, with directions ±0.75 m apart. ClearSpent's ±0.35 m two-way sidewalk is refuted: bodies need 1.25–1.45 m to pass (verifier, P3).                                                                                                                      |
| A4  | Roaming                  | It reuses `world-leisure.ts`: idle or done with fresh own evidence goes to a venue **or** a roam loop on the sidewalk network, replacing the 16 s stops. The roamer cap per quality level is set from a measured run in Task 5.1 (starting guess 8/5/3), and the reason sits next to the constant.                                                                                     |
| A5  | Facing after rotation    | "Face the viewer" is judged at the default camera. Seats stay fixed to their desks when the map rotates. Not changed.                                                                                                                                                                                                                                                                  |
| A6  | Legacy campus town       | Task 3.0 proves whether any shipped entry reaches it (OfficeApp, office-web, office:preview). If none does, it is retired with its legacy-only tests (dead-code mandate). If one does, it gets `crosswalks()` and the same network. The probe keeps only city rows; its legacy rows can never pass (citizens-7).                                                                       |
| A7  | health-7/8               | The branch is re-versioned to **1.4.1**, so the install and any later merge never sit below the published 1.4.0. Publishing still waits on Apple.                                                                                                                                                                                                                                      |
| A8  | health-11                | Before removal, every dirty worktree's WIP is exported to `<main>/.claude/archive/worktree-wip-2026-10-16/<name>.patch`. A worktree that a live process has as its cwd is skipped.                                                                                                                                                                                                     |
| A9  | health-1                 | The lead adds ignore rules. Moving the `.p12`/`.cer`/`.csr` out of the repo is **Angelo's action**.                                                                                                                                                                                                                                                                                    |
| A10 | health-13                | The host serves the world document over the feed, and pages keep only a cache, so the app window, the Browser Office and standalone ports share one city.                                                                                                                                                                                                                              |
| A11 | health-15                | The account ledger counts Codex **own + subagent** tokens, because children spend the same account's quota. Angelo can reverse this in review.                                                                                                                                                                                                                                         |

---

## Phase 0 — Baseline and guards (lead, inline; ITEM CW-HEALTH)

### Task 0.1: Signing material can never be staged (health-1)

**Files:** Modify `.gitignore`; main checkout `.git/info/exclude` (local, uncommitted); Test `src/main/build-config.test.ts`

- [ ] Write RED: `build-config.test.ts` › "ignores signing material", which reads `.gitignore` and expects lines `*.p12`, `*.cer`, `*.certSigningRequest`, `*.pem`, `*.key`, `*.mobileprovision`. Run `npx vitest run src/main/build-config.test.ts`; expect FAIL.
- [ ] Add the six patterns to `.gitignore`. Append the same lines to `/Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch/.git/info/exclude`.
- [ ] Verify: the test passes, and `git -C /Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch check-ignore -q 5KKD87VK6F.p12` exits 0.
- [ ] Commit `chore: never stage signing certificates or keys`.

### Task 0.2: The gate can go green on a loaded machine (health-9)

**Files:** Modify the 8 heavy files listed in health-9 (`seated-agents.test.ts`, `body-collision.test.ts`, `worker-city-lifecycle.test.ts`, `scale-budget.test.tsx`, `steam-frames.test.tsx`, `town-trips.test.ts`, `corporate-city/budget.test.tsx`, `samurai-ecosystem/composition-budget.test.tsx`)

- [ ] Give each heavy `describe` `{ timeout: 60_000 }`, with a one-line comment: "full sim/scene build; 5 s default fails under agent load (health-9)".
- [ ] In `samurai-ecosystem/composition-budget.test.tsx`, build the scene once and measure the 20/40/60 cases from it. Its 40 and 60 cases sit near 5 s of CPU even on an idle machine (verify-render-perf).
- [ ] Verify: `npx vitest run` → the only failures are 0 (there are no audit probes on this branch yet).
- [ ] Commit `test: heavy sim and scene suites declare their own timeout`.

### Task 0.3: Tick the stale 1.3.0 ledgers (same evidence as eb679c3 on feature/prerelease-batch)

**Files:** Modify `docs/plans/claudewatch-command-center-autostart-2026-10-11.md:28`, `docs/plans/claudewatch-prerelease-batch-2026-10-11.md:40`

- [ ] Replace both lines with the ticked text of commit `eb679c3`. Run prettier, then commit `docs(plans): tick the 1.3.0 release phases, published on 2026-10-12`.

**Phase 0 Verify:** `npx vitest run` exit 0; `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json` exit 0.

---

## Phase 1 — Bridge truth (@ravi, worktree; ITEM CW-HEALTH)

Owns `src/bridge/**`, `src/main/platform/darwin.ts`, `src/main/process-monitor.ts`, `src/main/office-interactions.ts`, `src/shared/accounts.ts` and `src/shared/platform-process.ts`.

### Task 1.1: No desktop-app helper is an agent (health-2, health-12)

**Files:**

- Create: `src/bridge/agent-cli.ts`
- Modify:
  - `src/bridge/codex.ts:50-66`
  - `src/bridge/opencode.ts` (process matcher)
  - `src/bridge/claude-process-claims.ts:16-30`
  - `src/main/platform/darwin.ts:25,63-108`
  - `src/main/process-monitor.ts:115-117`
  - `src/bridge/process-table.ts:32` (one comment line: `ps` gives no argv boundaries)
- Test: `src/bridge/__tests__/codex-helpers.test.ts`, promoted from `audit/health-codex-helpers.test.ts`

**Interfaces:**

- Produces `isAgentCli(argv0: string, platform: NodeJS.Platform): boolean`. It is false when `isInsideAppBundle(argv0)` (`process-table.ts:200`), which also catches the whitespace-truncated `…/Frameworks/Codex`.
- On upgrade the 19–20 phantoms leave their own unnamed building at once. `body-collision.test.ts` "twenty removed workers" covers that flow, and it is not the door cluster (verify-seating-bridge).
- The darwin detector caches cwd by `pid:start`, reusing `process-table.ts` `rememberedFolder` and `identityOf`, and excludes `HOST_ARGUMENT` hosts.

- [ ] Copy the probe in. Run RED: "takes no ChatGPT desktop helper process for a Codex agent" fails with 3 helpers.
- [ ] Implement `isAgentCli` and use it in the codex and opencode matchers and in `isNativeClaudeLead`.
- [ ] Add RED `process-monitor.test.ts` › "runs lsof once for an unchanged process across two polls", then the cwd cache plus `-x` plus the host-argument exclusion.
- [ ] Verify: both probe cases pass, plus `npx vitest run src/bridge src/main`.
- [ ] Commit `fix(bridge): desktop app helpers are never agents (health-2)`.

### Task 1.2: Leads in big folders are claimed, and an unclaimed lead is never "idle" (health-3, seating-6, health-6)

**Files:**

- Modify:
  - `src/bridge/claude-transcripts.ts:10,110-125`
  - `src/bridge/claude-process-claims.ts:33-40`
  - `src/bridge/claude-processes.ts:173-179`
  - `src/bridge/registry.ts:154-159`
- Test:
  - `src/bridge/__tests__/transcript-cap.test.ts` (promoted from `health-transcript-cap`)
  - `src/bridge/__tests__/resume-flag.test.ts` (promoted from `health-claims-and-retention` case 1)

**Interfaces:**

- A per-folder stat memory `{ name → mtimeMs }`. The search is complete once every name has been stat'ed once, with the existing rotation bounding each tick.
- `claudeSessionClaim(argv)` treats a following `-…` argument as value-less and returns `''`, never `null`. Its contract (`claude-process-claims.ts:32`) says a value-less claim never borrows another session (verifier: health-6's `null` would let a picker-resumed lead borrow a newer transcript). The probe asserts `toBe('')`.
- The per-folder stat memory is bounded: clear it at `MAX_HEADERS`, as `offsets.clear()` does. The single-owner check in `uniqueClaudeTranscript` is kept.
- An unclaimed native lead reports `activity: 'unknown'` with no `coverage: 'own'`, so it runs as `legacy` and stays seated. Its card must then read "Activity unavailable"; Task 2.4 (MISSED-1) fixes that.

- [ ] RED: the 600-transcript case, the flag case, and a new "an unclaimed lead carries no own idle evidence" in `transcript-cap.test.ts`.
- [ ] Review Focus 5 test: "keeps a claimed lead across the cap" (500 → 520 names mid-run).
- [ ] Implement. Verify `npx vitest run src/bridge`.
- [ ] Commit `fix(bridge): claim leads in large project folders; an unclaimed lead is unknown, not idle`.

### Task 1.3: Retention is bounded, and one bad registry file never fails a root (health-5)

**Files:** Modify `src/bridge/reducer.ts:56-66`, `src/bridge/registry.ts:183-186`. Test: `src/bridge/__tests__/source-retention.test.ts`, promoted from case 2, plus a registry case.

- [ ] RED: "lets an ended session go once its source has been failing for ten minutes" and "one malformed registry file leaves the root ok".
- [ ] Bound retention by **how long the source has been failing**: a `failingSinceMs` per source id, dropped after 10 min. Never use `updatedAtMs`, which would mass-evict quiet live sessions (verifier).
- [ ] Drop only sessions that **ended**; live unknown sessions stay seated (owner AC).
- [ ] In the registry, skip a malformed file but carry that pid's last session from `wasLive` while the file stays unparseable, so a truncated write never makes an agent depart and re-arrive.
- [ ] Verify and commit `fix(bridge): failing sources stop holding ended sessions forever`.

### Task 1.4: The OpenCode SQL is compiled once per connection (perf-4)

**Files:** Modify `src/bridge/opencode-db.ts:150-170`, `src/bridge/opencode.ts:118-183`, `src/bridge/opencode-answers.ts:12-23`. Test: `src/bridge/__tests__/opencode-prepare.test.ts` (promoted).

**Interfaces:**

- A `Map<keyof typeof OPENCODE_READ_STATEMENTS, StatementSync>` per connection.
- `newestMessages(childIds: string[])` makes one query using `IN`.
- The recall stamp uses `PRAGMA data_version`.

- [ ] RED (`expected 6 to be ≤ 2`), then implement both halves. The statement cache alone removes about 2,650 prepares per tick (≈ −30 %); the batched child query removes most of the 2,673 `all`s. Verify `npx vitest run src/bridge`, and commit `perf(bridge): prepare OpenCode statements once and batch child reads`.

### Task 1.5: Usage catch-up resumes instead of re-reading 1.95 GB (health-4, perf-9)

**Files:**

- Create: `src/bridge/usage-offsets.ts`
- Modify:
  - `src/bridge/usage-tracker.ts:33,39,56,104`
  - `src/office-host/poller-process.ts` (state path)
  - `src/main` bridge host (state path under userData)
- Test: `src/bridge/usage-tracker.test.ts` (new case)

**Interfaces:**

- `loadUsageOffsets(path): Map<file, {offset, size, mtimeMs, ino, fold}>` and `saveUsageOffsets(path, map)`.
- Each offset carries the usage **fold** and is resumed only when the inode matches and `size ≥ offset`; otherwise the file is re-read from 0 (trap "Dedupe transcript usage by file position").
- `TICK_BUDGET_BYTES` stays as it is. Lowering it alone only spreads the same 1.94 GB over more ticks (verify-render-perf). Persistence is the fix, and perf-9 is merged into health-4.

- [ ] RED: "a second tracker given persisted offsets reads 0 bytes for unchanged transcripts". Then implement, verify, and commit `perf(bridge): persist usage offsets; catch up within the poll pace`.

### Task 1.6: Peek revisions per agent; Codex subagent tokens reach the ledger (health-14, health-15)

**Files:** Modify `src/main/office-interactions.ts:79,135,167` and `src/shared/accounts.ts:43-52`. Test: `office-interactions.test.ts` and `poller.test.ts`, one new case each.

- [ ] RED: "peek of B does not fail a concurrent peek of A", and "onCodexTotals carries a child rollout's N tokens".
- [ ] Use `Map<sessionKey, number>`: the guard keeps its latest-wins meaning per agent and stops misfiring on overlapping peeks across agents. Post `own + subagents` (A11). Verify, then commit `fix: per-agent peek revisions; Codex child tokens reach the ledger`.

**Phase 1 Verify:**

- `npx vitest run src/bridge src/main src/shared` exits 0.
- A live snapshot shows 0 sessions with `cwd '/'` from `.app` helpers: run `node out/office-web/server.mjs --port 47841` with the snapshot script `/tmp/office-audit-tools/health/codex-sessions.ts`.

---

## Phase 2 — Door, departures and honest cards (@lena-sim, worktree; ITEM CW-SEAT)

Owns:

- `src/office/sim/{worker-navigation.ts, movement-recovery.ts, world.ts, placements.ts}`
- `src/shared/office/types.ts` (AgentView)
- `src/renderer/office/logic/{name-cards.ts, activity-summary.ts, workstation-displays.ts}`
- `src/renderer/office/scene/Robot.tsx` (fade only)

Corrected by `/tmp/office-audit-tools/verify-seating-bridge/VERDICTS.md`. Its experiments E1–E7 ran on a private copy, and the fix-regression register there is binding.

### Task 2.0: Churn gates that cannot be gamed (MISSED-2, MISSED-3, MISSED-4)

**Files:** Create `src/office/sim/__tests__/door-churn.test.ts`, which replaces the probes `seating-crew-churn-door`, `seating-yield-cycle` and `seating-stall-bound`, plus the verifier's `vsb-teammate-churn-door`.

**Tests:**

- Subagent churn (6 out, 6 in, every 10 s for 120 s, then 90 s quiet) → `{ stillInside: 0, unseated: 0 }`.
- **Teammate** churn, the same shape → `{0,0}`. Fading subagents can't pass it by construction.
- Crew churn **with two idle leads on city trips** through the same door → `{0,0}` (owner roam rule, MISSED-3).
- A World-level **3-body wait cycle** at a doorway clears within 10 s (replaces the unit probe, which a threshold tweak could pass).
- **Per-tick invariants** in every churn test: every same-elevation body pair stays ≥ r₁+r₂−0.02 m, and no walker steps more than 0.14 m per tick. That rules out ghosting (E6) and teleporting (E7).
- "no body is body-blocked without path progress for more than 15 s".

- [ ] Write them and run them RED: the subagent and teammate churn at `{18,6}`, the cycle never clearing, the bound never tripping. Commit `test(sim): door churn gates with clearance and step invariants`.

### Task 2.1: Wait cycles are broken; ordinary queues are kept (seating-1, corrected)

**Files:** Modify `src/office/sim/world.ts:451-514` (wait graph per tick) and `worker-navigation.ts:42-70` (returns the wait edge rather than a boolean).

**Interfaces:**

- `waitsForMovingBody(...)` returns `string | null`: the id of the body it waits on.
- Each tick, `World` builds the wait graph and finds strongly connected components. **Only the lowest id in each cycle proceeds**; non-cyclic queues keep today's behaviour.
- E1 showed a total id order breaks `worker-city-lifecycle` "40 late teammates/subagents". `passages.guide` can't break the tie, because `body-passages.ts:84-90` only takes leaders at alignment < 0.5.

- [ ] RED: the 3-body cycle test. Implement, then verify `npx vitest run src/office/sim`, including "40 late" and "sixty converging arrivals".
- [ ] Commit `fix(sim): break wait cycles at the door without reordering queues`.

### Task 2.2: A body-blocked bound that fades a stuck leaver in place; finished subagents fade at their desk (seating-2, seating-4, corrected)

**Files:** Modify `src/office/sim/movement-recovery.ts:16-64`, `world.ts:175-198`, `placements.ts:56-66` (keep the member kind on the record), and `src/renderer/office/scene/Robot.tsx` (opacity for `place: 'leaving'`).

**Interfaces:**

- `MovementRecovery` counts **body-blocked ticks**: `hasYielded` is set and the remaining path length is not shrinking. Neither `retried` nor a new waypoint resets the count. Measuring progress "to the final target" misfires on connector routes and broke 2 no-teleport tests (E7).
- At `BODY_BLOCKED_LIMIT_SEC = 15`, a `leaving` body fades out where it stands. An arriver is **never** teleported or ghosted; it clears once the blockers fade.
- A finished **subagent** fades at its desk (0.5 s opacity, then removed) and never walks out (A1).
- Teammates and sessions still walk out with full clearance. Non-colliding walk-outs break 3 `body-collision.test.ts` departure tests (E6, vault trap) and are rejected.

- [ ] RED: Task 2.0's bound and churn tests, plus "a finished subagent is gone within 1 s and never enters the lobby".
- [ ] Implement, then verify `npx vitest run src/office/sim`, with `body-collision.test.ts` unchanged.
- [ ] Commit `fix(sim): bound body-blocked walkers; finished subagents fade at their desks`.

### Task 2.3: The arrival gate ignores blocked arrivers; queued crew is drawn (seating-3)

**Files:** Modify `src/office/sim/world.ts:321-394,595-597`.

**Interfaces:**

- `hasEntryTraffic` skips an arriver that Task 2.2's bound marks as body-blocked. This is safer than admitting by door capacity, which adds bodies at the door (verifier).
- `step()` returns queued arrivals with `place: 'arriving'` at the entrance waypoint.

- [ ] RED tests: "a second session's arrival appears within 10 s with one arriver pinned", and Review Focus 1, "clears a mixed swap with two roamers returning".
- [ ] Implement, then verify Task 2.0's suite plus "sixty converging arrivals". Commit `fix(sim): one pinned arriver no longer hides the crew`.

### Task 2.4: Cards say "Leaving" for departures and "Activity unavailable" only for live agents without evidence (seating-5, MISSED-1)

**Files:**

- Modify:
  - `src/shared/office/types.ts:154-173` (`place?: 'lounge' | 'leaving' | 'arriving'`)
  - `world.ts` (sets it)
  - `src/renderer/office/logic/activity-summary.ts:20-34` (`LEAVING_LABEL = 'Leaving'`; availability also requires own observation)
  - `name-cards.ts:84-121`
  - `workstation-displays.ts:68`
  - `__tests__/activity-overview/departed-worker-labels.test.ts:27,62` (intended contract change, A2)
- Test: `src/renderer/office/__tests__/departed-card.test.ts` (promoted; asserts `detail === LEAVING_LABEL`, `isAvailable: false`, `status !== 'working'`), and `unknown-card.test.ts` (from the verifier's `vsb-unknown-card`: a live agent with no own observation reads "Activity unavailable", not "Idle")

- [ ] RED tests for both. Implement, verify `npx vitest run src/renderer/office src/office/sim`, and commit `fix(office): cards tell leaving from unknown`.

**Phase 2 Verify:**

- `npx vitest run src/office/sim src/renderer/office` exits 0.
- The replay `MODE=swap10 CHURN_S=120 npx vite-node --config vitest.config.ts /tmp/office-audit-tools/seating/replay-crew.ts 210 7` gives `stillInside 0`, `unseated 0`, `queued 0`.

---

## Phase 3 — One street source, one crosswalk source, the sidewalk network (@lena-town, worktree; ITEM CW-WALK)

Owns:

- `src/shared/office/{district-streets.ts (moved), crosswalks.ts (new), sidewalks.ts (new), town-roads.ts (moved types)}`
- `src/office/sim/{effective-world.ts, layout.ts}`
- `src/renderer/office/town/{district-streets.ts (re-export, then removed), town-roads.ts, town-grid.ts (widths moved), distributed-town.ts, road-net.ts, trip-paths.ts, town-ground.ts, use-town-plan.ts}`
- `src/renderer/office/scene/use-world-editing.tsx` (preview streets)

Corrections from `/tmp/office-audit-tools/verify-citizens-streets/VERDICTS.md`, which supersede the clearspent port map where they differ.

Before starting, read the abandoned WIP in `.claude/.worktree/citizen-motion` and `.claude/.worktree/district-roads` (health-11). Adopt nothing blind.

### Task 3.0: Retire or port the legacy campus town (A6, blocking prerequisite)

**Files:** none changed unless the check says retire. Test: none; this is a reachability check.

- [ ] Prove reachability from every shipped entry: `OfficeApp.tsx:287` (always `allFloors`), the office-web page, and `vite.office-preview.config.ts` fixtures. Check with `grep -rn "townOn\|MOVER_FLOORS\|legacy" src --include=*.ts* | grep -v test`.
- [ ] If no entry reaches it, delete the legacy campus path and its legacy-only test rows in one commit, `refactor(town): retire the unreachable legacy campus town` (dead-code mandate). If one does, it gets crosswalks from Task 3.3 and the same network. Record the result in § Results.

### Task 3.1: Reversed walks keep their width (P1, citizens-1) — lands first

**Files:** Modify `src/renderer/office/town/road-net.ts:144-146`, `trip-paths.ts:41`, `vehicle-trips.ts:127` (freight return offset). Test: `src/renderer/office/town/__tests__/pedestrian-carriageway.test.ts` (promoted from `citizens-carriageway`; **city rows only**, because the legacy rows can never pass: legacy paints no zebras, per citizens-7).

- [ ] RED: `expected undefined to be 8`, plus "freight return leg sits on its own lane offset".
- [ ] `reversed` spreads the leg. `sidePath` reads the width from the plan edge.
- [ ] Verify the geometry rows pass. Commit `fix(town): a reversed walk keeps its street width`.

The verifier refuted "width-only makes it worse": across 8 start offsets frozen events fall 107 → 68. Replay rows stay RED until Task 4.2.

### Task 3.2: One street source for the sim, the renderer and the editor preview (P2)

**Files:**

- Create: `src/shared/office/district-streets.ts` (moved, with `TownRoad`, `RoadClass`, `ROAD_WIDTH_M` and `SIDEWALK_M`)
- Modify:
  - `src/office/sim/effective-world.ts:39-48`
  - `src/office/sim/layout.ts:13` (`LayoutMap.streets: readonly TownRoad[]`, derived and never persisted, per the vault rule "Share effective venue geometry")
  - `src/renderer/office/town/distributed-town.ts:12`
  - `use-town-plan.ts:93-97`
  - `scene/use-world-editing.tsx:30` (preview `LayoutMap` carries streets)
- Test: `src/office/sim/__tests__/streets-shared.test.ts`

- [ ] RED: "LayoutMap.streets deep-equals the renderer plan's city-street roads, sorted by id", for the live layout **and** a preview layout with a dragged building.
- [ ] Move the file, emit the streets, and thread the preview path. Verify `npx vitest run src/office/sim src/renderer/office` and `effective-player-travel.test.ts` unchanged.
- [ ] Commit `refactor(shared): the sim, the renderer and the editor share one street list`.

### Task 3.3: One crosswalk source for paint, stop lines and crossing edges (citizens-4)

**Files:** Create `src/shared/office/crosswalks.ts`. Modify `src/renderer/office/town/town-ground.ts:117-200` (`streetMarkings` paints from it). Test: `src/shared/office/__tests__/crosswalks.test.ts`

**Interfaces:** `crosswalks(roads: readonly TownRoad[]): Crosswalk[]`, where `Crosswalk = { id, roadId, centre: Point, axis: 'x' | 'z', halfLength, stopLines: [Point, Point] }`. It covers junction mouths **and** access-lane mouths, and drops a band that passes a segment end, exactly as `stroke` does today.

- [ ] RED tests: "every painted zebra equals a crosswalk", and "no crosswalk band passes a segment end".
- [ ] Implement, check that the town-ground snapshot tests are unchanged, and commit `refactor(town): one crosswalk source for paint and walking`.

### Task 3.4: The sidewalk network (P3, corrected)

**Files:** Create `src/shared/office/sidewalks.ts`. Test: `src/shared/office/__tests__/sidewalks.test.ts`

**Interfaces (pure TS, node env):**

- `sidewalkNetwork(roads: readonly TownRoad[], crossings: readonly Crosswalk[]): SidewalkNetwork`.
  - Roads are **split at every crossing**, because `districtStreets` emits one road per grid line across many junctions (citizens-8).
  - Each side is one **one-way** run (A3, keeping the city keep-left sign of `trip-paths.ts:47`). The walk centre is at `width/2 − SIDEWALK_M[class]/2`.
  - Each run is trimmed at the cross street's **sidewalk centre**, `other.width/2 − SIDEWALK_M[other.class]/2`, never ClearSpent's `+0.8`.
  - Crossing edges lie on zebra centre lines, with the two directions ±0.75 m apart. Corners are filleted at radius 1.2 (ported from ops-twin `sim/lanes.ts` `filletCorners`).
- `attachDoor(network, door: Point): NodeId`.
  - A lot door is already on its run, so the hop is zero.
  - An office or venue entrance follows its access lane (`city-access.ts:84-88`), or `entranceApproach`, then a perpendicular hop to the near-side kerb node.
- `sidewalkPath(network, from: NodeId, to: NodeId): RoutePoint[] | null` is a binary-heap Dijkstra with an LRU path cache of 512 entries.
- `ambientLoops(network): RoutePoint[][]` gives one closed one-way loop per block face, ported from ops-twin `loopAlong`.
- `pedestrianGround(network, bounds): WalkGround` returns a 0.25 m A\* grid **and** a centre-sample `isOpen`. It is true on sidewalks, crosswalks, parks and plazas, and false on any carriageway. A disc test is never used, because it would close every 1 m sidewalk to a 0.55 m body.

- [ ] RED tests:
  - "no sampled point of any path or loop lies on a carriageway outside a crosswalk" (ClearSpent's 372→0 invariant)
  - "every door reaches every other door"
  - "no door hop segment intersects a carriageway quad"
  - "a street is crossed only along a crosswalk edge"
  - "every sidewalk run is connected on pedestrianGround's grid"
  - "two directions never share a run"
  - "network build + 48 citizen paths < 50 ms" (budget)
- [ ] Implement, verify `npx vitest run src/shared/office`, and commit `feat(shared): a sidewalk network ported from ClearSpent city-life routes`.

### Task 3.5: Vehicles at lane centres (P6, clearspent-4)

**Files:** Modify `src/renderer/office/town/trip-paths.ts:46` (**city branch only**; `KEEP_RIGHT_M.vehicle` stays for `fallback-vehicles.test.ts:7,29`). Test: `pedestrian-carriageway.test.ts` (live-city row; `town-trips.test.ts:110` runs legacy).

- [ ] RED: "mid-block city vehicle samples sit within 0.3 m of a lane centre, never within 0.3 m of the divider" (fails 2,555/2,781).
- [ ] Magnitudes: avenue `0.25 / 0.75 · halfCarriageway`, collector `0.5·`. **Keep the keep-left sign**: ClearSpent's `DRIVE_OFFSET` is right-of-travel, so port the magnitude only.
- [ ] Verify, then commit `fix(town): vehicles drive lane centres, not the divider`.

**Phase 3 Verify:** `npx vitest run src/shared/office src/office/sim src/renderer/office/town` exits 0, except the promoted replay rows, which are expected RED until Phase 4.

---

## Phase 4 — Citizens on the network (@lena-town, after Phase 3; ITEM CW-WALK)

Owns:

- `src/renderer/office/town/{citizen-trips.ts, trip-paths.ts (citizen branch), vehicle-trips.ts}`
- `src/renderer/office/citizens/**`

### Task 4.1: Citizens route on the network and walk the pedestrian ground (citizens-3, -5, P4)

**Files:**

- Modify:
  - `citizen-trips.ts:120-126` (`walkBetween` → `sidewalkPath`, with doors via `attachDoor`)
  - `trip-paths.ts:13-53` (remove the citizen branch of `KEEP_RIGHT_M`/`besideOf` once Task 3.0 settles legacy)
  - `MoverLayer.tsx:59,95,123-124` (a full `pedestrianGround`, grid and `isOpen`; the player keeps `walkGround`)
  - `crowd-movement.ts:49,84-101`
  - `citizen-navigation.ts:58-80`
- Test: `pedestrian-carriageway.test.ts`, the city route rows

- [ ] RED: "keeps every citizen route off unmarked asphalt", with the `leave-home/*`, `arrive/*`, `*/mouth` and `*/junction` parts all at 0.
- [ ] Implement, verify, and commit `fix(citizens): walk the sidewalk network and cross on the zebras`.

### Task 4.2: A deadlock breaker whose timer survives replans (citizens-2, corrected)

**Files:** Modify `src/renderer/office/citizens/citizen-navigation.ts:83-110`. Test: `pedestrian-carriageway.test.ts`, the city replay rows

**Interfaces:**

- `advanceNavigation({ ..., ground: WalkGround, priority: number })`.
- The navigation state gains `stuckSec`, which accumulates while `distance === 0` and is **not** reset by the 0.75 s replan (`:103,:108`).
- After `STUCK_YIELD_SEC = 1.5`, the lower-priority walker backs along its own route on `ground`. If it can't, the pair pass through each other.
- Opposing meets happen on join and crossing segments, not on parallel same-direction lines (verifier correction).

- [ ] RED: "never leaves a citizen standing on asphalt" (`stillOnRoadEvents 0`, `spawnedOnRoad 0`).
- [ ] Implement, verify, and commit `fix(citizens): blocked walkers yield on the sidewalk instead of freezing`.

### Task 4.3: Zebra right-of-way; vehicles stop holding mid-block (citizens-6, P6b)

**Files:** Modify `src/renderer/office/citizens/route-pose.ts:164-173`, `MoverLayer.tsx:102-138` (roamers join the vehicles' `others`), `town/vehicle-trips.ts` (stop-line events from `crosswalks()`). Test: `pedestrian-carriageway.test.ts` (new row)

**Interfaces:**

- A vehicle holds at a crosswalk's stop line while any walker, roamer or the player is on its zebra, or within 1 m of it. This includes **turn-outs** onto the exit road's zebra.
- A walker waits at the kerb node while a vehicle is inside the stop band.
- Nose-point holding is removed.

- [ ] RED tests: "no vehicle–walker pair closer than 1.2 m", "heldByRoadWalkerSec 0" (was 1,045 s, 9.7% of vehicle time), and "a turning vehicle yields to a walker on the exit zebra".
- [ ] Implement, verify, and commit `fix(town): vehicles give way at zebras`.

### Task 4.4: Ambient loops and a stable crowd across quality steps (citizens-8, Review Focus 3)

**Files:**

- Modify: `MoverLayer.tsx:68-100`, `crowd-movement.ts`
- Create: `src/renderer/office/town/pedestrian.test-utils.ts` (helpers moved out of the probe, citizens-7)
- Test: `crowd-quality-step.test.ts`
- Not done: perf-8's single obstacle list per frame. It costs tens of µs per frame (verify-render-perf); don't spend the 2 h.

- [ ] RED tests:
  - "a share of the citizen budget walks ambientLoops"
  - "full → light mid-walk keeps no stale trip and spawns nobody on asphalt"
- [ ] Implement, verify `npx vitest run src/renderer/office`, and commit `feat(citizens): ambient sidewalk loops and a stable crowd across quality steps`.

**Phase 4 Verify:**

- `npx vitest run src/renderer/office/town/__tests__/pedestrian-carriageway.test.ts` → all city rows green: asphalt samples 0, frozen-on-road 0, road-walker holds 0.
- The 8-offset replay `npx vite-node /tmp/office-audit-tools/verify-citizens-streets/robust.ts` → 0 frozen-on-road events at every offset (was 107).

---

## Phase 5 — Roaming agents (@lena-sim, after Phases 2 and 3; ITEM CW-ROAM)

Owns `src/office/sim/{world-leisure.ts, world-floor-routes.ts, roaming.ts (new)}`. It **reuses** the leisure system rather than adding a `behaviour.ts` state (verifier P5a).

### Task 5.1: Idle or done roams the sidewalks; unknown stays; working returns (P5, corrected)

**Files:**

- Create: `src/office/sim/roaming.ts`
- Modify:
  - `world-leisure.ts:46-161` (a "roam" destination, i.e. an ambient loop, inside `reconcileLeisure`, beside venues; it replaces the fixed 16 s stops)
  - `world-floor-routes.ts` (a **new** `sidewalkPath(from, to)` method used by leisure only)
- Keep `street()` for ground arrivals (`toFloor`, `:147-149,207-212`) unchanged, per the vault traps "Ground-floor arrivals need direct doorway routes" and "bounded arrival/departure regressions".
- Test: `src/office/sim/__tests__/roaming.test.ts`

**Interfaces:**

- `ROAMER_CAP: Record<QualityLevel, number>` sits next to `MOVER_COUNTS`. Its values are **set from a measured run**: Task 5.1's budget test measures door clearance and avoidance cost at 4/8/12 roamers and picks the largest that keeps the Review Focus 1 door test under 30 s. The comment states that.
- `planRoam(agent, network, rng): RoutePoint[]`.
- Roamers obey the same one-way direction rule as citizens (A3), because roamers (sim) can't see citizens (renderer).

- [ ] RED tests:
  - "idle with own evidence is on a sidewalk loop within 20 s"
  - "unknown activity never leaves its desk"
  - "working evidence returns it to its own desk within 60 s"
  - "no roamer sample on a carriageway outside a crosswalk"
  - "roamers walk with their run's direction"
  - "roamers ≤ ROAMER_CAP[level]"
- [ ] Implement, then verify `npx vitest run src/office/sim`, including `venue-bookings.test.ts`, the body-collision and worker-departure-recovery suites unchanged.
- [ ] Commit `feat(sim): idle agents roam the city on the sidewalk network`.

### Task 5.2: Ground arrivals move onto the network, guarded (verifier P5b)

**Files:** Modify `world-floor-routes.ts:147-149,207-212`. Test: the seating churn replay as a regression, plus Task 2.0's `door-churn.test.ts`.

- [ ] Switch `toFloor` ground legs to `sidewalkPath` only after Phase 2's door replay is green. Re-run `MODE=swap10 CHURN_S=120 … replay-crew.ts 210 7` → `stillInside 0`. If it regresses, leave arrivals on `street()` and record why in § Results.
- [ ] Commit `fix(sim): agents reach their building along the sidewalks`.

**Phase 5 Verify:**

- `npx vitest run src/office/sim src/renderer/office` exits 0.
- A live 10-minute capture (`/tmp/office-audit-tools/seating/long-capture.mjs` on port 47851) shows idle agents on sidewalks, 0 working or unknown agents off their desks, and 0 roamer samples on a carriageway.

---

## Phase 6 — Render fixes (@lena-render, worktree; ITEM CW-FLICK)

Owns:

- `src/renderer/office/scene/{building-window-parts.ts, operational-parts.ts, BuildingWindows.tsx, OperationalStructure.tsx, PhysicalBuildingShell.tsx, CardProjector.tsx, RenderLoop.tsx}`
- `src/renderer/office/logic/{facade-cutaway.ts (new), card-culling.ts}`
- `src/renderer/office/SceneErrorBoundary.tsx`

### Task 6.1: Every facade, crown and entrance layer on its own plane (flicker-1, P7 corrected)

**Files:** Modify `building-window-parts.ts:35-125`, `operational-parts.ts:85-109`, `themes/physical-building-parts.ts:144-156,223` (roof slab and parapet ends; theme crowns). Test: `scene/__tests__/facade-coplanar.test.ts` (promoted from `flicker-coplanar-facade`, plus a crown/entrance case over `listThemes()` × 4 recipes).

**Interfaces:** `FACADE_LAYER_STEP_M = 0.005`. Layers grow **symmetrically**, proud on both faces:

- glass: `facadeDepth − 2·step`;
- bands: `facadeDepth`;
- mullions and end frames: `+2·step`;
- transom and top frame: `+4·step`.

Two corrections from verify-render-perf:

- **Never translate parts along the normal (ClearSpent P7).** The Office shows the far walls' inner faces, and a translated part would hide the interior frame lines.
- **The top band stays continuous.** A step below the storey top leaves a hairline seam at desk zoom. Resolve the `max-y` ties by lowering the secondary parts instead: beam, column and mullion tops at `storey − step`.

- [ ] RED tests:
  - the 4 recipes, which today give 276/405/305/505 tied pairs;
  - crowns, with 8 ties on every building in every theme and 9.9 m² on cyberpunk split-lantern;
  - the service-ribs entrance, with 3 ties.
  - GREEN control: "no vertical gap between consecutive storeys' bands".
- [ ] Implement. Verify the tests and that `building-window-budget.test.ts` stays green. Commit `fix(scene): facade, crown and entrance layers never share a plane`.

### Task 6.2: Cutaways decide by view direction, with hysteresis (flicker-2, Review Focus 2)

**Files:** Create `src/renderer/office/logic/facade-cutaway.ts`. Modify `BuildingWindows.tsx:44-56`, `OperationalStructure.tsx:46-53`, `PhysicalBuildingShell.tsx:78-88`, `CitySceneryCutaway.tsx:60-69`. Test: `scene/__tests__/facade-cutaway.test.tsx` (promoted, plus quarter-turn and pushBack cases).

**Interfaces:** `facadeSideOpen(forwardDotNormal: number, wasOpen: boolean | null): boolean` opens above `+0.08`, closes below `−0.08`, and otherwise keeps the previous state.

- On mount (`null`) it initialises from the sign.
- Using the view direction rather than the camera position removes both the pan trigger and the `Horizon` pushBack trigger (`Horizon.tsx:26-31`).
- `CitySceneryCutaway` keeps its lower/upper split; never hide whole sectors (trap "retain street-level neighborhood mass").

- [ ] RED tests:
  - "a 0.4° wobble keeps the same sides";
  - "holds sides across a ±0.4° wobble at every quarter turn";
  - "a Horizon pushBack alone flips no side";
  - "upper city lots don't blink at the boundary".
- [ ] Implement, verify, and commit `fix(scene): facades and city lots stop blinking at the cutaway boundary`.

### Task 6.3: Collision-only culling at desk zoom, with a visible cap (clearspent-3, P9 corrected)

**Files:** Modify `CardProjector.tsx:229-237`, `logic/card-culling.ts:62`. Test: `scene/__tests__/card-projector-desk.test.tsx`

**Interfaces:** `cullCards(candidates, safeArea, { stackProjects: boolean, cap: number })`.

- The desk band passes `stackProjects: false`. Project stacking at desk zoom would collapse the working neighbours Angelo is looking at.
- The cap is `12`, or `6` at `light`, shown with a "+N" count so it never becomes a silent limit.
- The selected card always wins.

- [ ] RED tests: "two robots 0.5 m apart at zoom 90 show one card and one dot"; GREEN control: "two working agents at adjacent desks whose cards don't overlap at zoom 55 both keep their cards".
- [ ] Implement, verify, and commit `fix(cards): cull overlapping name cards at desk zoom`.

### Task 6.4: A lost GL context gets a grace period before the List view (P8 corrected; perf-10 refuted)

**Files:** Modify `src/renderer/office/SceneErrorBoundary.tsx:9-17` (a capture listener on a wrapper; ported from ops-twin `scene-boundary.tsx:50-76`). Test: `__tests__/scene-context-loss.test.tsx`

**Interfaces:**

- On `webglcontextlost`, keep the 3D view and start `CONTEXT_GRACE_MS = 4000`.
- A `webglcontextrestored` cancels the timer and calls `invalidate()`; three already re-initialises GL (measured: draws 30 → 0 → 180).
- Only when no restore arrives does `onError` show the List view.

- [ ] RED tests: "lost then restored within the grace period stays in 3D", and "lost with no restore past the grace period shows the List view with the agent count unchanged".
- [ ] Implement, verify, and commit `fix(office): fall back to the List view only when the GL context stays lost`.

### Task 6.5: Render stats on the canvas (P10)

**Files:** Modify `scene/RenderLoop.tsx:114-121`. Test: `scene/__tests__/metrics-dataset.test.tsx`

- [ ] RED: "canvas.dataset.drawCalls and sampledAtMs are numbers after one frame". Write them at 1 Hz, only changed keys (ported from ops-twin `telemetry-dataset.ts`); `sampledAtMs` marks stale stats from a hidden window.
- [ ] Verify, then commit `feat(scene): render stats readable from the canvas`.

**Phase 6 Verify:**

- `npx vitest run src/renderer/office` exits 0.
- `/tmp/office-audit-tools/flicker/idpass.mjs` on port 47861 reports ≈ 0 changed px under the plane sweep, against 1,408 before.

---

## Phase 7 — Performance (@lena-perf, after Phases 2, 4, 5, 6; ITEM CW-PERF)

Owns:

- `src/renderer/office/scene/{OfficeScene.tsx, BatchedScene.tsx, mesh-batches.ts, use-scene-floor-data.ts, VenueLayer.tsx, Robot.tsx, MultiFloorLayer.tsx}`
- `src/renderer/office/town/TownView.tsx`
- `src/renderer/office-live/**`
- `src/renderer/office/{use-office-model.ts, use-office-effects.ts}`
- `src/office/sim/effective-world.ts` (memo)
- `src/office-host/office-service.ts`
- `src/office-web/routes.ts`

### Task 7.1: Per-side static batches inside the cutaway groups; a small dynamic batch (perf-1 corrected)

**Files:** Modify `OfficeScene.tsx:278`, `BuildingWindows.tsx`, `OperationalStructure.tsx`, `PhysicalBuildingShell.tsx` (each side wraps its own `<BatchedScene isStatic>`), `mesh-batches.ts:140-158`, `VenueLayer.tsx:29`, `TownView.tsx:191`. Test: `scene/__tests__/mesh-batches-dirty.test.ts` (promoted `perf-mesh-batches` cases 1–2, plus a visibility control).

**Interfaces:**

- The pattern already used by `CitySceneryCutaway.tsx:73-85`: each facade side, structure side and the entrance get a static batch inside the group the cutaway toggles. A parent's `visible` then hides the InstancedMesh with no per-frame work.
- Robots, eased room walls (`BandedWalls.tsx:31-40`) and theme ambients stay in a small **dynamic** batch. Marking the whole floor `isStatic` would freeze robots, walls and cutaways (verify-render-perf).
- `updateMeshBatches` writes only sources whose `matrixWorld` **or visibility** changed, and uploads with `instanceMatrix.addUpdateRange`.

- [ ] RED tests: `expected 3 to be 1`, plus "a side hidden by the cutaway is hidden in the batch on the next frame" and "a robot moved this frame is drawn at its new place".
- [ ] Implement, verify `npx vitest run src/renderer/office/scene`, and commit `perf(scene): static batches per facade side; upload only moved instances`.

### Task 7.2: Motion leaves React; React frames are coalesced (perf-2 corrected, perf-7, Review Focus 4)

**Files:**

- Create: `src/renderer/office-live/pose-store.ts`
- Modify:
  - `live-feed.ts:44,234-260`
  - `use-office-model.ts:23-44`
  - `use-office-effects.ts:17`
  - `scene/Robot.tsx:93-120`
  - `scene/MultiFloorLayer.tsx`
  - `logic/zone-model.ts:148` (activity reads a `now` tick, not `Date.now()`)
- Test: `__tests__/pose-store.test.ts`, and `office-lists.test.tsx` (promoted `perf-office-lists`, with `activity` **removed** from the stable set because it is clock-dependent)

**Interfaces:**

- `createPoseStore(): { write(key: string, pose: AgentPose): void; read(key: string): AgentPose | undefined; version(): number }`.
- The sim keeps its 100 ms steps; larger blurred steps risk arrival and departure tunnelling (trap).
- React frames are emitted only when `structuralKey(agents)` changes, and are coalesced to the governor's rate while blurred.
- `buildOfficeActivity` gets its own `useNow` tick (trap "Evaluate newly received evidence with the render clock").

- [ ] RED tests: "keeps every position-independent list when only agent positions change"; "emits no frame while only poses change"; "activity still turns stale with no new frame".
- [ ] Implement, verify, and commit `perf(office): agent motion runs through a pose store, not React`.

### Task 7.3: Batch keys are cached; selection re-tints without a rebuild (perf-3 corrected)

**Files:** Modify `mesh-batches.ts:53-126`, `use-scene-floor-data.ts:104-139`. Test: `mesh-batches-dirty.test.ts` (promoted case 3, with a `releaseMeshBatches` between the two builds).

**Interfaces:**

- A `WeakMap` key cache built from geometry and material type plus parameters, with no `toJSON`.
- Add a **re-tint path** first: `retintBatches(batches, tints)` uses `setColorAt` and `instanceColor.needsUpdate`. Only then can `selectedAgentKey` and `speakingAgentKey` leave the revision; tint is written only at build today (`mesh-batches.ts:115`).
- `rosterKey` stays in the robot batch's revision, because a robot that changes room is re-parented.

- [ ] RED tests: `expected 6 to be ≤ 1` after the probe fix, and "selecting an agent re-tints without a rebuild".
- [ ] Implement, verify, and commit `perf(scene): rebuild batches without serialising meshes`.

### Task 7.4: Pin and memoise world validation; prewarm shaders (perf-5, perf-6 corrected)

**Files:** Modify `office-live/live-feed.ts:107-115,197-219`, `office/sim/effective-world.ts:21-29`, `OfficeScene.tsx:236-247`. Test: `live-feed.test.ts`, `office-scene-settings.test.tsx`

- [ ] First, pin the field that churns: diff two consecutive `base` JSONs on a token-only message. The key is content-based, so `structuredClone` is not the cause. Then key the layout cache on the geometry plus the `sessions` fields `resolveEffectiveWorld` reads (that latent gap is fixed in the same change).
- [ ] Shaders: `onCreated` calls `gl.compileAsync(scene, camera)` after mount and on a view switch. **Keep `checkShaderErrors` on**; turning it off makes a shader failure silently black.
- [ ] RED tests: "a token-only message does not re-run validateWorldDocument", and "a view switch links no new program after prewarm". Implement, verify, and commit `perf(office): memoise world validation and prewarm shaders`.

### Task 7.5: One world document per host (health-13, A10)

**Files:** Modify `src/office-host/office-service.ts`, `src/office-web/routes.ts`, `src/renderer/office-live/{world-document-store.ts, browser-storage.ts}`, `src/renderer/office/main.tsx:32`. Test: `live-feed.test.ts` (new case).

- [ ] RED: "two feeds with different storages but one host see the same saved document".
- [ ] The host persists the document and serves it in the hello; page storage becomes a cache. Verify, then commit `fix(office): one saved city per host`.

**Phase 7 Verify:**

- `npx vitest run` exits 0.
- `cd /tmp/office-audit-tools/perf && node page-probe.mjs 47871 run-after --measure-s 30` shows Office upload p50 < 100 kB per frame (was 1,104,320 B) and React commits ≤ 1/s with idle roamers (was 10.6/s).

---

## Phase 8 — Release and repo hygiene (lead, inline; ITEM CW-HEALTH)

### Task 8.1: One version line and an honest updater (health-7, health-8, A7)

**Files:** Modify `package.json:3` (→ `1.4.1`), `src/main/auto-updater.ts:62-74`, `src/renderer/hooks/useUpdater.ts` (new status), `src/main/build-config.test.ts`. Test: `auto-updater.test.ts`, `build-config.test.ts`

- [ ] RED tests: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND on win32 surfaces `unavailable-for-platform`", and "package.json version ≥ highest published v\* tag" (fixture list).
- [ ] Implement, verify, and commit `fix(release): 1.4.1 keeps one version line; Windows reports a missing feed`.

### Task 8.2: Main-checkout noise and stale worktrees (health-10, health-11, A8)

Done in the main checkout. Nothing here is committed on this branch.

- [ ] Run `git -C <main> diff --summary | awk '/mode change 100644 => 100755/{print $NF}' | (cd <main> && xargs chmod 644)`, then verify `git -C <main> diff --summary | grep -c 'mode change'` prints `0`.
- [ ] For each dirty `.claude/.worktree/*` and `agent-af8a47e1b24452f40` that has no live process cwd inside it (`lsof +D` empty):
  - write `git -C <wt> diff HEAD > <main>/.claude/archive/worktree-wip-2026-10-16/<name>.patch` and tar its untracked files into the same folder;
  - then run `git worktree remove --force <wt>`.
- [ ] Run `git worktree remove` on the 34 clean merged agent worktrees. Verify that `git worktree list` shows only main, office-audit, office-health and any live worktree.

**Phase 8 Verify:** `npx vitest run src/main` exits 0; the main checkout shows 0 mode changes; the archive folder holds one patch per removed dirty worktree.

---

## Phase 9 — Integration, live re-measure, local install (lead; ITEM CW-HEALTH)

- [ ] Merge the phase branches into `fix/office-health-2026-10-16` with `--no-ff`.
- [ ] Gate chain, each exiting 0:
  - `npx prettier --check` on changed files
  - `npx eslint .`
  - both `tsc` projects
  - `npx vitest run`
  - `npx knip --no-progress`
  - `npm run build`
- [ ] Live re-measure on real data:
  - Start `node out/office-web/server.mjs --port 47891` (view-only).
  - Re-run the auditors' scripts: the seating churn replay (`stillInside 0`), the citizens live capture (0% of citizen samples on the carriageway, was 59.6%), the flicker plane sweep (≈0 px), and the perf page probe (numbers above).
  - Record them in `docs/plans/claudewatch-office-health-2026-10-16.md` § Results.
- [ ] Local install (memory recipe, release-prerequisites):
  - Use a physical `node_modules` copy, per the vault trap on signed packaging.
  - Run `npm run build && npm run build:widget`, then `electron-builder --mac dir --arm64 --publish never -c.mac.notarize=false`, signed with the Developer ID identity.
  - Quit the app, move the old bundle to `~/Applications/ClaudeWatch-1.3.5-before-office-health.app`, `ditto` the new one to `/Applications`, and run `codesign --verify --deep --strict`.
- [ ] Measure the installed renderer CPU, unfocused, over 60 s: `bash /tmp/office-audit-tools/perf/sample-procs.sh` (was 56.9%).
- [ ] **STOP.** Tell Angelo the build is installed, with the before/after table, and wait for his look.

**Phase 9 Verify:** all gates exit 0; `codesign --verify --deep --strict /Applications/ClaudeWatch.app` exits 0; the four live measures are recorded.

## Phase 10 — After Angelo approves (lead + Wave 2)

Steps:

- `/simplify`.
- Wave 2 review: Maya + Kai at risk 2, because the bridge process detection and the host-served world document touch the office-web routes.
- `bash ~/.claude/hooks/codex-review.sh`.
- The reuse audit.
- `bash ~/.claude/hooks/dead-code-check.sh`.
- `~/Desktop/eor-feature-checklists/CW-OFFICE-HEALTH-review-checklist.md`.
- The MP4 demo via `Skill(zkidzdevteam:demo-recording)`, into the repo-root `recordings/`, frame-verified. It shows agents seated, roamers on sidewalks, citizens on zebras, still walls while rotating, and the CPU before/after.
- `bash ~/.claude/hooks/vault-append.sh`.
- On Angelo's word: push, then a PR stacked on `release/1.3.5` (draft #12) whose body carries `**Tickets — none (owner audit 2026-10-16; issues to file on his word)**`. Then file GitHub issues for CW-\* and mark them.

## Estimates (hours: with Claude / without)

| Phase                                              | With      | Without   |
| -------------------------------------------------- | --------- | --------- |
| 0 Baseline and guards                              | 1         | 2         |
| 1 Bridge truth                                     | 16        | 40.5      |
| 2 Door, departures and honest cards                | 12        | 33        |
| 3 Streets, crosswalks and sidewalk network         | 14        | 42        |
| 4 Citizens on the network (+ zebra right-of-way)   | 17.5      | 50        |
| 5 Roaming agents (+ guarded arrivals)              | 8         | 26        |
| 6 Render fixes (+ crowns, entrances, city cutaway) | 9         | 24        |
| 7 Performance                                      | 23.5      | 71        |
| 8 Release and repo hygiene                         | 3.5       | 7.5       |
| 9 Integration and install                          | 4         | 10        |
| 10 Close after approval                            | 6         | 16        |
| **Total**                                          | **116.5** | **322.5** |

Phases 1, 2, 3 and 6 run in parallel, as do Phases 4 and 5. Wall-clock with the team runs about 40–45 % of the "with" column.

## Results

Filled in Phase 9.
