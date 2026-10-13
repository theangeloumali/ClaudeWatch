#!/bin/bash
# ClaudeWatch Rate Limit Sync
# Silent statusline that writes rate-limits.json for ClaudeWatch to read.
# This script outputs nothing — it won't affect your terminal display.

json=$(cat)
CACHE_DIR="${HOME}/.claude/cache"

# Extract rate limit blocks (try five_hour/seven_day, fallback to window_5h/window_7d)
w5h_block=$(echo "$json" | grep -o '"five_hour"[[:space:]]*:[[:space:]]*{[^}]*}' | head -1)
[ -z "$w5h_block" ] && w5h_block=$(echo "$json" | grep -o '"window_5h"[[:space:]]*:[[:space:]]*{[^}]*}' | head -1)
w7d_block=$(echo "$json" | grep -o '"seven_day"[[:space:]]*:[[:space:]]*{[^}]*}' | head -1)
[ -z "$w7d_block" ] && w7d_block=$(echo "$json" | grep -o '"window_7d"[[:space:]]*:[[:space:]]*{[^}]*}' | head -1)

w5h_pct=$(echo "$w5h_block" | grep -o '"used_percentage"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
w7d_pct=$(echo "$w7d_block" | grep -o '"used_percentage"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
w5h_resets=$(echo "$w5h_block" | grep -o '"resets_at"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
w7d_resets=$(echo "$w7d_block" | grep -o '"resets_at"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

if [ -n "$w5h_pct" ] || [ -n "$w7d_pct" ]; then
    mkdir -p "$CACHE_DIR" 2>/dev/null
    printf '{"window_5h":{"used_percentage":%s,"resets_at":"%s"},"window_7d":{"used_percentage":%s,"resets_at":"%s"},"updated_at":"%s"}\n' \
        "${w5h_pct:-0}" "${w5h_resets:-}" "${w7d_pct:-0}" "${w7d_resets:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        > "${CACHE_DIR}/rate-limits.json" 2>/dev/null
fi
