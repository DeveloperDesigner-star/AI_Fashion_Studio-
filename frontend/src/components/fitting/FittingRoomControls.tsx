import {
  CAMERA_PRESETS,
  RIG_ANIMATIONS,
  animationMeta,
  type RigAnimationId,
  type ViewId,
} from '@/lib/fittingRoom'
import { cn } from '@/lib/format'

interface FittingRoomControlsProps {
  animation: RigAnimationId
  speed: number
  paused: boolean
  autoRotate: boolean
  view: ViewId
  fullscreen: boolean
  compact?: boolean
  onAnimation: (animation: RigAnimationId) => void
  onSpeed: (speed: number) => void
  onTogglePause: () => void
  onToggleAutoRotate: () => void
  onView: (view: ViewId) => void
  onZoom: (direction: 'in' | 'out') => void
  onReset: () => void
  onToggleFullscreen: () => void
}

function ChipButton({
  label,
  active = false,
  onClick,
  className,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  className?: string
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-1 border px-2.5 py-1.5 text-[0.625rem] uppercase tracking-[0.1em] transition-colors',
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-line/90 bg-paper/85 text-ink-muted hover:border-ink hover:text-ink',
        className,
      )}
    >
      {children ?? label}
    </button>
  )
}

/**
 * DOM-only toolbar for the WebGL viewport. Kept separate from the Canvas so
 * the animation/camera controls stay keyboard- and screen-reader accessible.
 */
export function FittingRoomControls({
  animation,
  speed,
  paused,
  autoRotate,
  view,
  fullscreen,
  compact = false,
  onAnimation,
  onSpeed,
  onTogglePause,
  onToggleAutoRotate,
  onView,
  onZoom,
  onReset,
  onToggleFullscreen,
}: FittingRoomControlsProps) {
  const meta = animationMeta(animation)
  const viewLabel =
    view === 'free'
      ? 'Free angle'
      : (CAMERA_PRESETS.find((preset) => preset.id === view)?.label ?? 'Front')

  return (
    <div className="relative z-10 border-t border-line bg-paper/95 backdrop-blur-sm" data-testid="fitting-controls">
      <div>
        <div
          role="toolbar"
          aria-label="3D fitting room controls"
          className={cn(
            'flex flex-wrap items-center gap-x-4 gap-y-2 px-2.5 py-2 sm:px-3',
            compact && 'gap-x-2',
          )}
        >
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Animation">
            <span className="mr-1 text-[0.5rem] uppercase tracking-[0.16em] text-ink-muted">Motion</span>
            {RIG_ANIMATIONS.map((entry) => (
              <ChipButton
                key={entry.id}
                label={entry.shortLabel}
                active={animation === entry.id}
                onClick={() => onAnimation(entry.id)}
              >
                {entry.shortLabel}
              </ChipButton>
            ))}
            <ChipButton
              label={paused ? 'Play animation' : 'Pause animation'}
              active={paused}
              onClick={onTogglePause}
            >
              {paused ? 'Play' : 'Pause'}
            </ChipButton>
            <ChipButton label="Turntable" active={autoRotate} onClick={onToggleAutoRotate}>
              Spin
            </ChipButton>
            <label className="ml-1 flex min-h-9 items-center gap-1.5 text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
              <span className="sr-only">Animation speed</span>
              <input
                type="range"
                min={0.4}
                max={1.6}
                step={0.1}
                value={speed}
                aria-label="Animation speed"
                onChange={(event) => onSpeed(Number(event.target.value))}
                className="h-1 w-16 accent-ink sm:w-20"
              />
              <span aria-live="off" className="w-7 tabular-nums text-ink">
                ×{speed.toFixed(1)}
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Camera">
            <span className="mr-1 text-[0.5rem] uppercase tracking-[0.16em] text-ink-muted">Camera</span>
            {CAMERA_PRESETS.map((preset) => (
              <ChipButton
                key={preset.id}
                label={`${preset.label} view`}
                active={view === preset.id}
                onClick={() => onView(preset.id)}
              >
                {preset.label}
              </ChipButton>
            ))}
            <ChipButton label="Reset camera" onClick={onReset}>
              Reset
            </ChipButton>
            <ChipButton label="Zoom in" onClick={() => onZoom('in')}>
              +
            </ChipButton>
            <ChipButton label="Zoom out" onClick={() => onZoom('out')}>
              −
            </ChipButton>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted sm:inline">
              {meta.shortLabel} · {viewLabel}
            </span>
            <ChipButton
              label={fullscreen ? 'Exit full screen' : 'Full screen'}
              active={fullscreen}
              onClick={onToggleFullscreen}
            >
              {fullscreen ? 'Exit' : 'Full screen'}
            </ChipButton>
          </div>
        </div>

        <p className="hidden px-3 pb-2 text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted sm:block">
          Drag to rotate · scroll or pinch to zoom · right-drag or two fingers to move · fitted sample
          wardrobe only
        </p>
        <p className="px-2.5 pb-2 text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted sm:hidden">
          Drag to rotate · pinch to zoom · two fingers to move
        </p>
      </div>
    </div>
  )
}
