import { needsHuman } from '../../../shared/office/attention'
import type { AgentView } from '../../../shared/office/types'

export type RobotMood =
  | 'idle'
  | 'working'
  | 'reading'
  | 'thinking'
  | 'needs-you'
  | 'walking'
  | 'gaming'

export interface RobotPose {
  bob: number
  sway: number
  // Body pitch in radians; negative leans back.
  lean: number
  headPitch: number
  // Shoulder pitch in radians; negative swings the arm forward and up.
  leftArm: number
  rightArm: number
  rightArmRoll: number
  gearSpeed: number
  eyeOpen: number
}

export interface SteamPuff {
  y: number
  scale: number
  opacity: number
}

const TAU = Math.PI * 2
const DESK_ARMS = -0.95
// Thinking and reading are work too: the hands stay on the desk, slower than when typing.
const THINKING_ARMS = -0.8
const READING_ARMS = -0.7
const RAISED_ARM = -2.7
const BLINK_PERIOD_SEC = 3.7
const BLINK_SEC = 0.14
const STEAM_PERIOD_SEC = 3
const STEAM_LIFE_SEC = 1.2
const STEAM_PUFF_COUNT = 3
const STEAM_STAGGER_SEC = 0.25
// On a beanbag: sunk low, leaning in, arms out on a controller and eyes up at the wall screen.
export const GAMING_POSE = { bob: -0.12, lean: 0.1, headPitch: -0.2, arms: -1.05 }

const REST: RobotPose = {
  bob: 0,
  sway: 0,
  lean: 0,
  headPitch: 0,
  leftArm: 0,
  rightArm: 0,
  rightArmRoll: 0,
  gearSpeed: 0,
  eyeOpen: 1
}

export function moodFor(
  agent: Pick<AgentView, 'activity' | 'attention' | 'place'>,
  isMoving: boolean
): RobotMood {
  if (needsHuman(agent.attention)) return 'needs-you'
  if (isMoving) return 'walking'
  if (agent.place === 'lounge') return 'gaming'
  switch (agent.activity) {
    case 'editing':
    case 'running':
      return 'working'
    case 'reading':
    case 'searching':
      return 'reading'
    case 'thinking':
    case 'delegating':
      return 'thinking'
    case 'idle':
      return 'idle'
    default: {
      const unreachable: never = agent.activity
      return unreachable
    }
  }
}

// Key posture per mood, held still under reduced motion.
const POSTURE: Record<RobotMood, Partial<RobotPose>> = {
  idle: {},
  working: { leftArm: DESK_ARMS, rightArm: DESK_ARMS },
  reading: { headPitch: 0.4, leftArm: READING_ARMS, rightArm: READING_ARMS },
  thinking: { headPitch: -0.15, leftArm: THINKING_ARMS, rightArm: THINKING_ARMS },
  'needs-you': { rightArm: RAISED_ARM },
  walking: {},
  gaming: {
    bob: GAMING_POSE.bob,
    lean: GAMING_POSE.lean,
    headPitch: GAMING_POSE.headPitch,
    leftArm: GAMING_POSE.arms,
    rightArm: GAMING_POSE.arms
  }
}

function motion(mood: RobotMood, t: number): Partial<RobotPose> {
  switch (mood) {
    case 'idle':
      return {
        bob: 0.025 * Math.sin(t * TAU * 0.3),
        eyeOpen: t % BLINK_PERIOD_SEC < BLINK_SEC ? 0.1 : 1
      }
    case 'working':
      return {
        leftArm: DESK_ARMS + 0.25 * Math.sin(t * TAU * 3),
        rightArm: DESK_ARMS + 0.25 * Math.sin(t * TAU * 3 + Math.PI),
        gearSpeed: 6
      }
    case 'reading':
      // Follows the lines with its head and turns a page now and then with one hand.
      return {
        headPitch: 0.4 + 0.1 * Math.sin(t * TAU * 0.5),
        rightArm: READING_ARMS + 0.15 * Math.sin(t * TAU * 0.7),
        gearSpeed: 1.2
      }
    case 'thinking':
      // Drums on the desk, one hand then the other, and rocks a little: plainly busy.
      return {
        leftArm: THINKING_ARMS + 0.16 * Math.sin(t * TAU * 1.1),
        rightArm: THINKING_ARMS + 0.16 * Math.sin(t * TAU * 1.1 + Math.PI * 0.6),
        headPitch: -0.15 + 0.07 * Math.sin(t * TAU * 0.4),
        sway: 0.05 * Math.sin(t * TAU * 0.35),
        gearSpeed: 2.4
      }
    case 'needs-you':
      return {
        rightArmRoll: 0.35 * Math.sin(t * TAU * 1.4),
        bob: 0.02 * Math.abs(Math.sin(t * TAU * 1.4))
      }
    case 'walking':
      return {
        bob: 0.04 * Math.abs(Math.sin(t * TAU * 2)),
        sway: 0.06 * Math.sin(t * TAU)
      }
    case 'gaming':
      // Thumbs at the buttons, a bob to the game's beat and a lean into the turns.
      return {
        bob: GAMING_POSE.bob + 0.012 * Math.sin(t * TAU * 0.8),
        leftArm: GAMING_POSE.arms + 0.05 * Math.sin(t * TAU * 4),
        rightArm: GAMING_POSE.arms + 0.05 * Math.sin(t * TAU * 4 + Math.PI / 2),
        headPitch: GAMING_POSE.headPitch + 0.03 * Math.sin(t * TAU * 0.5),
        sway: 0.04 * Math.sin(t * TAU * 0.4),
        eyeOpen: t % BLINK_PERIOD_SEC < BLINK_SEC ? 0.1 : 1
      }
    default: {
      const unreachable: never = mood
      return unreachable
    }
  }
}

// `phase` de-syncs robots so a room doesn't move in lockstep.
export function robotPose(
  mood: RobotMood,
  timeSec: number,
  phase: number,
  options: { isReducedMotion?: boolean } = {}
): RobotPose {
  const held = { ...REST, ...POSTURE[mood] }
  return options.isReducedMotion ? held : { ...held, ...motion(mood, timeSec + phase * 10) }
}

// A short burst of puffs every few seconds from a pooled set; opacity 0 means hidden.
export function steamPuffs(timeSec: number, phase: number): SteamPuff[] {
  const cycleTime = (timeSec + phase * STEAM_PERIOD_SEC) % STEAM_PERIOD_SEC
  return Array.from({ length: STEAM_PUFF_COUNT }, (_, index) => {
    const age = cycleTime - index * STEAM_STAGGER_SEC
    if (age < 0 || age > STEAM_LIFE_SEC) return { y: 0, scale: 0, opacity: 0 }
    const progress = age / STEAM_LIFE_SEC
    return { y: progress * 0.7, scale: 0.06 + progress * 0.1, opacity: 0.8 * (1 - progress) }
  })
}

// Frame-rate independent exponential approach: the same feel at 10 fps and 30 fps.
export function approach(
  current: number,
  target: number,
  dtSec: number,
  ratePerSec: number
): number {
  return target + (current - target) * Math.exp(-ratePerSec * dtSec)
}

export function approachAngle(
  current: number,
  target: number,
  dtSec: number,
  ratePerSec: number
): number {
  const shortest = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return approach(current, current + shortest, dtSec, ratePerSec)
}
