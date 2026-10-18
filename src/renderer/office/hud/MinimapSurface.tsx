import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { clamp } from '../../../shared/range'
import { cn } from '../../lib/utils'
import { percentAlong, type MinimapModel } from '../logic/minimap-model'
import { officeView, type MapPoint } from '../logic/office-view'
import type { Bounds } from '../logic/zone-framing'
import type { MinimapProps } from './Minimap'
import { useMinimapLive } from './use-minimap-live'

interface MinimapSurfaceProps extends Pick<
  MinimapProps,
  'viewMode' | 'onChooseFloor' | 'onChooseRoom' | 'onChooseWorker' | 'onPan'
> {
  model: MinimapModel
  descriptionId: string
}

// Full-size selectors provide equivalent targets without enlarging overlapping map glyphs.
const MAP_TARGET_CLASS =
  'absolute inline-flex items-center justify-center rounded text-xs text-text-primary cursor-pointer touch-manipulation bg-transparent p-0 hover:bg-surface-hover/40 focus-visible:ring-2 focus-visible:ring-brass aria-[current=true]:ring-1 aria-[current=true]:ring-brass'

// An arrow key moves the view an eighth of the map, north up.
const ARROW_STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}
// A press within this of the last pan steps on from where that pan is headed.
const PAN_SETTLE_MS = 1000

const clampTo = (bounds: Bounds, point: MapPoint): MapPoint => ({
  x: clamp(point.x, [bounds.minX, bounds.maxX]),
  z: clamp(point.z, [bounds.minZ, bounds.maxZ])
})

// dry-new: native hit targets must share the SVG's aspect-preserving world projection.
export function MinimapSurface({ model, ...props }: MinimapSurfaceProps) {
  return model.bounds ? <MapArea {...props} model={model} bounds={model.bounds} /> : null
}

