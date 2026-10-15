export function entranceApproach(
  floor: { x: number; z: number; width: number; depth: number },
  entrance: { x: number; z: number }
) {
  const onSide =
    Math.abs(Math.abs(entrance.x - floor.x) - floor.width / 2) <
    Math.abs(Math.abs(entrance.z - floor.z) - floor.depth / 2)
  return {
    x: entrance.x + (onSide ? Math.sign(entrance.x - floor.x) * 1.2 : 0),
    z: entrance.z + (onSide ? 0 : Math.sign(entrance.z - floor.z) * 1.2)
  }
}
