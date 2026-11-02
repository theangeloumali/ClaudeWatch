export interface SceneMotion {
  mark(): void
  take(): boolean
}

// A layer animating on its own clock (a courier, the Brain's pulse) marks it; the render loop
// takes it each frame and holds the walking rate, as a walking agent would.
export function createSceneMotion(): SceneMotion {
  let isMarked = false
  return {
    mark: () => {
      isMarked = true
    },
    take: () => {
      const wasMarked = isMarked
      isMarked = false
      return wasMarked
    }
  }
}

export const sceneMotion = createSceneMotion()
