import type { CSSProperties } from 'react'
import { cn } from '../../lib/utils'
import type { MinimapModel } from '../logic/minimap-model'
import type { Bounds } from '../logic/zone-framing'
import type { MinimapProps } from './Minimap'

interface MinimapSurfaceProps extends Pick<
  MinimapProps,
  'viewMode' | 'onChooseFloor' | 'onChooseRoom' | 'onChooseWorker'
> {
  model: MinimapModel
  descriptionId: string
}

// Full-size selectors provide equivalent targets without enlarging overlapping map glyphs.
const MAP_TARGET_CLASS =
  'absolute inline-flex items-center justify-center rounded text-xs text-text-primary cursor-pointer touch-manipulation bg-transparent p-0 hover:bg-surface-hover/40 focus-visible:ring-2 focus-visible:ring-brass aria-[current=true]:ring-1 aria-[current=true]:ring-brass'

// dry-new: native hit targets must share the SVG's aspect-preserving world projection.
export function MinimapSurface({
  model,
  viewMode,
  descriptionId,
  ...callbacks
}: MinimapSurfaceProps) {
  const bounds = model.bounds
  if (!bounds) return null
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
  return (
    <div className="relative mx-auto aspect-square w-full max-w-48 rounded-md bg-surface p-6">
      <div className="relative size-full">
        <div
          className="absolute"
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
            {model.workers.map((worker) => (
              <g key={worker.agentKey}>
                {worker.isSelected && (
                  <circle
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
    left: `${((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`,
    top: `${((point.z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * 100}%`,
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
