import { useEffect, useState } from 'react'
import { useNow } from '../hooks/useNow'
import { browserVisibilityEnv, type VisibilityEnv } from './logic/frame-governor'

// The whole Office re-renders on its own clock, so out of focus that one ticks slower (perf-2).
export const OFFICE_BLURRED_TICK_MS = 5000

// Ticks every second while shown and stops while hidden; `blurredMs` slows it out of focus.
export function useOfficeNow(blurredMs = 1000, env?: VisibilityEnv): number {
  const [visibilityEnv] = useState(() => env ?? browserVisibilityEnv())
  const [visibility, setVisibility] = useState(() => visibilityEnv.read())
  // A new state on every change also re-renders with the current time when the Office returns.
  useEffect(
    () => visibilityEnv.onChange(() => setVisibility(visibilityEnv.read())),
    [visibilityEnv]
  )
  return useNow(visibility.isHidden ? null : visibility.isFocused ? 1000 : blurredMs)
}
