import {
  AdditiveBlending,
  CanvasTexture,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace
} from 'three'
import { campusClock } from '../../logic/campus-motion'
import { MONITOR_COLORS } from '../../office-palette'
import { BOOK_COLORS, NIGHT_CAMPUS_PALETTE } from './palette'

const CODE_SCROLL_PER_S = 0.06
const CHART_SCROLL_PER_S = 0.04
const LAMP_BREATH_S = 4.2

export interface CampusSurfaces {
  plane: PlaneGeometry
  workingScreen: MeshBasicMaterial
  idleScreen: MeshBasicMaterial
  lampGlow: MeshBasicMaterial
  sparkline: MeshBasicMaterial
}

function drawn(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  draw(context)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

// Indented lines in a few syntax colours; the pattern wraps, so the scroll never jumps.
const codeLines = (context: CanvasRenderingContext2D) => {
  context.fillStyle = MONITOR_COLORS.background
  context.fillRect(0, 0, 128, 256)
  for (let line = 0; line < 16; line++) {
    const indent = ((line * 7) % 4) * 10
    const length = 30 + ((line * 37) % 60)
    context.fillStyle = BOOK_COLORS[line % BOOK_COLORS.length]
    context.fillRect(10 + indent, line * 16 + 5, length, 6)
  }
}

const glowPool = (context: CanvasRenderingContext2D) => {
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
}

// A line that ends where it starts, so the wrapped scroll stays continuous.
const sparkline = (context: CanvasRenderingContext2D) => {
  context.clearRect(0, 0, 256, 64)
  context.strokeStyle = '#ffffff'
  context.lineWidth = 4
  context.beginPath()
  for (let x = 0; x <= 256; x += 8) {
    const wave = Math.sin((x / 256) * Math.PI * 4) * 14 + Math.sin((x / 256) * Math.PI * 6) * 8
    context.lineTo(x, 32 - wave)
  }
  context.stroke()
}

// Edits the map sample (and alpha) to move with the shared Campus clock, so it needs no frame loop.
function onCampusClock(material: MeshBasicMaterial, name: string, sample: string, alpha = '') {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = campusClock.uTime
    shader.fragmentShader = `uniform float uTime;\n${shader.fragmentShader.replace(
      '#include <map_fragment>',
      `diffuseColor *= texture2D(map, ${sample});\n${alpha}`
    )}`
  }
  material.customProgramCacheKey = () => name
  return material
}

function createSurfaces(): CampusSurfaces | null {
  if (typeof document === 'undefined') return null
  const code = drawn(128, 256, codeLines)
  const pool = drawn(128, 128, glowPool)
  const line = drawn(256, 64, sparkline)
  if (!code || !pool || !line) return null
  return {
    plane: new PlaneGeometry(1, 1),
    workingScreen: onCampusClock(
      new MeshBasicMaterial({ map: code, toneMapped: false }),
      'campus-code-scroll',
      `vMapUv + vec2(0.0, uTime * ${CODE_SCROLL_PER_S})`
    ),
    // Idle desks hold the same page, dimmed and still.
    idleScreen: new MeshBasicMaterial({ map: code, color: '#4a5266', toneMapped: false }),
    // Mirrors breath() in campus-motion, run on the GPU.
    lampGlow: onCampusClock(
      new MeshBasicMaterial({
        map: pool,
        color: NIGHT_CAMPUS_PALETTE.glow,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false
      }),
      'campus-lamp-breath',
      'vMapUv',
      `diffuseColor.a *= 0.45 + 0.35 * (0.5 - 0.5 * cos(6.2832 * uTime / ${LAMP_BREATH_S}));`
    ),
    sparkline: onCampusClock(
      new MeshBasicMaterial({
        map: line,
        color: NIGHT_CAMPUS_PALETTE.glow,
        transparent: true,
        depthWrite: false,
        toneMapped: false
      }),
      'campus-sparkline-scroll',
      `vMapUv + vec2(uTime * ${CHART_SCROLL_PER_S}, 0.0)`
    )
  }
}

let surfaces: CampusSurfaces | null | undefined

// Built on first use, and shared by every room and desk; null where there is no 2D canvas.
export function campusSurfaces(): CampusSurfaces | null {
  if (surfaces === undefined) surfaces = createSurfaces()
  return surfaces
}
