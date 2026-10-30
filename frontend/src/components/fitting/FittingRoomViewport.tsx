import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useGLTF, useProgress } from '@react-three/drei'
import { FittingRoomScene, type CameraAction, type CameraCommand } from '@/components/three/FittingRoomScene'
import { FittingRoomControls } from '@/components/fitting/FittingRoomControls'
import { preloadRiggedModels } from '@/components/three/RiggedAvatar'
import {
  RIGGED_MODELS,
  animationMeta,
  isMobileViewport,
  lookSummary,
  renderQuality,
  type FittingLook,
  type RigAnimationId,
  type RigId,
  type RigProportions,
  type ViewId,
} from '@/lib/fittingRoom'
import { cn } from '@/lib/format'

interface FittingRoomViewportProps {
  rig: RigId
  look: FittingLook
  proportions: RigProportions
  skinTone?: string
  hairColor?: string
  hairStyle?: string
  className?: string
  captureEnabled?: boolean
  onCaptureReady?: (capture: (() => string | null) | null) => void
}

function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth))
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth)
    handle()
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])
  return width
}

function usePageVisibilityFrameloop(): 'always' | 'never' {
  const [frameloop, setFrameloop] = useState<'always' | 'never'>('always')
  useEffect(() => {
    if (typeof document === 'undefined') return
    const handle = () => setFrameloop(document.hidden ? 'never' : 'always')
    handle()
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [])
  return frameloop
}

async function enterFullscreen(element: HTMLElement): Promise<boolean> {
  const request =
    element.requestFullscreen ??
    (element as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      .webkitRequestFullscreen
  if (!request) return false
  try {
    await request.call(element)
    return true
  } catch {
    return false
  }
}

async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined)
    return
  }
  const legacy = document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
  if (legacy.webkitExitFullscreen) await Promise.resolve(legacy.webkitExitFullscreen()).catch(() => undefined)
}

class SceneBoundary extends Component<{ children: ReactNode; onRetry: () => void; onError: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#ece4d7] p-6">
        <div className="max-w-sm border border-line bg-paper p-5 text-center">
          <p className="eyebrow">3D model unavailable</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            The rigged avatar could not be loaded or rendered. Check your connection and try again —
            your saved designs and outfits are unaffected.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ failed: false })
              this.props.onRetry()
            }}
            className="mt-4 border border-ink bg-ink px-4 py-2 text-[0.625rem] uppercase tracking-[0.14em] text-paper"
          >
            Retry 3D
          </button>
        </div>
      </div>
    )
  }
}

/**
 * Fully interactive WebGL fitting room. There is no screenshot fallback: when
 * WebGL is missing we say so explicitly, and when a model fails we offer a
 * real retry of the asset load.
 */
