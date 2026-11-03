import { useSyncExternalStore } from 'react'
import { BAND_ZOOM } from '../logic/camera-bands'

// The camera's zoom as a percent of the floor band, written from inside the Canvas. Listeners
// hear only a change of whole percent, so a glide does not re-render the HUD every frame.
let percent = 100
const listeners = new Set<() => void>()

function zoomPercentOf(zoom: number): number {
  return Math.round((zoom / BAND_ZOOM.floor) * 100)
}

export function setCameraZoom(zoom: number): void {
  const next = zoomPercentOf(zoom)
  if (next === percent) return
  percent = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useZoomPercent(): number {
  return useSyncExternalStore(subscribe, () => percent)
}
