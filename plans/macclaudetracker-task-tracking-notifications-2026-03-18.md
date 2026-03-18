# MacClaudeTracker: Task Tracking & Notification Improvements

## Context

Angelo runs 15-20+ Claude Code sessions simultaneously and needs better visibility into task lifecycle. Currently the app only tracks 3 statuses (active/idle/exited) with basic idle/exit notifications. There's no way to know when a task just finished, no custom sound feedback, and no visual grouping by task state. These improvements will make monitoring dozens of sessions dramatically more useful.

---

## Time Estimates Summary

| Phase | Task | With Claude | Without Claude | Savings |
|-------|------|-------------|----------------|---------|
| 1 | Types & Settings Foundation | 0.5h | 2h | 75% |
| 2 | Sound Player (main process) | 1h | 3h | 67% |
| 3 | SessionTracker Metadata | 0.5h | 2h | 75% |
| 4 | Notification Enhancement | 0.5h | 1.5h | 67% |
| 5 | Dashboard Grouped UI | 2h | 7h | 71% |
| 6 | PopoverView Groups | 1h | 3h | 67% |
| 7 | Settings UI (new toggles) | 0.5h | 1.5h | 67% |
| 8 | Tests | 2h | 5h | 60% |
| **Total** | | **8h** | **25h** | **68%** |

**Productivity multiplier**: 3.1x faster with Claude Code

---

## Phase 1: Types & Settings Foundation

**Files to modify:**
- `src/renderer/lib/types.ts`
- `src/main/store.ts`

### 1a. Add `lastBecameIdleAt` to ClaudeInstance

```typescript
// types.ts — add to ClaudeInstance interface
lastBecameIdleAt?: Date  // timestamp when instance transitioned active → idle
```

**Why not a new status?** Adding `'completed'` would cascade through 15+ files (process-monitor, session-tracker, tray, widget, popover, dashboard, filters, stat cards, tests). Instead, `lastBecameIdleAt` is metadata on `idle` status — the renderer derives "recently completed" by checking `idle && lastBecameIdleAt && (now - lastBecameIdleAt < 10min)`.

### 1b. Add notification settings

```typescript
// types.ts — add to AppSettings.notifications
onTaskComplete: boolean  // default true — notify when active → idle
pingSound: boolean       // default true — play custom ping on task complete
```

Update `DEFAULT_SETTINGS` with new defaults.

### 1c. Add `recentlyCompletedWindowMs` to stats

```typescript
// types.ts — add to InstanceUpdate.stats
recentlyCompleted: number  // count of idle instances with lastBecameIdleAt < 10min
```

### 1d. Store validation

`src/main/store.ts` and `src/main/ipc-handlers.ts` — add defaults for new settings fields in `validateSettings()`.

**Task: 0.5h with Claude | 2h without**

---

## Phase 2: Sound Player

**Files to create:**
- `src/main/sound-player.ts`
- `src/main/sound-player.test.ts`
- `resources/sounds/task-complete.aiff`

### 2a. SoundPlayer class

```typescript
// sound-player.ts
export class SoundPlayer {
  private soundPath: string

  constructor() {
    // In production: process.resourcesPath/sounds/task-complete.aiff
    // In dev: resources/sounds/task-complete.aiff
    this.soundPath = resolve(...)
  }

  async playTaskComplete(): Promise<void> {
    // macOS: execFile('afplay', [this.soundPath])
    // Windows: PowerShell [System.Media.SoundPlayer]
    // Graceful no-op if file missing
  }
}
```

**Sound file**: Use macOS system sound `/System/Library/Sounds/Glass.aiff` as the bundled default — it's a pleasant, short chime. Copy it to `resources/sounds/task-complete.aiff` (royalty-free, ships with macOS).

**Why `afplay` over Electron audio?** Main process has no DOM/Audio API. `afplay` is zero-dependency, non-blocking, and ships with every Mac. The sound is <1 second so no process management needed.

### 2b. Bundle sound in electron-builder

```yaml
# electron-builder.yml — add under mac.extraFiles
- from: resources/sounds
  to: sounds
```

**Task: 1h with Claude | 3h without**

---

## Phase 3: SessionTracker Metadata Enrichment

**File to modify:**
- `src/main/session-tracker.ts`

### 3a. Stamp `lastBecameIdleAt` on status change

In `doPoll()`, when detecting status changes (line 86-94), add:

```typescript
// When instance goes active → idle, stamp the timestamp
if (prev && prev.status === 'active' && proc.status === 'idle') {
  proc.lastBecameIdleAt = new Date()
}
```

### 3b. Preserve `lastBecameIdleAt` across polls

In the "Update current instances map" section (line 120-129), when preserving `startedAt` from previous instance, also preserve `lastBecameIdleAt`:

