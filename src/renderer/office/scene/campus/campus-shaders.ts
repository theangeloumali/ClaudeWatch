import { AdditiveBlending, ShaderMaterial, type IUniform } from 'three'
import { campusClock } from '../../logic/campus-motion'

// A soft round dot for every glow sprite; colour arrives as vColor and vAlpha.
export const SOFT_DOT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float edge = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vColor * vAlpha * edge, 1.0);
  #include <colorspace_fragment>
}
`

// Additive and unlit, on the shared Campus clock: the shader animates, the CPU writes nothing.
export function campusGlowMaterial(
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, IUniform> = {}
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uTime: campusClock.uTime, ...uniforms },
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  })
}
