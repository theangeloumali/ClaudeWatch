import type { ZoomDirection } from '../logic/camera-bands'
import type { MinimapCampus } from '../logic/minimap-model'
import { useZoomPercent } from './camera-zoom'
import { ZoomTools } from './CameraTools'

// Spokes sit over the room tiles: each one ends at its room's edge, so nothing is hidden.
export function CampusMapLayer({
  campus,
  dotRadius
}: {
  campus: MinimapCampus
  dotRadius: number
}) {
  return (
    <g data-campus="" aria-hidden="true">
      {campus.spokes.map(({ from, to }) => (
        <line
          key={`${to.x},${to.z}`}
          x1={from.x}
          y1={from.z}
          x2={to.x}
          y2={to.z}
          className="stroke-text-secondary/40"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1.5}
        />
      ))}
      <circle
        data-campus-hub=""
        cx={campus.hub.x}
        cy={campus.hub.z}
        r={Math.max(dotRadius, campus.hub.radius * 0.35)}
        className="fill-text-primary stroke-surface"
        vectorEffect="non-scaling-stroke"
        strokeWidth={1.5}
      />
    </g>
  )
}

export function CampusZoom({
  onZoom,
  onFit
}: {
  onZoom: (direction: ZoomDirection) => void
  onFit: () => void
}) {
  const percent = useZoomPercent()
  return (
    <div role="group" aria-label="Map zoom" className="flex items-center gap-1">
      <span className="font-mono text-[11px] text-text-secondary tabular-nums">MAP {percent}%</span>
      <ZoomTools isDisabled={false} onZoom={onZoom} onFit={onFit} />
    </div>
  )
}
