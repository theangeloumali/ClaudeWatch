# Mac 1.3.5 full-build release

Status: **signed local 1.3.5 installed and reopened; public release and main merge blocked by Apple's pending agreements.** Draft PR #12 contains the complete source. Angelo requested installation, release and merge to main at 1.3.5, then selected **Full build (Recommended)**: the verified Office/city build with minimap, OpenCode selected-model facts, citizen-boundary and venue-canopy corrections. The original dirty checkout and private signing files remain untouched.

| Ticket              | Status                                                         | Source link                                           | Conversation                                                                |
| ------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| none — needs filing | Draft PR #12; local installation verified; public release held | https://github.com/theangeloumali/ClaudeWatch/pull/12 | "okay install and release this and merge this to main this should be 1.3.5" |

## Release contract

- Release **Mac 1.3.5** from the complete verified feature source `3c82863a4f734f6732226f7e53ef73a36639385e`, reconciled with current main `fb96d9cc720b75c4ba1e0f61872b1b09bcf3f88f`.
- Main contains newer Windows support. Preserve it, its provider/session fixes, tray/resources and terminal restrictions. Do not replace current main wholesale with an older feature branch.
- GitHub's default/latest release is Mac v1.3.0. Windows-only v1.4.0 is published but not the default. Publish v1.3.5 as the next Mac/default release without deleting or rewriting v1.4.0, its tag or assets. Do not ship a Windows downgrade.
- Change only release metadata, integration conflicts and necessary proven release defects. No project dependency upgrade, new UI design, provider-control action, login flow or schema migration.
- Build with the current Developer ID team 7QZW432V8B. Verify real signatures and notarization/Gatekeeper before public distribution; missing notarization access is an external blocker, never a reason to silently claim notarization or bypass a failing gate.
- Prepare artifacts locally with publication disabled. Verify both Mac architectures and update metadata/hashes. Never auto-publish from a build script before review.
- Back up the immediate installed app and canonical data before replacement. Install the exact verified arm64 release artifact, preserve saved settings/layouts/identity and reopen normally. Reuse the tested journal/supervisor/rollback discipline.
- Apple-access blocker confirmed by Angelo: "nah I dont have that, Im still waiting for it tobe updated the agreements is taking too long". ASSUMPTION: finish the authorized local installation with a verified Developer ID-signed 1.3.5 build while Apple's agreement processing blocks notarization. Never describe that build as notarized or publicly released. Public publication, release tag and main merge remain gated; prepare a blocked draft PR only after the complete source is verified. Signing configuration remains unchanged, and notarization/Gatekeeper failure is recorded rather than bypassed.
- Push the complete release branch, open the complete PR, merge to main, tag the verified main commit and publish assets. Authorization is explicit for this chain. No force push, history rewrite or direct protected-branch push.

## Acceptance criteria / product brief

### Validated missing-Claude-worker blocker

Validated: `node /Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch/recordings/release-1.3.5-2026-10-15/reproduce-claude-discovery.cjs` returns **reproduced**. The installed-source collector returns only three older Claude registry sessions, while live resumed process 60345 owns session `dd4b3ece-31f8-4994-9914-57d4cc5dc03c` and fifteen eligible Lena/Ravi/Jordan child transcripts. Live ClearSpent process 55368 is also omitted. Both have real current transcripts but no matching per-PID registry JSON. The installed ASAR/source hash is unchanged from correction source `4b97680`.

Root cause: `src/bridge/registry.ts:151–183` discovers lead sessions only from `root/sessions/<pid>.json`; `src/bridge/poller.ts:94–105` provides the process table but there is no native-Claude process fallback. As a result all children of an unregistered lead disappear before rendering, while source health still says live. The release is held until live process-backed discovery and executable count/identity regressions cover this path. Preserve registry-proven sessions, process ownership/start identities, child liveness and no-duplicate rules; do not invent completed workers, modify CLI settings/hooks, or scan entire transcripts/databases.

| Ticket              | Status                                    | Source link                                           | Conversation                                                                                                  |
| ------------------- | ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| none — needs filing | Fixed and locally installed; draft PR #12 | https://github.com/theangeloumali/ClaudeWatch/pull/12 | "I notice an issue where I do have a lot of Claude agents but it's not fucking showing on the fucking office" |

