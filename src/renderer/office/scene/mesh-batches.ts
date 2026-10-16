import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Texture,
  type Material,
  type Object3D
} from 'three'

interface SourceMesh {
  mesh: Mesh
  material: Material
  layerMask: number
  count: number
  // What the batch last drew for this source; a frame that matches it writes nothing (perf-1).
  drawnMatrix: Matrix4
  drawnInstances: number
  isDrawnShown: boolean
}
export interface MeshBatch {
  mesh: InstancedMesh
  sources: SourceMesh[]
  // The batch's own white copy of the material, when its parts are tinted per instance.
  tinted: Material | null
}

// Opt-in for see-through parts that are all alike (agent shadows, steam puffs): one geometry,
// one material, and a draw order among them that cannot matter.
export const SHARED_BATCH = 'sharedBatch'

const SHARED_KEY = 'shared:'

// A batched root keeps its own world matrices: frozen when static, refreshed by updateMeshBatches
// each frame otherwise. The renderer's pass over its thousands of parts would repeat that work.
export function createBatchRoot(): Group {
  const root = new Group()
  root.updateMatrixWorld = () => undefined
  return root
}

function colorOf(material: Material): Color | null {
  return 'color' in material && material.color instanceof Color ? material.color : null
}

function batchKey(mesh: Mesh, material: Material): string | null {
  if (!material.visible) return null
  const sharedBatch: unknown = mesh.userData[SHARED_BATCH]
  if (typeof sharedBatch === 'string') return `${SHARED_KEY}${sharedBatch}`
  if (material.transparent) return null
  // Textured signs and per-agent transparent effects keep their own draw and ordering. Tested
  // before serialising: a material's JSON carries its texture's image.
  if ('map' in material && material.map instanceof Texture) return null
  if (!('parameters' in mesh.geometry)) return null
  const geometry = mesh.geometry.toJSON()
  const shading = material.toJSON()
  const { uuid: geometryId, metadata: geometryMetadata, ...shape } = geometry
  // Colour is left out of the key: it is applied per instance, so parts alike in everything
  // else share one draw whatever their colour or theme.
  const { uuid: materialId, metadata: materialMetadata, color, ...surface } = shading
  void geometryId
  void geometryMetadata
  void materialId
  void materialMetadata
  void color
  return JSON.stringify([shape, surface])
}

const WHITE = new Color(1, 1, 1)
const tint = new Color()
const ownTint = new Color()

function tintInstances(batch: InstancedMesh, sources: readonly SourceMesh[]): void {
  let index = 0
  for (const { mesh, material, count } of sources) {
    const base = colorOf(material) ?? WHITE
    for (let part = 0; part < count; part++) {
      tint.copy(base)
      if (mesh instanceof InstancedMesh && mesh.instanceColor) {
        mesh.getColorAt(part, ownTint)
        tint.multiply(ownTint)
      }
      batch.setColorAt(index++, tint)
    }
  }
  if (batch.instanceColor) batch.instanceColor.needsUpdate = true
}

export function createMeshBatches(root: Group): MeshBatch[] {
  const groups = new Map<string, SourceMesh[]>()
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    const key = batchKey(object, object.material)
    if (!key) return
    const sources = groups.get(key) ?? []
    sources.push({
      mesh: object,
      material: object.material,
      layerMask: object.layers.mask,
      count: object instanceof InstancedMesh ? object.count : 1,
      drawnMatrix: new Matrix4(),
      drawnInstances: -1,
      isDrawnShown: false
    })
    groups.set(key, sources)
  })
  const batches: MeshBatch[] = []
  for (const [key, sources] of groups) {
    if (sources.length < 2) continue
    const first = sources[0]
    // A shared batch is all alike and keeps its material; the rest draw through a white copy.
    const tinted =
      !key.startsWith(SHARED_KEY) && colorOf(first.material) ? first.material.clone() : null
    if (tinted) colorOf(tinted)?.copy(WHITE)
    const mesh = new InstancedMesh(
      first.mesh.geometry,
      tinted ?? first.material,
      sources.reduce((sum, source) => sum + source.count, 0)
    )
    if (tinted) tintInstances(mesh, sources)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.renderOrder = first.mesh.renderOrder
    // Controller refs still mutate the originals; only their camera layer is disabled.
    for (const source of sources) source.mesh.layers.disable(0)
    root.add(mesh)
    batches.push({ mesh, sources, tinted })
  }
  prepareRoot(root)
  for (const batch of batches) {
    let index = 0
    for (const source of batch.sources) index = drawSource(batch.mesh, source, index)
    batch.mesh.instanceMatrix.needsUpdate = true
  }
  return batches
}

