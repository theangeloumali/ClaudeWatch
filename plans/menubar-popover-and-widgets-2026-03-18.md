# MacClaudeTracker — Menu Bar Popover + macOS Widget Roadmap

> **Date**: 2026-03-18
> **Status**: Popover implementing now, Widgets planned

---

## Phase 1: Menu Bar Popover (NOW)

### Architecture

**Main process** (`tray.ts`):
- Left-click tray → show/hide a small BrowserWindow anchored to tray bounds
- Right-click → existing context menu
- Popover hides on blur (click outside)
- Window: ~320x420, frameless, transparent, vibrancy

**Renderer** (`PopoverView.tsx`):
- Compact instance list with status dots, project name, elapsed time, CPU/MEM
- Small stats summary at top
- "Open Dashboard" + "Quit" buttons at bottom
- Loads via `#popover` hash in the URL, detected in App.tsx

**Preload**: Same preload works for both windows (same IPC bridge)

### Files to change
- `src/main/tray.ts` — Add popover BrowserWindow, position logic, show/hide on click
- `src/main/index.ts` — Pass preload path to TrayManager
- `src/renderer/components/PopoverView.tsx` — NEW compact popover UI
- `src/renderer/App.tsx` — Detect `#popover` hash, render PopoverView

### Time Estimates
| Task | With CC | Without CC |
|------|:---:|:---:|
| Tray popover window logic | 0.3h | 1.5h |
| PopoverView component | 0.3h | 1h |
| App.tsx routing + integration | 0.1h | 0.3h |
| Testing + polish | 0.2h | 0.5h |
| **Total** | **0.9h** | **3.3h** |

---

## Phase 2: macOS Widgets (FUTURE)

### Why widgets
- Always visible on desktop/lock screen without switching apps
- Native macOS experience, battery efficient
- Glanceable stats: active count, project names, durations

### Architecture (requires native Swift)

```
┌─────────────────────────────────┐
│ Electron App (main process)      │
│  ├── Writes stats to shared file │
│  │   ~/Library/Group Containers/ │
│  │   group.com.zkidz.tracker/    │
│  │   stats.json                  │
│  └── Updates every poll cycle    │
├─────────────────────────────────┤
│ Swift Widget Extension           │
│  ├── Reads stats.json via        │
│  │   App Group shared container  │
│  ├── WidgetKit timeline provider │
│  ├── Small: active count + dot   │
│  ├── Medium: instance list       │
│  └── Large: full stats + list    │
└─────────────────────────────────┘
```

### Widget sizes
- **Small** (widget family): Green dot + "3 active" + top project name
- **Medium**: 3-4 instance rows with status, name, elapsed time
- **Large**: Full stats bar + scrollable instance list

### Requirements
- Xcode project with WidgetKit extension target
- App Group entitlement for shared data
- Electron app writes `stats.json` to App Group container each poll
- Widget reads JSON and renders SwiftUI views
- Code signing: both app and widget must be signed with same team ID

### Implementation steps
1. Create Xcode project with Widget Extension target
2. Configure App Group (`group.com.zkidz.claude-tracker`)
3. Add entitlement to Electron app's Info.plist
4. Write stats to shared container from main process
5. Build SwiftUI widget views (Small/Medium/Large)
6. Create WidgetKit TimelineProvider that reads stats.json
7. Bundle widget extension alongside Electron app
8. Update build pipeline to compile Swift + Electron together

### Time estimate
| Task | With CC | Without CC |
|------|:---:|:---:|
| Xcode project + App Group setup | 2h | 4h |
| Stats file writer (Electron side) | 0.5h | 1h |
| SwiftUI widget views (3 sizes) | 3h | 8h |
| Timeline provider + data model | 1h | 3h |
| Build pipeline integration | 2h | 6h |
| Testing + polish | 1.5h | 3h |
| **Total** | **10h** | **25h** |

### Blocker
- Need Apple Developer account for WidgetKit entitlements
- Must decide on distribution method (direct download vs App Store)