```typescript
if (prev) {
  proc.startedAt = prev.startedAt
  // Preserve idle timestamp unless status changed back to active
  if (prev.lastBecameIdleAt && proc.status === 'idle') {
    proc.lastBecameIdleAt = prev.lastBecameIdleAt
  }
}
```

### 3c. Add `recentlyCompleted` to stats

In `getStats()`, count idle instances where `lastBecameIdleAt` is within 10 minutes:

```typescript
const now = Date.now()
const RECENT_WINDOW = 10 * 60 * 1000
recentlyCompleted: instanceList.filter(
  i => i.status === 'idle' && i.lastBecameIdleAt &&
  (now - i.lastBecameIdleAt.getTime()) < RECENT_WINDOW
).length
```

**Task: 0.5h with Claude | 2h without**

---

## Phase 4: Notification Enhancement

**Files to modify:**
- `src/main/notifications.ts`
- `src/main/index.ts`

### 4a. Add `notifyTaskComplete()` to NotificationManager

```typescript
notifyTaskComplete(instance: ClaudeInstance): void {
  const settings = this.getSettings()
  if (!settings.notifications.onTaskComplete || settings.notifications.doNotDisturb) return

  const notification = new Notification({
    title: '✅ Task complete',
    body: `${instance.projectName} — ran for ${instance.elapsedTime}`,
    silent: true  // Always silent — we handle sound separately via SoundPlayer
  })
  notification.show()
}
```

### 4b. Wire up in main index.ts

In the `instance-status-changed` event handler, add task complete detection:

```typescript
tracker.on('instance-status-changed', ({ instance, previousStatus }) => {
  if (previousStatus === 'active' && instance.status === 'idle') {
    notifier.notifyTaskComplete(instance)

    const settings = store.getSettings()
    if (settings.notifications.pingSound && !settings.notifications.doNotDisturb) {
      soundPlayer.playTaskComplete()
    }
  }
  // existing idle notification logic...
})
```

**Key distinction**: `notifyTaskComplete` fires on active→idle transition (task just finished). `notifyIdle` remains for the existing idle detection (may fire on instances that were already idle). If both `onTaskComplete` and `onIdle` are enabled, only fire `notifyTaskComplete` to avoid duplicate notifications.

**Task: 0.5h with Claude | 1.5h without**

---

## Phase 5: Dashboard Grouped UI

**Files to modify:**
- `src/renderer/hooks/useInstances.ts`
- `src/renderer/components/Dashboard.tsx`
- `src/renderer/components/InstanceList.tsx`

### 5a. Add grouped instances to useInstances hook

```typescript
// useInstances.ts — add to return type
groupedInstances: {
  recentlyCompleted: ClaudeInstance[]  // idle + lastBecameIdleAt < 10min
  inProgress: ClaudeInstance[]         // active
  waiting: ClaudeInstance[]            // idle + (no lastBecameIdleAt OR > 10min)
}
```

Computed via `useMemo`, re-evaluates on each `instances` update. The 10-minute window naturally expires as new polls come in (every 3s).

### 5b. Dashboard layout with sections

When filter is "all" (default view), replace flat `<InstanceList>` with grouped sections:

```
┌─────────────────────────────────────┐
│ 📊 Stat Cards (unchanged)           │
├─────────────────────────────────────┤
│ 💰 Usage Stats (unchanged)          │
├─────────────────────────────────────┤
│ 🔍 Filter + Search (unchanged)      │
├─────────────────────────────────────┤
│ ✅ RECENTLY COMPLETED (emerald)      │
│   ├ ProjectA — finished 2m ago      │
│   └ ProjectB — finished 8m ago      │
│                                     │
│ 🟢 IN PROGRESS (green, pulse)       │
│   ├ ProjectC — 12:34 elapsed        │
│   └ ProjectD — 05:22 elapsed        │
│                                     │
│ 🟡 WAITING (amber, dimmed)          │
│   └ ProjectE — idle for 25m         │
└─────────────────────────────────────┘
```

