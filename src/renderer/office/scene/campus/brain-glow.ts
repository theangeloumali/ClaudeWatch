import { BufferAttribute, BufferGeometry, type Color } from 'three'

// Motes rise up the beam and fade at both ends; `seed` is (offset, angle, size).
export const MOTE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uHeight;
attribute vec3 seed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float rise = fract(seed.x + uTime * (0.04 + 0.03 * seed.z));
  float angle = seed.y * 6.2832 + uTime * 0.6;
  float radius = 0.2 + 0.7 * seed.z;
  vec3 at = vec3(cos(angle) * radius, rise * uHeight, sin(angle) * radius);
  vColor = color;
  vAlpha = sin(rise * 3.1416);
  gl_PointSize = 3.0 + 4.0 * seed.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 1.0);
}
`

// Sparks drift round the plaza, bobbing and flickering; `seed` is (offset, angle, reach).
export const SPARK_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uRadius;
attribute vec3 seed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float turn = (seed.x > 0.5 ? 1.0 : -1.0) * (0.05 + 0.1 * seed.z);
  float angle = seed.y * 6.2832 + uTime * turn;
  float radius = uRadius * (0.3 + 0.7 * seed.z);
  float height = 0.4 + 2.6 * fract(seed.x * 7.0) + 0.4 * sin(uTime * 1.3 + seed.x * 20.0);
  vec3 at = vec3(cos(angle) * radius, height, sin(angle) * radius);
  vColor = color;
  vAlpha = 0.25 + 0.75 * (0.5 + 0.5 * sin(uTime * (1.5 + 3.0 * seed.z) + seed.x * 40.0));
  gl_PointSize = 2.0 + 3.0 * fract(seed.y * 13.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 1.0);
}
`

// Deterministic seeds, so every load and screenshot draws the same motes.
export function seededPoints(
  count: number,
  salt: number,
  colors: readonly Color[]
): BufferGeometry {
  const seeds = new Float32Array(count * 3)
  const tints = new Float32Array(count * 3)
  let state = salt >>> 0
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  for (let index = 0; index < count; index++) {
    seeds.set([random(), random(), random()], index * 3)
    colors[index % colors.length].toArray(tints, index * 3)
  }
  const geometry = new BufferGeometry()
  // Placed in the shader; three still needs a position attribute to count the points.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('seed', new BufferAttribute(seeds, 3))
  geometry.setAttribute('color', new BufferAttribute(tints, 3))
  return geometry
}
