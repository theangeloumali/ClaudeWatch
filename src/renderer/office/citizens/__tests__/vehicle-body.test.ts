import { ExtrudeGeometry, Shape, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { getTheme, listThemes } from '../../themes/registry'
import { NOSE_M } from '../zebra-traffic'
import { box, citizenGeometry, mergeParts } from '../figure-parts'

const KIT_THEMES = ['corporate-city', 'cyberpunk-city']
const trianglesOf = (geometry: BufferGeometry): number =>
  (geometry.index?.count ?? geometry.getAttribute('position').count) / 3

describe('the extruded car kit', () => {
  it('each car model stays under 2,500 triangles', () => {
    for (const id of KIT_THEMES) {
      const vehicles = getTheme(id).town?.vehicles ?? []
      expect(vehicles.map((vehicle) => vehicle.role).sort()).toEqual([
        'freight',
        'runabout',
        'transit'
      ])
      for (const vehicle of vehicles) {
        const triangles = trianglesOf(citizenGeometry(vehicle))
        expect(triangles).toBeLessThan(2_500)
        // Extruded bodies and round wheels: well past the old box builds' 85-176.
        expect(triangles).toBeGreaterThan(400)
      }
    }
  })

  it('keeps every kit car inside the length its zebra hold allows', () => {
    for (const id of KIT_THEMES)
      for (const vehicle of getTheme(id).town?.vehicles ?? []) {
        const geometry = citizenGeometry(vehicle)
        geometry.computeBoundingBox()
        const length = (geometry.boundingBox?.max.z ?? 0) - (geometry.boundingBox?.min.z ?? 0)
        expect(length / 2).toBeLessThanOrEqual(NOSE_M[vehicle.role])
      }
  })

  it('the merge keeps indexed and non-indexed parts', () => {
    const triangle = new Shape().moveTo(0, 0).lineTo(1, 0).lineTo(1, 1).closePath()
    const extruded = new ExtrudeGeometry(triangle, { depth: 0.5, bevelEnabled: false })
    expect(extruded.index).toBeNull()
    const vertices = 36 + extruded.getAttribute('position').count
    const merged = mergeParts('kit', [
      box('#123456', [1, 1, 1], [0, 0, 0]),
      { geometry: extruded, color: '#654321' }
    ])
    expect(merged.getAttribute('position').count).toBe(vertices)
    expect(merged.getAttribute('color').count).toBe(vertices)
  })

  it('other themes keep their vehicles', () => {
    const others = listThemes()
      .filter((theme) => !KIT_THEMES.includes(theme.id))
      .map((theme) => [
        theme.id,
        (theme.town?.vehicles ?? []).map((vehicle) => [
          vehicle.name,
          citizenGeometry(vehicle).getAttribute('position').count
        ])
      ])
    expect(others).toEqual([
      [
        'neo-edo-steam',
        [
          ['steam tram', 614],
          ['hand cart', 236],
          ['lantern rickshaw', 387]
        ]
      ],
      [
        'brass-workshop',
        [
          ['brass omnibus', 566],
          ['boiler lorry', 536],
          ['pedal velocipede', 284]
        ]
      ],
      [
        'violet-court',
        [
          ['Banner Coach', 664],
          ['Supply Wain', 638],
          ['Gilded Carriage', 531]
        ]
      ],
      [
        'orbital-garrison',
        [
          ['Patrol Rover', 432],
          ['Cargo Hauler', 432],
          ['Hover Sled', 286]
        ]
      ],
      [
        'quiet-grove',
        [
          ['Pony Trap', 572],
          ['Timber Wagon', 682],
          ['Garden Barrow', 525]
        ]
      ],
      [
        'samurai-empire',
        [
          ['canal loop shuttle', 448],
          ['arcade repair hauler', 424],
          ['signal cargo cycle', 260]
        ]
      ]
    ])
  })
})