function MapArea({
  model,
  bounds,
  viewMode,
  descriptionId,
  onPan,
  ...callbacks
}: Omit<MinimapSurfaceProps, 'model'> & { model: MinimapModel; bounds: Bounds }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<{ point: MapPoint; atMs: number } | null>(null)
  useMinimapLive(mapRef, bounds, onPan !== undefined)
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const mapWidth = Math.min(1, width / depth) * 100
  const mapHeight = Math.min(1, depth / width) * 100
  const radius = Math.min(width, depth) / 70
  const titleId = `${descriptionId}-title`
  // City clicks choose offices; the full-size chooser keeps crowded workers reachable.
  const targetLayers = { floor: viewMode === 'city' ? 'z-30' : 'z-0', room: 'z-10' }
  const footprints = [
    ...model.floors.map((floor) => ({ ...floor, id: floor.floorId, kind: 'floor' as const })),
    ...model.rooms.map((room) => ({ ...room, kind: 'room' as const }))
  ]
  const pan = (point: MapPoint): void => {
    const destination = clampTo(bounds, point)
    pendingRef.current = { point: destination, atMs: Date.now() }
    onPan?.(destination)
  }
  // Open ground pans; a floor, room or worker button keeps its own meaning.
  const panToTap = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target instanceof Element && event.target.closest('button')) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    pan({
      x: bounds.minX + ((event.clientX - rect.left) / rect.width) * width,
      z: bounds.minZ + ((event.clientY - rect.top) / rect.height) * depth
    })
  }
  const panByKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = ARROW_STEPS[event.key]
    if (!step || event.target !== event.currentTarget) return
    // Taken here, so the camera's own arrow-key pan leaves it alone.
    event.preventDefault()
    const pending = pendingRef.current
    const view = officeView.read()
    const from =
      pending && Date.now() - pending.atMs < PAN_SETTLE_MS
        ? pending.point
        : view
          ? { x: view.x, z: view.z }
          : { x: bounds.minX + width / 2, z: bounds.minZ + depth / 2 }
    pan({ x: from.x + (step[0] * width) / 8, z: from.z + (step[1] * depth) / 8 })
  }
  return (
    <div className="relative mx-auto aspect-square w-full max-w-48 rounded-md bg-surface p-6">
      <div className="relative size-full">
        <div
          ref={mapRef}
          {...(onPan && {
            role: 'application',
            'aria-label': `${viewMode === 'city' ? 'City' : 'Office'} map`,
            'aria-describedby': descriptionId,
            tabIndex: 0,
            onClick: panToTap,
            onKeyDown: panByKey
          })}
          className="absolute rounded-sm focus-visible:ring-2 focus-visible:ring-brass"
          style={{
            width: `${mapWidth}%`,
            height: `${mapHeight}%`,
            left: `${(100 - mapWidth) / 2}%`,
            top: `${(100 - mapHeight) / 2}%`
          }}
        >
          <svg
            role="img"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            viewBox={`${bounds.minX} ${bounds.minZ} ${width} ${depth}`}
            preserveAspectRatio="xMidYMid meet"
            className="pointer-events-none absolute inset-0 size-full"
          >
            <title id={titleId}>North-up {viewMode} map</title>
            {model.railway && (
              <g data-railway="" aria-hidden="true" className="stroke-text-secondary">
                <polyline
                  points={model.railway.ring.map((point) => `${point.x},${point.z}`).join(' ')}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                {model.railway.stations.map((station) => (
                  <circle
                    key={`${station.x},${station.z}`}
                    cx={station.x}
                    cy={station.z}
                    r={radius * 1.2}
                    className="fill-surface"
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            )}
            {footprints.map((footprint) => (
              <rect
                key={`${footprint.kind}:${footprint.id}`}
                x={footprint.bounds.minX}
                y={footprint.bounds.minZ}
                width={footprint.bounds.maxX - footprint.bounds.minX}
                height={footprint.bounds.maxZ - footprint.bounds.minZ}
                vectorEffect="non-scaling-stroke"
                strokeWidth={footprint.isSelected ? 2 : 1}
                className={cn(
                  'fill-surface-hover',
                  footprint.isSelected ? 'stroke-brass' : 'stroke-border-strong'
                )}
              />
            ))}
            {onPan && (
              <polygon
                data-view-footprint=""
                aria-hidden="true"
                className="fill-brass/10 stroke-brass"
                vectorEffect="non-scaling-stroke"
                strokeWidth={1.5}
              />
            )}
            {model.workers.map((worker) => (
              <g key={worker.agentKey}>
                {worker.isSelected && (
                  <circle
                    data-agent-ring={worker.agentKey}
                    cx={worker.x}
                    cy={worker.z}
                    r={radius * 2}
                    fill="none"
                    className="stroke-brass"
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={2}
                  />
                )}
                <circle
                  data-agent-key={worker.agentKey}
                  cx={worker.x}
                  cy={worker.z}
                  r={radius}
                  className="fill-text-secondary"
                >
                  <title>{worker.label}</title>
                </circle>
              </g>
            ))}
            {model.player && (
              <circle
                data-player
                cx={model.player.x}
                cy={model.player.z}
                r={radius * 1.4}
                className="fill-accent stroke-text-primary"
                vectorEffect="non-scaling-stroke"
              >
                <title>You</title>
              </circle>
            )}
          </svg>
          {footprints.map((footprint) => (
            <button
              key={`${footprint.kind}:${footprint.id}`}
              type="button"
              data-floor-id={footprint.kind === 'floor' ? footprint.id : undefined}
              data-room-id={footprint.kind === 'room' ? footprint.id : undefined}
              aria-label={`Open ${footprint.kind === 'floor' ? 'office' : 'work area'} ${footprint.label} on minimap`}
              aria-current={footprint.isSelected ? 'true' : undefined}
              title={footprint.label}
              style={footprintStyle(footprint.bounds, bounds)}
              className={cn(MAP_TARGET_CLASS, targetLayers[footprint.kind])}
              onClick={() =>
                footprint.kind === 'floor'
                  ? callbacks.onChooseFloor(footprint.id)
                  : callbacks.onChooseRoom(footprint.id)
              }
            >
              <span
                className={cn(
                  'block w-full min-w-0 truncate px-1',
                  footprint.kind === 'floor' && viewMode === 'office' && 'sr-only'
                )}
              >
                {footprint.label}
              </span>
            </button>
          ))}
          {model.workers.map((worker) => (
            <button
              key={worker.agentKey}
              type="button"
              data-worker-key={worker.agentKey}
              aria-label={`Inspect worker ${worker.label} on minimap`}
              aria-current={worker.isSelected ? 'true' : undefined}
              title={worker.label}
              style={pointStyle(worker, bounds)}
              className={cn(
                MAP_TARGET_CLASS,
                'z-20 size-4 rounded-full hover:ring-1 hover:ring-brass'
              )}
              onClick={() => callbacks.onChooseWorker(worker.agentKey)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function pointStyle(point: { x: number; z: number }, bounds: Bounds): CSSProperties {
  return {
    position: 'absolute',
    left: percentAlong(point.x, bounds.minX, bounds.maxX),
    top: percentAlong(point.z, bounds.minZ, bounds.maxZ),
    transform: 'translate(-50%, -50%)'
  }
}

function footprintStyle(footprint: Bounds, bounds: Bounds): CSSProperties {
  return {
    ...pointStyle(
      {
        x: footprint.minX + (footprint.maxX - footprint.minX) / 2,
        z: footprint.minZ + (footprint.maxZ - footprint.minZ) / 2
      },
      bounds
    ),
    width: `${((footprint.maxX - footprint.minX) / (bounds.maxX - bounds.minX)) * 100}%`,
    height: `${((footprint.maxZ - footprint.minZ) / (bounds.maxZ - bounds.minZ)) * 100}%`
  }
}
