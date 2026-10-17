import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type BufferGeometry,
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

const batchRoots = new WeakSet<Object3D>()

// A batched root keeps its own world matrices: frozen when static, refreshed by updateMeshBatches
// each frame otherwise. The renderer's pass over its thousands of parts would repeat that work.
export function createBatchRoot(): Group {
  const root = new Group()
  root.updateMatrixWorld = () => undefined
  batchRoots.add(root)
  return root
}

// A batch nested in another owns its subtree, so each rebuilds and freezes alone (perf-11).
function traverseOwn(root: Object3D, visit: (object: Object3D) => void): void {
  visit(root)
  for (const child of root.children) if (!batchRoots.has(child)) traverseOwn(child, visit)
}

function colorOf(material: Material): Color | null {
  return 'color' in material && material.color instanceof Color ? material.color : null
}

// Keys outlive a rebuild (perf-3). A geometry never changes once built: new args make a new one.
const shapeKeys = new WeakMap<BufferGeometry, string>()
// A material is changed in place by React, which bumps no version; these are the props the
// scene sets, and a cached key stands only while they match.
const surfaceKeys = new WeakMap<Material, { props: string; key: string }>()

function shapeKey(geometry: BufferGeometry): string {
  let key = shapeKeys.get(geometry)
  if (key === undefined) {
    const { uuid, metadata, ...shape } = geometry.toJSON()
    void uuid
    void metadata
    key = JSON.stringify(shape)
    shapeKeys.set(geometry, key)
  }
  return key
}

function liveProps(material: Material): string {
  const props: unknown[] = [material.version, material.side, material.toneMapped, material.opacity]
  if (material instanceof MeshStandardMaterial)
    props.push(
      material.roughness,
      material.metalness,
      material.emissive.getHex(),
      material.emissiveIntensity
    )
  return props.join('|')
}

function surfaceKey(material: Material): string {
  const props = liveProps(material)
  const cached = surfaceKeys.get(material)
  if (cached?.props === props) return cached.key
  // Colour is left out of the key: it is applied per instance, so parts alike in everything
  // else share one draw whatever their colour or theme.
  const { uuid, metadata, color, ...surface } = material.toJSON()
  void uuid
  void metadata
  void color
  const key = JSON.stringify(surface)
  surfaceKeys.set(material, { props, key })
  return key
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
  return `${shapeKey(mesh.geometry)}${surfaceKey(material)}`
}

const WHITE = new Color(1, 1, 1)
const tint = new Color()
const ownTint = new Color()

// The colour a source part draws in when nothing re-tints it.
function ownColorOf({ mesh, material }: SourceMesh, part: number, out: Color): Color {
  out.copy(colorOf(material) ?? WHITE)
  if (mesh instanceof InstancedMesh && mesh.instanceColor) {
    mesh.getColorAt(part, ownTint)
    out.multiply(ownTint)
  }
  return out
}

function tintInstances(batch: InstancedMesh, sources: readonly SourceMesh[]): void {
  let index = 0
  for (const source of sources)
    for (let part = 0; part < source.count; part++)
      batch.setColorAt(index++, ownColorOf(source, part, tint))
  if (batch.instanceColor) batch.instanceColor.needsUpdate = true
}

// What a source part draws in place of its own colour; null keeps its own.
type TintOf = (mesh: Mesh, own: Color) => Color | null

const COLOR_FLOATS = 3

const isDrawn = (drawn: ArrayLike<number>, at: number, color: Color): boolean =>
  drawn[at] === Math.fround(color.r) &&
  drawn[at + 1] === Math.fround(color.g) &&
  drawn[at + 2] === Math.fround(color.b)

// Writes only the parts whose colour changes and uploads their span; no batch is rebuilt.
export function retintBatches(batches: readonly MeshBatch[], tintOf: TintOf): void {
  for (const { mesh: batch, sources, tinted } of batches) {
    const colors = batch.instanceColor
    if (!tinted || !colors) continue
    let first = -1
    let last = -1
    let index = 0
    for (const source of sources)
      for (let part = 0; part < source.count; part++, index++) {
        const own = ownColorOf(source, part, tint)
        const next = tintOf(source.mesh, own) ?? own
        if (isDrawn(colors.array, index * COLOR_FLOATS, next)) continue
        batch.setColorAt(index, next)
        if (first < 0) first = index
        last = index
      }
    if (first < 0) continue
    colors.addUpdateRange(first * COLOR_FLOATS, (last - first + 1) * COLOR_FLOATS)
    colors.needsUpdate = true
  }
}

// Each root's live batches, for layers that re-tint what a BatchedScene already draws.
const rootBatches = new WeakMap<Object3D, readonly MeshBatch[]>()

export const batchesOf = (root: Object3D): readonly MeshBatch[] => rootBatches.get(root) ?? []

export function createMeshBatches(root: Group): MeshBatch[] {
  const groups = new Map<string, SourceMesh[]>()
  traverseOwn(root, (object) => {
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
  rootBatches.set(root, batches)
  return batches
}

const MATRIX_FLOATS = 16
const inverseRoot = new Matrix4()
const placed = new Matrix4()
const matrix = new Matrix4()
const instance = new Matrix4()
const hidden = new Matrix4().makeScale(0, 0, 0)

// The root of the pass in progress: set by prepareRoot with inverseRoot.
let passRoot: Object3D | null = null

// Above the root, a hidden ancestor hides the batch itself. A source React has unmounted since
// the build never reaches the root, and is hidden too.
function isVisible(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (current === passRoot) return true
    if (!current.visible) return false
  }
  return false
}

function prepareRoot(root: Group): void {
  root.updateWorldMatrix(true, true)
  inverseRoot.copy(root.matrixWorld).invert()
  passRoot = root
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
  if (rootBatches.get(root) === batches) rootBatches.delete(root)
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
  traverseOwn(root, (object) => {
    object.matrixAutoUpdate = false
    object.matrixWorldNeedsUpdate = false
  })
}

// Before they are placed again: positions set since the freeze are taken up here.
export function thawMatrices(root: Object3D): void {
  traverseOwn(root, (object) => {
    object.matrixAutoUpdate = true
  })
  root.updateWorldMatrix(true, true)
}