Add a test-first native process fallback using existing process/folder/transcript discovery primitives. Test resumed leads without registry, a fresh native CLI process, source start/PID identity, shared-folder claim isolation, empty/missing registry, completed-child exclusion and duplicate avoidance when a registry later appears. Verify the same live PropApp process and its eligible child identities reach both feed and scene before the release proceeds. This is a reproduced correctness fix inside the approved full release, not a new provider integration.

Self-review validation: `anonymous-owner-ambiguity-red.log` reproduces two failed ownership regressions while the previous 23 pass. `claude-processes.ts:162–169` greedily chose fresh transcripts when multiple anonymous native processes shared a cwd. Keep those real processes visible, but attach no guessed conversation/children while ownership is interchangeable; explicit resume/registry claims and already proven unique claims remain usable. This closes the shared-folder claim-isolation acceptance criterion before review.

Resolved: all 33 discovery cases now pass. `src/bridge/claude-process-claims.ts` is the bounded ownership-policy helper permitted during remediation; it keeps the three production discovery modules under 200 lines. Unknown competitors, incomplete/unreadable metadata and interchangeable conversations never establish a new anonymous claim. Explicit and existing registry claims retain priority.

### Validated independent-review corrections

Validated: `npx vitest run src/bridge/__tests__/codex-child-observations.test.ts src/bridge/__tests__/live-city/source-observation.test.ts --maxWorkers=1 --minWorkers=1 --silent` reproduces **four failures, ten passes**, saved in `independent-findings-red.log`. These are the independent review's one high and one medium finding, not accepted assumptions.

- Hosted Codex roots are removed by `src/bridge/codex.ts:388–395` before explicit live descendants can attach at `codex-subagents.ts:59–60`; on cold start, a quiet/completed parent with a fresh running child disappears. Evaluate bounded explicit live lineage before hosted-root pruning, retaining only a proven parent container. Keep stale/completed/orphan/cyclic children excluded and preserve observation age and per-thread usage.
- `src/bridge/reducer.ts:48` retains missing workers when PID/start and stable key match even if the provider or conversation changed. Require both provider and session ID to match before merging workers, preserving same-conversation failure recovery.

Additional validation of that same identity defect: `conversation-done-identity-red.log` reproduces a new conversation receiving the previous conversation's `done` badge at `reducer.ts:20–25`. Apply the complete provider/conversation/process identity guard to both worker retention and completion transitions; a same-conversation failure must still retain its workers.

The Codex collector/child-observation correction and its tests are one isolated backend slice. The reducer identity guard and its source-observation tests are an independent primary-owned slice; they run in parallel and join before focused/full verification, simplification, audits and the one allowed independent-review rerun. Public-release boundaries remain unchanged.

Remediation verification: the hosted-child suite now has 25 passing cases, source-observation recovery has eight, and the complete bridge/Office-service run passes 560 tests. The rebuilt full suite passes **5,006 tests, zero failures, 18 platform-specific skips**; lint, both typechecks, native/web builds and refreshed native/desktop/mobile runtime checks pass. QA/security approved the bounded remediation; the independent working-tree rerun and final release-branch review both approved with no blocking findings.

The owner receives one installed Mac version 1.3.5 with the previously verified city, eight themes, single-storey defaults, saved authored layouts, minimap and provider/model facts. Venue canopies no longer cover office workers, and Hide roofs includes awnings. Existing Windows behavior remains in main. Users can download authenticated, signed/notarized Mac installers, and update metadata points at artifacts with matching version, size and hashes. GitHub main, the release tag, package version and shipped source agree. No credentials, private profiles, local recording code or generated media enter the PR.

## Whole-release phase ledger

