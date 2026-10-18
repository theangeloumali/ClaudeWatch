import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from '../office-live/browser-storage'
import {
  levelForMachine,
  levelInUse,
  parsePin,
  QUALITY_SETTINGS,
  startWatch,
  watchFrame,
  type FrameSample,
  type MachineHints,
  type QualityLevel,
  type QualityPin,
  type QualitySettings,
  type QualityWatch
} from './logic/quality'

const PIN_STORAGE_KEY = 'claudewatch.office.quality'

export interface QualityChoice {
  pin: QualityPin
  // The level the Office chose by itself; in use while the pin is `auto`.
  chosen: QualityLevel
}

// What the browser says before a canvas exists; the renderer string is added once one does.
export function machineHints(renderer?: string): MachineHints {
  const memoryGb: unknown = Reflect.get(navigator, 'deviceMemory')
  return {
    cores: navigator.hardwareConcurrency || undefined,
    memoryGb: typeof memoryGb === 'number' ? memoryGb : undefined,
    renderer,
    pixelRatio: window.devicePixelRatio
  }
}

// One per page: the scene, the frame loop and the HUD all read the same choice.
let choice: QualityChoice = {
  pin: parsePin(readStored(PIN_STORAGE_KEY)),
  chosen: levelForMachine(machineHints())
}
let watch: QualityWatch | null = null
const listeners = new Set<() => void>()

function change(next: QualityChoice): void {
  if (next.pin === choice.pin && next.chosen === choice.chosen) return
  choice = next
  listeners.forEach((listener) => listener())
}

export function readQuality(): QualityChoice {
  return choice
}

export function subscribeQuality(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function pinQuality(pin: QualityPin): void {
  writeStored(PIN_STORAGE_KEY, pin)
  change({ ...choice, pin })
}

export function chooseQuality(chosen: QualityLevel): void {
  change({ ...choice, chosen })
}

// Every frame drawn in front is fed here; a pinned level is not watched, and unpinning starts over.
export function watchQuality(sample: FrameSample): void {
  if (choice.pin !== 'auto') {
    watch = null
    return
  }
  if (watch?.level !== choice.chosen) watch = startWatch(choice.chosen, sample.timeMs)
  watch = watchFrame(watch, sample)
  chooseQuality(watch.level)
}

export function useQualityChoice(): QualityChoice {
  return useSyncExternalStore(subscribeQuality, readQuality)
}

export function useQualityLevel(): QualityLevel {
  const { pin, chosen } = useQualityChoice()
  return levelInUse(pin, chosen)
}

// For a frame loop, where a hook cannot run.
export function readQualityLevel(): QualityLevel {
  const { pin, chosen } = readQuality()
  return levelInUse(pin, chosen)
}

// The level in use and what it sets.
export function useQualitySettings(): QualitySettings {
  return QUALITY_SETTINGS[useQualityLevel()]
}
