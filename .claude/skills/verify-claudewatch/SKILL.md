---
name: verify-claudewatch
description: How to launch ClaudeWatch and see a change working — the menu-bar app, the live 3D Office window, and the browser preview of the Office. Use for the runtime smoke, a demo recording, or any "does it actually work" check.
---

# Verify ClaudeWatch

ClaudeWatch is an Electron tray app (macOS menu bar, Windows notification area). There is no server, database or login: it reads
local session files. Two surfaces can be driven.

| Surface        | Shows                                        | Data                                          |
| -------------- | -------------------------------------------- | --------------------------------------------- |
| Built app      | Tray, dashboard, popover, live Office window | This machine's real Claude and Codex sessions |
| Office preview | The Office renderer alone, in a browser      | A seeded fixture (20 agents, 2 companies)     |

Use the built app to prove the real pipeline. Use the preview to exercise talk, permission and
new-agent actions: there they are simulated. **Never click Approve, Deny, Send or New agent in the
built app during a check — they act on real running agents.**

## Launch

All commands run from the repo root.

```bash
npm run build                 # ~10 s; writes out/main, out/preload, out/renderer
npm run office:preview        # browser preview; ready in ~1 s on http://localhost:5173/office.html
```

The built app is launched by the smoke script below (Electron with `out/main/index.js --open-office`).
`npm run dev` starts the app with hot reload when you want to look by hand.

Driver tooling lives outside the repo, because Playwright is not a project dependency. On Windows use a
scratch folder instead of /tmp; the smoke drives Electron only, so set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1:

```bash
mkdir -p /tmp/cw-e2e && cd /tmp/cw-e2e && [ -d node_modules/playwright ] || \
  (npm init -y >/dev/null && npm i --no-audit --no-fund playwright@1 >/dev/null)
```

## Health check

```bash
# Preview: exits 0 once the page is served. Poll it.
curl -sf -o /dev/null http://localhost:5173/office.html

# Built app: the smoke script exits 0 only when the Office window opened, its Offices panel
# rendered and the console logged no errors.
```

## Drive

Worked example, start to finish: the live Office on real sessions.

```bash
REPO="$PWD" && npm run build >/dev/null && cd /tmp/cw-e2e && \
  CW_REPO="$REPO" CW_SHOT="$REPO/recordings/office-live/smoke.png" CW_SETTLE_MS=15000 \
  node --input-type=module < "$REPO/.claude/skills/verify-claudewatch/office-smoke.mjs"
```

Robots walk in from the gate, so a screenshot taken before `CW_SETTLE_MS` shows empty offices; use
45000 when the picture has to show everyone seated. With no sessions running the Office shows
"No agents running", which is correct.

Preview: open `http://localhost:5173/office.html` with Chrome DevTools MCP or Playwright chromium.
Keys: `L` list view, `T` theme, `N` next agent that needs you, `W` cutaway, `1`–`9` jump to a company.

## Evidence

- `recordings/office-live/smoke.png` (the script's screenshot; `recordings/` is gitignored).
- The script's `OFFICES PANEL` text: every running session's project must be listed.
- `CONSOLE ERRORS: 0`. Any other count fails the check.
- Unit and build gates: `npm run typecheck && npx eslint . && npx vitest run && npm run build`.

## Windows

- Install the built app with `npm run build:win -- --publish never`, then run
  `dist/claudewatch-<version>-setup.exe /S` through PowerShell `Start-Process` (Git Bash rewrites `/S`).
- Starting a second copy opens the dashboard; the tray button is reachable through UI Automation,
  named by its tooltip (`ClaudeWatch - N active`).
- Windows records each tray icon under `HKCU:\Control Panel\NotifyIconSettings`: an empty
  `IconSnapshot` there means an invisible icon.
- Measure window bounds with DWM extended-frame bounds: `GetWindowRect` adds an invisible resize border.

## Cleanup

```bash
pkill -f "vite --config vite.office-preview.config.ts"       # stop the preview
pgrep -fl "out/main/index.js" && pkill -f "out/main/index.js" # a smoke run that did not exit
lsof -ti :5173 || echo "port 5173 free"
```

On Windows: `Get-Process electron | Stop-Process` for a smoke run that did not exit, and
`Get-NetTCPConnection -LocalPort 5173` to check the preview port.

Nothing is written outside `recordings/` and the Office's own localStorage layout.

## Feature map

| Feature                                  | Where to look                         | Source                                            |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------- |
| Tray menu, "Open Office"                 | Menu-bar icon                         | `src/main/tray.ts`, `src/main/index.ts`           |
| Dashboard and popover                    | Tray click                            | `src/renderer/App.tsx`, `src/renderer/components` |
| Session discovery (Claude, Codex, Orca)  | `node out/main/bridge.js --once`      | `src/bridge/`                                     |
| Floor layout, seats, walking             | Office window                         | `src/office/sim/`                                 |
| Scene, name cards, camera                | Office window                         | `src/renderer/office/scene`, `logic`              |
| Offices panel, list view, attention rail | Office window HUD                     | `src/renderer/office/hud`                         |
| Talk, permission answer, peek, new agent | Preview (simulated); app (real, Orca) | `src/main/office-interactions.ts`, `hud/`         |
| Themes (Neo Edo Steam, Brass Workshop)   | `T` in the Office                     | `src/renderer/office/themes`                      |
| Window security, IPC sender checks       | Unit tests                            | `src/main/window-factory.ts`, `ipc-handlers.ts`   |

MISSING: a health command for the built app that does not need Playwright.