- [x] Phase 1 — baselines and approved full-build scope recorded; isolated `release/1.3.5` starts from current main `fb96d9c`. Verify: original HEAD/diff captured, Windows v1.4.0 retained and API confirms default release v1.3.0. Installed package remains correction source `4b97680`. Signing assessment and read-only notarization probe recorded; credentials are not yet usable (HTTP 401), so public publication stays gated.
- [x] Phase 2 — complete verified functional delta integrated onto current main; all eleven conflicts resolved; package/lock are 1.3.5 with all 733 dependency entries unchanged. Release notes explicitly identify the Apple-blocked local build. Verify: 33 native-discovery regressions and 127 focused discovery/registry/Orca/Office-service tests pass, including the 15-child reproduction and shared-cwd ownership safeguards; focused Windows provider tests pass. No private signing files or local media are staged.
- [x] Phase 3 — simplification, reuse/scope/type audits and strict dead-code scan pass. Verify: lint, both typechecks, 5,006 tests (zero failures; 18 platform-specific skips), native/web builds and refreshed native/desktop/mobile runtime checks pass. QA/security approved the original source and bounded remediation; the independent-review rerun approved with no blocking findings. Saved-layout, roof, minimap, model-fact and Windows regressions remain covered. Signing and actual installation are separate, uncompleted candidate gates.
- [ ] Phase 4 — build signed/notarized arm64 and x64 Mac DMG/ZIP artifacts locally with publication disabled; validate version/ASAR/runtime/widget, artifact hashes and update manifests. Verify: actual signatures and notarization/Gatekeeper checks pass; candidate runs with isolated copied data.
- [ ] Phase 5 — push release branch and complete PR, merge to main through GitHub, fetch/verify merged tree, tag its exact commit, install the matching arm64 artifact with immediate verified backups, publish v1.3.5 and verify downloads/update manifests. Verify: installed About/runtime version 1.3.5, normal reopen, saved-data comparisons, matching remote hashes and public release/PR URLs.
- [ ] Phase 6 — final source-stable MP4 evidence, checklist/gauge/learning close, local reports/HTML twins and task-owned worktree cleanup. Verify: final files exist, original dirty checkout unchanged, no secrets/media published and no outstanding review findings.

### Verified local delivery and public hold