const MATRIX_FLOATS = 16
const inverseRoot = new Matrix4()
const placed = new Matrix4()
const matrix = new Matrix4()
const instance = new Matrix4()
const hidden = new Matrix4().makeScale(0, 0, 0)

function isVisible(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false
  }
  return true
}

function prepareRoot(root: Group): void {
  root.updateWorldMatrix(true, true)
  inverseRoot.copy(root.matrixWorld).invert()
}

function instanceVersionOf(mesh: Mesh): number {
  return mesh instanceof InstancedMesh ? mesh.instanceMatrix.version : 0
}

// Writes the source's parts from `index` and records what was drawn; returns the next index.
function drawSource(batch: InstancedMesh, source: SourceMesh, index: number): number {
  const isShown = isVisible(source.mesh)
  placed.multiplyMatrices(inverseRoot, source.mesh.matrixWorld)
  for (let part = 0; part < source.count; part++) {
    if (source.mesh instanceof InstancedMesh) {
      source.mesh.getMatrixAt(part, instance)
      matrix.multiplyMatrices(placed, instance)
    } else matrix.copy(placed)
    batch.setMatrixAt(index + part, isShown ? matrix : hidden)
  }
  source.drawnMatrix.copy(source.mesh.matrixWorld)
  source.drawnInstances = instanceVersionOf(source.mesh)
  source.isDrawnShown = isShown
  return index + source.count
}

// A hidden source stays hidden however it moves; a shown one is redrawn when it or its own
// instances moved. A root that moved moves every source with it.
function isStale(source: SourceMesh): boolean {
  const isShown = isVisible(source.mesh)
  if (isShown !== source.isDrawnShown) return true
  return (
    isShown &&
    (!source.drawnMatrix.equals(source.mesh.matrixWorld) ||
      source.drawnInstances !== instanceVersionOf(source.mesh))
  )
}

export function updateMeshBatches(root: Group, batches: readonly MeshBatch[]): void {
  prepareRoot(root)
  for (const batch of batches) {
    const { instanceMatrix } = batch.mesh
    let index = 0
    for (const source of batch.sources) {
      if (!isStale(source)) {
        index += source.count
        continue
      }
      instanceMatrix.addUpdateRange(index * MATRIX_FLOATS, source.count * MATRIX_FLOATS)
      instanceMatrix.needsUpdate = true
      index = drawSource(batch.mesh, source, index)
    }
  }
}

export function releaseMeshBatches(root: Group, batches: readonly MeshBatch[]): void {
  for (const batch of batches) {
    for (const source of batch.sources) source.mesh.layers.mask = source.layerMask
    root.remove(batch.mesh)
    batch.mesh.dispose()
    batch.tinted?.dispose()
  }
}

// Parts that never move are frozen once placed: three.js otherwise recomposes every object's
// matrix on every frame, and a town is thousands of objects.
export function freezeMatrices(root: Object3D): void {
  root.updateWorldMatrix(true, true)
  root.traverse((object) => {
    object.matrixAutoUpdate = false
    object.matrixWorldNeedsUpdate = false
  })
}

// Before they are placed again: positions set since the freeze are taken up here.
export function thawMatrices(root: Object3D): void {
  root.traverse((object) => {
    object.matrixAutoUpdate = true
  })
  root.updateWorldMatrix(true, true)
}
