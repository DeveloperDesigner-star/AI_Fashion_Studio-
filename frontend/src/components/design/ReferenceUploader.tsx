import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Primitives'
import { cn } from '@/lib/format'
import { replication } from '@/lib/designReplication'
import type { MediaAsset } from '@/lib/types'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 12 * 1024 * 1024

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  asset: MediaAsset | null
  onChange: (asset: MediaAsset) => void
  onRemove: () => void
  disabled?: boolean
  label?: string
  hint?: string
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Reference upload with preview, crop, rotate, replace and remove.
 *
 * Every mutation is a *server* operation that produces a new derived asset, so
 * the original upload is never overwritten — a user who rotates three times can
 * always get back to what they started with. Crop and rotate are refused with
 * an explanation when the server rejects them, never silently ignored.
 */
export function ReferenceUploader({
  asset,
  onChange,
  onRemove,
  disabled = false,
  label = 'Reference image',
  hint = 'Clothing photo, inspiration image, pattern, embroidery detail or sketch.',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const [busy, setBusy] = useState<null | 'upload' | 'crop' | 'rotate'>(null)
  const [error, setError] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)

  const reset = useCallback(() => {
    setRect(null)
    setCropping(false)
    dragStart.current = null
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      if (!ACCEPT.split(',').includes(file.type)) {
        setError('Choose a JPEG, PNG or WebP image.')
        return
      }
      if (file.size > MAX_BYTES) {
        setError('That image is larger than 12 MB. Use a smaller file.')
        return
      }
      setBusy('upload')
      try {
        const uploaded = await replication.upload(file)
        reset()
        onChange(uploaded)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The upload failed.')
      } finally {
        setBusy(null)
      }
    },
    [onChange, reset],
  )

  const pointAt = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current
    if (!surface) return { x: 0, y: 0 }
    const bounds = surface.getBoundingClientRect()
    return {
      x: clamp01((event.clientX - bounds.left) / bounds.width),
      y: clamp01((event.clientY - bounds.top) / bounds.height),
    }
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropping) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointAt(event)
    dragStart.current = point
    setRect({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropping || !dragStart.current) return
    const start = dragStart.current
    const point = pointAt(event)
    setRect({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    })
  }

  const onPointerUp = () => {
    dragStart.current = null
    if (rect && (rect.width < 0.05 || rect.height < 0.05)) setRect(null)
  }

  const applyCrop = async () => {
    if (!asset || !rect) return
    setBusy('crop')
    setError(null)
    try {
      const derived = await replication.crop(asset.id, {
        x: Number(rect.x.toFixed(4)),
        y: Number(rect.y.toFixed(4)),
        width: Number(rect.width.toFixed(4)),
        height: Number(rect.height.toFixed(4)),
      })
      onChange(derived.asset)
      reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The crop failed.')
    } finally {
      setBusy(null)
    }
  }

  const rotate = async (degrees: 90 | 180 | 270) => {
    if (!asset) return
    setBusy('rotate')
    setError(null)
    try {
      const derived = await replication.rotate(asset.id, degrees)
      onChange(derived.asset)
      reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The rotation failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label={label} className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold">{label}</h3>
        {asset && (
          <p className="text-[0.6875rem] text-ink-muted">
            {asset.width} × {asset.height} px · {(asset.byte_size / 1024).toFixed(0)} KB
          </p>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p>

      {!asset ? (
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const file = event.dataTransfer.files?.[0]
            if (file) void handleFile(file)
          }}
          className="mt-3 rounded-sm border border-dashed border-line-strong p-6 text-center"
        >
          <p className="text-sm text-ink-soft">Drop an image here, or choose a file.</p>
          <p className="mt-1 text-[0.6875rem] text-ink-muted">JPEG, PNG or WebP · up to 12 MB</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            loading={busy === 'upload'}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Choose image
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <div
            ref={surfaceRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={cn(
              'relative overflow-hidden rounded-sm border border-line bg-bone',
              cropping && 'touch-none cursor-crosshair',
            )}
          >
            <img
              src={asset.url ?? ''}
              alt="Your reference"
              className="block w-full select-none"
              draggable={false}
            />
            {cropping && rect && (
              <>
                <div className="pointer-events-none absolute inset-0 bg-ink/35" />
                <div
                  className="pointer-events-none absolute border-2 border-paper"
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                  }}
                />
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {!cropping ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || busy !== null}
                  onClick={() => setCropping(true)}
                >
                  Crop
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy === 'rotate'}
                  disabled={disabled || busy !== null}
                  onClick={() => void rotate(90)}
                >
                  Rotate
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || busy !== null}
                  onClick={() => inputRef.current?.click()}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled || busy !== null}
                  onClick={() => {
                    reset()
                    onRemove()
                  }}
                >
                  Remove
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="primary"
                  loading={busy === 'crop'}
                  disabled={!rect || busy !== null}
                  onClick={() => void applyCrop()}
                >
                  Apply crop
                </Button>
                <Button type="button" variant="ghost" disabled={busy !== null} onClick={reset}>
                  Cancel
                </Button>
                <p className="w-full text-[0.6875rem] text-ink-muted">
                  Drag across the image to choose the area to keep.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
          event.target.value = ''
        }}
      />

      {error && (
        <div className="mt-3">
          <Notice tone="warn" title="That did not work">
            {error}
          </Notice>
        </div>
      )}

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-muted">
        Crops and rotations create a new copy on the server. Your original upload is never
        modified.
      </p>
    </section>
  )
}
