import {
  ChevronDown,
  ChevronUp,
  Maximize,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from 'lucide-react'
import type { BottomBarProps } from './BottomBar'
import { BAR_BUTTON_CLASS, KBD_CLASS } from './hud-styles'

interface CameraToolsProps extends Pick<
  BottomBarProps,
  'onRotate' | 'onTilt' | 'onZoom' | 'onFit'
> {
  isDisabled: boolean
}

// dry-new: the extracted existing camera group is disclosed without duplicating its controls.
export function CameraTools({ isDisabled, onRotate, onTilt, onZoom, onFit }: CameraToolsProps) {
  return (
    <div role="group" aria-label="Camera" className="flex min-w-0 max-w-full flex-wrap gap-1">
      <CameraButton
        label="Rotate left"
        shortcut="Q"
        Icon={RotateCcw}
        isDisabled={isDisabled}
        onClick={() => onRotate(-1)}
      />
      <CameraButton
        label="Rotate right"
        shortcut="E"
        Icon={RotateCw}
        isDisabled={isDisabled}
        onClick={() => onRotate(1)}
      />
      {onTilt && (
        <>
          <CameraButton
            label="Tilt up"
            shortcut="PageUp"
            Icon={ChevronUp}
            isDisabled={isDisabled}
            onClick={() => onTilt(1)}
          />
          <CameraButton
            label="Tilt down"
            shortcut="PageDown"
            Icon={ChevronDown}
            isDisabled={isDisabled}
            onClick={() => onTilt(-1)}
          />
        </>
      )}
      <CameraButton
        label="Zoom out"
        shortcut="-"
        Icon={ZoomOut}
        isDisabled={isDisabled}
        onClick={() => onZoom('out')}
      />
      <CameraButton
        label="Zoom in"
        shortcut="="
        Icon={ZoomIn}
        isDisabled={isDisabled}
        onClick={() => onZoom('in')}
      />
      <CameraButton
        label="Fit"
        shortcut="0"
        Icon={Maximize}
        isDisabled={isDisabled}
        onClick={onFit}
      />
    </div>
  )
}

function CameraButton(props: {
  label: string
  shortcut: string
  Icon: LucideIcon
  isDisabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={
        props.label === 'Fit' ? `${props.label}, shortcut ${props.shortcut}` : props.label
      }
      title={props.label}
      aria-keyshortcuts={props.shortcut}
      disabled={props.isDisabled}
      onClick={props.onClick}
      className={BAR_BUTTON_CLASS}
    >
      <props.Icon aria-hidden="true" className="size-3.5" />
      <kbd className={KBD_CLASS}>{props.shortcut}</kbd>
    </button>
  )
}
