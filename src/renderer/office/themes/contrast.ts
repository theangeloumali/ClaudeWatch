import { Color } from 'three'

// WCAG relative luminance, 0 to 1: three's Color holds the linear channels the formula needs.
export function luminance(color: string): number {
  const { r, g, b } = new Color(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}