- Source commit `a0a589a6e48197eb631d339b22d3356c0b12cd52` is pushed on `release/1.3.5`; [draft PR #12](https://github.com/theangeloumali/ClaudeWatch/pull/12) targets main. Documentation-only close records do not change the installed source.
- Phase 4 local subset passed: fresh arm64 ZIP, exact packaged source/build-output hashes, complete required dependency graph, ten browser-manifest files, app/widget strict Developer ID signatures, hardened runtime and architecture checks. Candidate runtime and 60-second minimize/resume checks passed. Notarization and Gatekeeper approval did not pass; this is not a public-distribution artifact.
- The shared `node_modules` symlink initially caused eleven required transitive dependencies to be omitted even though packaging succeeded. The verifier rejected that archive before installation. Replacing only the task-owned symlink with a physical copy of the same locked dependencies produced the verified complete build; no dependency versions or original dependency directory changed.
- Phase 5 local subset passed: `/Applications/ClaudeWatch.app` reports 1.3.5, exactly matches the verified candidate and reopens normally. Immediate rollback app/data copies are retained at `/Users/angeloumali/Library/Application Support/ClaudeWatch-install-backups/20261015-224337/`. App ASAR SHA-256: `87bdc1d204818f114d661e9ca9aa00226f96ee51aa56b1bdfffeae70b2d0a605`. Saved settings, layouts, themes and identity comparisons passed; the installed runtime has no missing/duplicate detected workers or errors.
- Phase 6 local evidence is complete: frame-checked H.264/AAC MP4s cover the signed native app, desktop web and mobile web. Final recording samples independently show six current Claude actors on each surface, all present without duplicates; counts change as real jobs finish. The Desktop checklist, impact evidence, local HTML twins and canonical learning capture are recorded. No existing tracker ticket or Slack source message was supplied, so none was fabricated or marked complete.
- Public notarization, Intel/full distribution packaging, public tagging, publication, download verification and main merge remain blocked on Apple agreement processing and account access. Phases 4–6 remain unchecked because the whole public-release contract is not complete. No ready PR, public release or merge is claimed.

### Measured result

- Native process-backed discovery is now usable without registry records. The 33 discovery/ownership regressions pass, and the installed scene matches the detected live feed without missing or duplicate identities.
- Explicit active hosted descendants survive a quiet parent on cold start. The 25 collector regressions cover nested lineage, exclusions, age, bounds and totals.
- Conversation recovery no longer inherits another conversation's workers or completion badge. Eight source-observation tests pass; the full suite passes 5,006 tests across 407 files, with zero failures and 18 platform-specific skips.
- The complete Office/minimap/selected-model build is installed and demonstrated on native, desktop and mobile surfaces. Ten final-master frames were inspected; no source code changed after recording.
- The source integration commit adds 39,617 lines and removes 1,440. This is a large feature integration, not a size-reduction refactor; the strict dead-code scan is clean and all 733 locked dependency entries are unchanged. At the first push there was one verified source commit; no unpushed source work remains.

Resume from draft PR #12 after account access is restored: validate the exact notarytool profile, rebuild both architectures from the then-current reviewed release source with publication disabled, prove actual notarization and Gatekeeper approval, then complete the already authorized main merge, exact tag, public release and download verification. Do not reuse the unnotarized local ZIP as if it had passed those gates.

## Dependency flow

```ascii
┌──────────────────────────────┐
│ Current main + verified delta│
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Integrate + version 1.3.5    │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Tests / runtime / review    │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Sign / notarize / candidate │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ PR → main → tag → install   │
│ publish → verify downloads  │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Final evidence + clean close│
└──────────────────────────────┘
```

Independent read-only release/signing assessment may run alongside integration preparation. Writers receive disjoint files/worktrees only after conflict surfaces are known. Version and lockfile have one owner. Packaging waits for the integrated source and review; publication waits for actual artifact verification. Primary owns all git, signing, install and external actions; subagents cannot run shell commands.

### As-built worker visibility path

Both discovery paths enter the existing worker collector. An uncertain anonymous owner remains visible as a process without borrowing another conversation's workers.

```ascii
┌──────────────────────┐       ┌──────────────────────────┐
│ Registry-proven leads│       │ Native process + cwd     │
└──────────┬───────────┘       └────────────┬─────────────┘
           │ live identity                 │ explicit/unique claim
           └────────────────┬──────────────┘
                            ▼
           ┌─────────────────────────────────┐
           │ Existing transcript/worker feed │
           └────────────────┬────────────────┘
                            │ sessions + live children
                            ▼
           ┌─────────────────────────────────┐
           │ Shared snapshot and simulation  │
           └───────┬─────────────────┬───────┘
                   │ frames          │ frames
                   ▼                 ▼
           ┌──────────────┐   ┌────────────────┐
           │ Native Office│   │ Browser Office │
           └───────┬──────┘   └────────┬───────┘
                   │ same workers      │ same workers
                   └─────────┬─────────┘
                             ▼
           ┌─────────────────────────────────┐
           │ Scene, minimap and List         │
           └─────────────────────────────────┘
```

Critical path: live process identity → proven conversation → existing live-worker feed → scene/minimap/List. Discovery reads are bounded and do not write provider data or CLI configuration.

Budget: T3 active=5 total=12 for item RELEASE-1.3.5. Reserve one release-pipeline specialist, up to two domain integration owners if needed, one QA/security review pair, one as-built specialist only if needed and bounded remaining remediation. Embedded diagrams and bookkeeping stay inline.

```taskgraph
{
  "profile": "T3",
  "nodes": [
    { "id": "baseline", "kind": "merge", "phase": "1", "produces": ["approved-isolation"], "verify": "git diff --check" },
    { "id": "integration", "kind": "merge", "phase": "2", "files_own": ["package.json", "package-lock.json", "electron-builder.yml", "src/main/office-setup.ts", "src/main/tray.test.ts", "src/main/office-interactions.ts", "src/bridge/opencode-activity.ts"], "produces": ["integrated-release"], "verify": "npm run typecheck", "needs": [{"node":"baseline","artifact":"approved-isolation"}] },
    { "id": "claude-discovery", "kind": "slice", "owner": "ravi", "phase": "2", "files_own": ["src/bridge/registry.ts", "src/bridge/claude-processes.ts", "src/bridge/claude-transcripts.ts", "src/bridge/claude-process-claims.ts", "src/bridge/__tests__/claude-process-discovery.test.ts"], "produces": ["live-claude-workers"], "verify": "npx vitest run src/bridge/__tests__/claude-process-discovery.test.ts --maxWorkers=1 --minWorkers=1", "needs": [{"node":"baseline","artifact":"approved-isolation"}] },
    { "id": "review", "kind": "verify", "owner": "maya", "phase": "3", "verifies": ["integration","claude-discovery"], "produces": ["verified-source"], "verify": "npm run lint && npm run typecheck", "needs": [{"node":"integration","artifact":"integrated-release"},{"node":"claude-discovery","artifact":"live-claude-workers"}] },
    { "id": "candidate", "kind": "merge", "phase": "4", "produces": ["verified-artifacts"], "verify": "python3 -c 'import json; from pathlib import Path; receipt=json.loads(Path(\"/Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch/recordings/release-1.3.5-2026-10-15/release-artifacts.json\").read_text()); assert receipt[\"result\"] == \"passed\"'", "needs": [{"node":"review","artifact":"verified-source"}] },
    { "id": "deploy", "kind": "merge", "phase": "5", "produces": ["installed-published-merged"], "verify": "python3 -c 'import json; from pathlib import Path; receipt=json.loads(Path(\"/Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch/recordings/release-1.3.5-2026-10-15/release-delivery.json\").read_text()); assert receipt[\"result\"] == \"passed\"'", "needs": [{"node":"candidate","artifact":"verified-artifacts"}] },
    { "id": "close", "kind": "close", "phase": "6", "actions": [], "verify": "git diff --check", "needs": [{"node":"deploy","artifact":"installed-published-merged"}] }
  ]
}
```

## Verification, rollback and limits

Integration defects reproduced and corrected: `integration-typecheck.log` pinpointed a removed `basename` binding in `opencode-activity.ts:43` and a missing platform argument at `office-interactions.ts:160`; the existing cross-platform program helper and pane guard are now used consistently. The focused Windows provider run also reproduced `project-root.ts:21` returning a whole Windows path as its label on a non-Windows host; placement now uses the supplied root's path style. The existing Windows OpenCode health assertion is updated to require the newly supported observation timestamps, not loosened to ignore them. Shared `project-root.ts` and that test file are necessary additional integration surfaces. Unchanged dependency metadata is verified for all 733 locked entries, with no private signing files or possible secret values staged.

The complete existing suite reproduced two Office-service Windows failures at `office-service.test.ts:374,410`: `bridge/orca.ts:89` used the host-global CLI path instead of the requested platform, so the service's allowlist refused it. Discovery and health polling now resolve the CLI for their declared platform, and Windows bridge fixtures require that path. Registry safety assertions now distinguish a new process's cwd lookup from rechecking a stale PID's start, and require unhealthy source status when process discovery cannot run. No liveness assertion was removed. The 23 new native-discovery cases pass; the live probe discovers both previously missing lead sessions, while their earlier 15-worker job has since completed.

Reuse the prior complete checks and local delivery tooling from `/Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch/recordings/roof-occlusion-2026-10-15/`. New durable evidence lives at `/Users/angeloumali/Desktop/Work/ZKidz/ClaudeWatch/recordings/release-1.3.5-2026-10-15/`. Recordings and native data copies remain local-only. The GitHub publication contains only release artifacts, checksums and user-facing notes.

Full suite uses one worker, quiet JSON reporting and a 60-second local runner limit because the previous ordinary-limit run passed but repeat rendering tests exceeded five seconds under measured host contention. No functional assertions or rendering budgets are relaxed. Installed-user checks never click Approve/Deny/Send/New agent. Source release does not claim that all possible freeze causes are eliminated.

Local validation uses copied device-local settings and local test fixtures. There is no database migration or provider database write. Any recovered integration failure is reproduced and pinpointed before its fix. A release-signing or external-access blocker is attempted, recorded with its named owner and surfaced; no partial release is reported complete.

Apple agreement processing is the named external blocker for Phase 4 notarization and Phase 5 public deployment. The account owner is Angelo; HTTP 401 and absent notarytool profiles are recorded, and Angelo confirmed the agreements are still pending. Authorized local signed installation and its rollback/evidence proceed independently after all source and candidate gates pass. These partial phase results do not tick public-release checkboxes or permit a ready PR/merge.

## Planning estimates

Estimates, not delivery promises; existing verified tests/build/install tooling is reused. Integration uncertainty is the largest variable.

| Phase group                              | With assistant | Without assistant |
| ---------------------------------------- | -------------- | ----------------- |
| Integration and release metadata         | 1–3 h          | 2–5 h             |
| Full gates, review and signed packaging  | 1–3 h          | 2–4 h             |
| Merge, install, publication and evidence | 1–2 h          | 2–3 h             |
| Total                                    | 3–8 h          | 6–12 h            |

Midpoint comparison is about 1.64× / 39% less estimated effort, not a measured productivity gain. Apple notarization and missing credential access are external waits, not included as a guaranteed duration.