**Design details (Priya's recommendation):**
- **Recently Completed**: `border-l-emerald-400`, `CheckCircle` icon, shows "finished Xm ago"
- **In Progress**: Current active styling with pulse animation
- **Waiting**: `opacity-80`, `Moon` icon, amber accent
- Empty groups are hidden entirely (no empty state clutter)
- When a specific filter is active (Active/Idle/Exited), revert to flat list (power user mode)

### 5c. Add a new stat card for "Recently Completed"

Add a 5th stat card or replace the "Exited" card context:
- Add `recentlyCompleted` count from stats with `CheckCircle` icon and emerald color
- This gives instant visibility in the stat row

### 5d. InstanceList enhancement

Add optional `sectionLabel` and `sectionStyle` props to `InstanceList` for rendering section headers. The section header is a small uppercase label with icon, styled per group.

**Task: 2h with Claude | 7h without**

---

## Phase 6: PopoverView Groups

**File to modify:**
- `src/renderer/components/PopoverView.tsx`

### 6a. Ultra-compact section dividers

The popover is 320px wide — no room for full section cards. Use tiny section dividers:

```
┌──────────────────────┐
│ ClaudeWatch  ● ● ●   │ (header with stat dots)
├──────────────────────┤
│ ── RECENTLY DONE ──  │ (9px uppercase, emerald)
│ ProjectA  2m  ✓      │
│ ProjectB  8m  ✓      │
│ ── IN PROGRESS ────  │ (9px uppercase, green)
│ ProjectC  12:34 ●    │
│ ── WAITING ────────  │ (9px uppercase, amber)
│ ProjectE  25m  ◐     │
├──────────────────────┤
│ [Dashboard]  [Quit]  │
└──────────────────────┘
```

Uses same grouping logic from `useInstances` but rendered ultra-compact. Empty groups hidden.

**Task: 1h with Claude | 3h without**

---

## Phase 7: Settings UI

**File to modify:**
- `src/renderer/components/Settings.tsx`

### 7a. Add new notification toggles

In the Notifications section, add:
- **Task Complete** toggle (`onTaskComplete`) — "Notify when a task finishes"
- **Ping Sound** toggle (`pingSound`) — "Play a chime sound on task complete"

Place them logically:
1. On Task Complete ← NEW
2. On Idle (existing)
3. On Exited (existing)
4. On Error (existing)
5. Ping Sound ← NEW (nested under Task Complete visually)
6. Sound (existing — system notification sound)
7. Do Not Disturb (existing)

**Task: 0.5h with Claude | 1.5h without**

---

## Phase 8: Tests

**Files to modify/create:**
- `src/main/sound-player.test.ts` (new)
- `src/main/notifications.test.ts` (extend)
- `src/main/session-tracker.test.ts` (extend)
- `src/renderer/__tests__/useInstances.test.ts` (extend)
- `src/renderer/__tests__/useSettings.test.ts` (extend)

### Critical test scenarios (from Maya):

1. **Task complete notification**: active→idle triggers `notifyTaskComplete`, NOT `notifyIdle` (no duplicate)
2. **Instance starts idle**: Should NOT trigger task complete (only active→idle transitions)
3. **Rapid flapping**: active→idle→active→idle — should notify on each active→idle
4. **DND override**: doNotDisturb=true suppresses everything including ping sound
5. **Sound player**: Graceful no-op when sound file missing, no crash
6. **Recently completed boundary**: Instance at exactly 10 minutes transitions out of "recently completed" group
7. **Settings migration**: Existing users get correct defaults for `onTaskComplete: true` and `pingSound: true`
8. **Grouped instances**: Correct grouping logic in useInstances hook
9. **Preserved metadata**: `lastBecameIdleAt` persists across poll cycles for idle instances, clears when instance goes active again

**Task: 2h with Claude | 5h without**

---

## Implementation Order (dependency-aware)

```
Phase 1 (Types) ──→ Phase 2 (Sound) ──→ Phase 4 (Notifications) ──→ Phase 8 (Tests)
                ──→ Phase 3 (Tracker) ─↗
                ──→ Phase 7 (Settings UI) ──→ Phase 8 (Tests)
                ──→ Phase 5 (Dashboard) ──→ Phase 6 (Popover) ──→ Phase 8 (Tests)
```

**Parallel opportunities:**
- Phases 2, 3, 5, 7 can all start after Phase 1 completes
- Phase 4 needs Phases 2+3
- Phase 6 needs Phase 5
- Phase 8 runs after each phase as TDD

---

## Open Decision: Sound File

**Option A (Recommended)**: Copy macOS system sound `Glass.aiff` from `/System/Library/Sounds/` — pleasant, familiar chime. Bundle it as `resources/sounds/task-complete.aiff`.

**Option B**: Generate a custom tone programmatically (more work, less polish).

**Option C**: Use macOS system sounds directly without bundling (not cross-platform).

---

## Verification Plan

1. **Unit tests**: Run `npm test` — all new and existing tests pass
2. **Manual testing**:
   - Start app, open a Claude Code session, wait for it to go idle → verify notification + ping sound
   - Toggle ping sound off → verify notification appears but no sound
   - Toggle DND on → verify nothing fires
   - Check Dashboard groups: recently completed shows with emerald, in progress with green pulse, waiting with amber
   - Wait 10+ minutes → verify instance moves from "Recently Completed" to "Waiting"
   - Check PopoverView shows same grouping in compact format
3. **Build**: `npm run build` succeeds, sound file bundled correctly
4. **Lint/typecheck**: `npm run lint && npx tsc --noEmit` passes
