import { CanvasTexture, SRGBColorSpace } from 'three'
import { MONITOR_COLORS } from '../office-palette'
import type { WorkstationDisplay } from '../logic/workstation-displays'

// dry-new: brass plaques cannot represent live screen state; each mounted display owns this texture.
export function monitorTexture({
  title,
  detail,
  color
}: Pick<WorkstationDisplay, 'title' | 'detail' | 'color'>): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 288
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable')
  context.fillStyle = MONITOR_COLORS.background
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = MONITOR_COLORS.secondary
  context.font = '500 22px system-ui, sans-serif'
  context.fillText('SESSION ACTIVITY', 28, 44)
  context.fillStyle = color
  context.fillRect(28, 65, 456, 4)
  context.fillStyle = MONITOR_COLORS.text
  context.font = '700 72px system-ui, sans-serif'
  context.fillText(title, 28, 142, 456)
  context.fillStyle = MONITOR_COLORS.secondary
  context.font = '500 48px system-ui, sans-serif'
  context.fillText(detail, 28, 200, 456)
  context.fillStyle = MONITOR_COLORS.divider
  context.fillRect(28, 241, 456, 1)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
