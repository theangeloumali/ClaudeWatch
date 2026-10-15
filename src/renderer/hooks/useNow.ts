import { useEffect, useState } from 'react'

export function useNow(intervalMs: number): number {
  const [, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  // A feed update between ticks must not be evaluated against an older display clock.
  return Date.now()
}
