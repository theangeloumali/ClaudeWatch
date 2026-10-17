// The one time every animated city layer reads, so trains, construction and events stay in step
// and reduced motion stills them all at once. A module store like `officeSettings`.
export interface CityClock {
  // Epoch ms, like evidence and event times, so a layer compares them directly.
  now(): number
  isPinned(): boolean
  // Once per drawn frame, with that frame's wall time.
  tick(frameMs: number): void
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function createCityClock(isReducedMotion: () => boolean): CityClock {
  let nowMs = Date.now()
  let isPinned = false
  return {
    now: () => nowMs,
    isPinned: () => isPinned,
    tick: (frameMs) => {
      isPinned = isReducedMotion()
      if (!isPinned) nowMs = frameMs
    }
  }
}

// Read live each frame, so turning reduced motion on pins the clock without a React commit.
function osReducedMotion(): () => boolean {
  if (typeof window.matchMedia !== 'function') return () => false
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  return () => query.matches
}

export const cityClock = createCityClock(osReducedMotion())
