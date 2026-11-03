import { describe, expect, it } from 'vitest'
import { createSceneMotion } from '../../logic/scene-motion'

describe('scene motion', () => {
  it('reports a mark once, then nothing until marked again', () => {
    const motion = createSceneMotion()
    expect(motion.take()).toBe(false)
    motion.mark()
    motion.mark()
    expect(motion.take()).toBe(true)
    expect(motion.take()).toBe(false)
  })
})
