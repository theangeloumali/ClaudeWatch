export interface Span {
  min: number
  max: number
}

// FNV-1a: the same text gives the same number on every machine and every start.
export function hashOf(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// The nth value in [0, 1) drawn from a seed.
export function draw(seed: number, nth: number): number {
  let mixed = (seed + Math.imul(nth + 1, 0x9e3779b9)) | 0
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b)
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35)
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 0x100000000
}

export const between = (range: Span, share: number): number =>
  range.min + (range.max - range.min) * share