export function FittingRoomViewport({
  rig,
  look,
  proportions,
  skinTone,
  hairColor,
  hairStyle,
  className,
  captureEnabled = false,
  onCaptureReady,
}: FittingRoomViewportProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const width = useViewportWidth()
  const compact = width < 640
  const quality = useMemo(() => renderQuality(isMobileViewport(width)), [width])
  const frameloop = usePageVisibilityFrameloop()
  const webgl = useMemo(supportsWebGL, [])
  const progress = useProgress()

  const [animation, setAnimation] = useState<RigAnimationId>('idle')
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [view, setView] = useState<ViewId>('front')
  const [resetToken, setResetToken] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [readyRig, setReadyRig] = useState<RigId | null>(null)
  const [failed, setFailed] = useState(false)
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ id: 0, action: 'reset' })
  const [expanded, setExpanded] = useState(false)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const commandId = useRef(0)
  const fullscreen = nativeFullscreen || expanded

  const issueCommand = useCallback((action: CameraAction) => {
    commandId.current += 1
    setCameraCommand({ id: commandId.current, action })
  }, [])

  const handleAnimation = useCallback((next: RigAnimationId) => {
    setAnimation(next)
    setPaused(false)
  }, [])
  const handleView = useCallback((next: ViewId) => {
    setView(next)
    setAutoRotate(false)
  }, [])
  const handleInteracted = useCallback(() => {
    setView('free')
    setAutoRotate(false)
  }, [])
  const handleTurnFinished = useCallback(() => setAnimation('idle'), [])
  const handleReady = useCallback(() => setReadyRig(rig), [rig])
  const handleReset = useCallback(() => {
    setAutoRotate(false)
    setView('front')
    setResetToken((value) => value + 1)
    issueCommand('reset')
  }, [issueCommand])
  const handleZoom = useCallback(
    (direction: 'in' | 'out') => {
      issueCommand(direction === 'in' ? 'zoom-in' : 'zoom-out')
    },
    [issueCommand],
  )

  const handleFullscreen = useCallback(async () => {
    const element = shellRef.current
    if (!element) return
    if (fullscreen) {
      if (document.fullscreenElement) await exitFullscreen()
      setExpanded(false)
      setNativeFullscreen(false)
      return
    }
    const entered = await enterFullscreen(element)
    setNativeFullscreen(entered)
    setExpanded(!entered)
  }, [fullscreen])

  useEffect(() => {
    const handle = () => {
      setNativeFullscreen(Boolean(document.fullscreenElement))
      // Give the browser a beat to resize the fullscreen element, then let
      // react-three-fiber measure it.
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60)
    }
    document.addEventListener('fullscreenchange', handle)
    document.addEventListener('webkitfullscreenchange', handle)
    return () => {
      document.removeEventListener('fullscreenchange', handle)
      document.removeEventListener('webkitfullscreenchange', handle)
    }
  }, [])

  useEffect(() => {
    if (!expanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', handleKey)
    }
  }, [expanded])

  useEffect(() => {
    const timer = window.setTimeout(preloadRiggedModels, 1800)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    setReadyRig(null)
    setFailed(false)
  }, [rig, attempt])

  const retry = useCallback(() => {
    useGLTF.clear(RIGGED_MODELS.female.file)
    useGLTF.clear(RIGGED_MODELS.male.file)
    setAttempt((value) => value + 1)
  }, [])

  const loading = webgl && !failed && readyRig !== rig
  const meta = animationMeta(animation)

  return (
    <div
      ref={shellRef}
      role="region"
      aria-label="Interactive 3D fitting room"
      className={cn(
        'relative flex flex-col overflow-hidden border border-line bg-[#ece4d7]',
        fullscreen && 'fixed inset-0 z-50 h-[100dvh] w-screen border-0',
        className,
      )}
    >
      <div className="relative min-h-0 flex-1">
        {webgl ? (
          <SceneBoundary key={attempt} onRetry={retry} onError={() => setFailed(true)}>
            <FittingRoomScene
              rig={rig}
              look={look}
              proportions={proportions}
              animation={animation}
              speed={speed}
              paused={paused}
              autoRotate={autoRotate}
              skinTone={skinTone}
              hairColor={hairColor}
              hairStyle={hairStyle}
              view={view}
              resetToken={resetToken}
              cameraCommand={cameraCommand}
              onInteracted={handleInteracted}
              onTurnFinished={handleTurnFinished}
              onReady={handleReady}
              quality={quality}
              frameloop={frameloop}
              captureEnabled={captureEnabled}
              onCaptureReady={onCaptureReady}
            />
          </SceneBoundary>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm border border-line bg-paper p-5 text-center">
              <p className="eyebrow">WebGL required</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                This browser or device does not expose WebGL, so the interactive fitting room cannot
                run. Enable hardware acceleration or try a current mobile browser. Design editing and
                print preparation remain available without WebGL.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 border border-ink bg-ink px-4 py-2 text-[0.625rem] uppercase tracking-[0.14em] text-paper"
              >
                Reload
              </button>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2.5 sm:p-3">
          <div className="max-w-[70%] border border-line/80 bg-paper/90 px-2.5 py-1.5">
            <p className="text-[0.5rem] uppercase tracking-[0.16em] text-ink-muted">
              Interactive 3D · fitted sample wardrobe
            </p>
            <p className="mt-0.5 truncate text-[0.625rem] text-ink">{lookSummary(look)}</p>
          </div>
          <span className="border border-line/80 bg-paper/90 px-2 py-1 text-[0.5rem] uppercase tracking-[0.14em] text-ink-muted">
            {RIGGED_MODELS[rig].label}
          </span>
        </div>

        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#ece4d7]/70">
            <div className="border border-line bg-paper px-5 py-4 text-center">
              <div className="mx-auto size-5 animate-spin rounded-full border border-line border-t-ink" />
              <p className="mt-3 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
                Loading rigged avatar
              </p>
              <p className="mt-1 text-xs tabular-nums text-ink">
                {Math.min(100, Math.round(progress.progress))}%
              </p>
            </div>
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {meta.label} animation {paused ? 'paused' : 'playing'}. {lookSummary(look)}.
        </p>
      </div>

      <FittingRoomControls
        animation={animation}
        speed={speed}
        paused={paused}
        autoRotate={autoRotate}
        view={view}
        fullscreen={fullscreen}
        compact={compact}
        onAnimation={handleAnimation}
        onSpeed={setSpeed}
        onTogglePause={() => setPaused((value) => !value)}
        onToggleAutoRotate={() =>
          setAutoRotate((value) => {
            const next = !value
            if (next) setView('free')
            return next
          })
        }
        onView={handleView}
        onZoom={handleZoom}
        onReset={handleReset}
        onToggleFullscreen={() => {
          void handleFullscreen()
        }}
      />
    </div>
  )
}
