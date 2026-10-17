// Train motion as a pure function of time: stop, accelerate, cruise, brake. Never integrated per
// frame, so it stays right at the governor's 5 fps idle pace (ClearSpent sim/rail-timetable.ts).

interface RunProfile {
  distance: number
  duration: number
  accel: number
  peak: number
  ramp: number
}

// Short runs never reach top speed: they peak and brake straight away.
function runProfile(distance: number, topSpeed: number, accel: number): RunProfile {
  const peak = Math.min(topSpeed, Math.sqrt(distance * accel))
  const ramp = peak / accel
  const cruise = peak > 0 ? (distance - peak * ramp) / peak : 0
  return { distance, duration: 2 * ramp + cruise, accel, peak, ramp }
}

function runAt(run: RunProfile, t: number): { distance: number; speed: number } {
  const { accel, peak, ramp, duration, distance } = run
  if (t <= 0) return { distance: 0, speed: 0 }
  if (t < ramp) return { distance: 0.5 * accel * t * t, speed: accel * t }
  if (t < duration - ramp) return { distance: 0.5 * peak * ramp + peak * (t - ramp), speed: peak }
  const left = Math.max(0, duration - t)
  return { distance: distance - 0.5 * accel * left * left, speed: accel * left }
}

interface Stop {
  // Where the train's reference point halts, in metres along its track.
  at: number
  dwell: number
}

interface TimetableLeg {
  from: number
  direction: 1 | -1
  dwell: number
  run: RunProfile
}

export interface Timetable {
  legs: TimetableLeg[]
  period: number
}

// Stops in visiting order, round and round; on a loop every run goes forwards.
export function timetable(
  stops: readonly Stop[],
  topSpeed: number,
  accel: number,
  loopLength?: number
): Timetable {
  const legs = stops.map((stop, index): TimetableLeg => {
    let to = stops[(index + 1) % stops.length].at
    if (loopLength !== undefined && to <= stop.at) to += loopLength
    return {
      from: stop.at,
      direction: to >= stop.at ? 1 : -1,
      dwell: stop.dwell,
      run: runProfile(Math.abs(to - stop.at), topSpeed, accel)
    }
  })
  const period = legs.reduce((sum, leg) => sum + leg.dwell + leg.run.duration, 0)
  return { legs, period }
}

export interface TrainState {
  at: number
  speed: number
  direction: 1 | -1
}

// Where the train is at `seconds`; second 0 is the first stop's dwell.
export function trainAt(table: Timetable, seconds: number): TrainState {
  let left = ((seconds % table.period) + table.period) % table.period
  for (const leg of table.legs) {
    if (left < leg.dwell) return { at: leg.from, speed: 0, direction: leg.direction }
    left -= leg.dwell
    if (left < leg.run.duration) {
      const { distance, speed } = runAt(leg.run, left)
      return { at: leg.from + leg.direction * distance, speed, direction: leg.direction }
    }
    left -= leg.run.duration
  }
  const [first] = table.legs
  return { at: first.from, speed: 0, direction: first.direction }
}
