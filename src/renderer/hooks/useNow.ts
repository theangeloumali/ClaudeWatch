import { useEffect, useState } from 'react'

// A null interval pauses the clock.
export function useNow(intervalMs: number | null): number {
  const [, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (intervalMs === null) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  // A feed update between ticks must not be evaluated against an older display clock.
  return Date.now()
}
