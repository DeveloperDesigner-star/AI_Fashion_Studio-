import { useState } from 'react'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { Skeleton } from '@/components/ui/Primitives'

interface CompareSliderProps {
  original: string
  customised: string
  originalLabel: string
  customisedLabel: string
}

/**
 * Authenticated before/after comparison. Both images are private media and are
 * fetched as object URLs; the result is explicitly labelled approximate.
 */
export function CompareSlider({
  original,
  customised,
  originalLabel,
  customisedLabel,
}: CompareSliderProps) {
  const [position, setPosition] = useState(52)
  const before = useMediaUrl(original)
  const after = useMediaUrl(customised)

  if (before.loading || after.loading) return <Skeleton className="aspect-[4/5] w-full" />
  if (before.error || after.error || !before.url || !after.url) {
    return (
      <p className="border border-danger/30 bg-danger/5 p-4 text-xs text-danger" role="alert">
        One of the private preview images could not be loaded.
      </p>
    )
  }

  return (
    <figure className="space-y-2">
      <div className="relative aspect-[4/5] overflow-hidden border border-line bg-bone">
        <img
          src={before.url}
          alt={`${originalLabel} — source image`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <img
          src={after.url}
          alt={`${customisedLabel} — approximate preview`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-paper/90 shadow-[0_0_0_1px_rgba(21,19,15,0.25)]"
          style={{ left: `${position}%` }}
        />
        <span className="absolute left-2 top-2 bg-ink/85 px-2 py-1 text-[0.5rem] uppercase tracking-[0.14em] text-paper">
          {originalLabel}
        </span>
        <span className="absolute right-2 top-2 bg-clay/90 px-2 py-1 text-[0.5rem] uppercase tracking-[0.14em] text-paper">
          {customisedLabel}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={`Compare ${originalLabel} with ${customisedLabel}`}
        className="w-full accent-[#8d4f43]"
      />
      <figcaption className="text-[0.625rem] leading-relaxed text-ink-muted">
        Drag to compare. The right-hand image is an approximate AI preview, not a fit or fabric
        guarantee.
      </figcaption>
    </figure>
  )
}
