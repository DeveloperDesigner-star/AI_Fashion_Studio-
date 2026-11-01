import { useId } from 'react'
import { cn } from '@/lib/format'

const SWATCHES = [
  '#15130f',
  '#f4f1ea',
  '#8a5a3b',
  '#c9b7a0',
  '#6d2230',
  '#55614c',
  '#25303a',
  '#3f5260',
  '#b08d54',
  '#a8846a',
  '#5a1420',
  '#dfe3e6',
]

interface ColorFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  swatches?: string[]
  disabled?: boolean
  className?: string
}

export function ColorField({ label, value, onChange, swatches = SWATCHES, disabled, className }: ColorFieldProps) {
  const id = useId()
  // Catalogue palettes can repeat a colour across primary/secondary/accent; the
  // swatch list is de-duplicated so React keys stay unique.
  const uniqueSwatches = Array.from(new Set(swatches.map((swatch) => swatch.toLowerCase())))
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="label-xs">
          {label}
        </label>
        <span className="font-mono text-[0.625rem] uppercase text-ink-muted">{value}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {uniqueSwatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            title={swatch}
            aria-label={`Set ${label} to ${swatch}`}
            aria-pressed={value.toLowerCase() === swatch.toLowerCase()}
            disabled={disabled}
            onClick={() => onChange(swatch)}
            className={cn(
              'size-7 border transition-transform hover:scale-105 disabled:opacity-40',
              value.toLowerCase() === swatch.toLowerCase() ? 'border-ink ring-1 ring-ink ring-offset-1' : 'border-line',
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <label
          className="relative size-7 cursor-pointer border border-dashed border-line bg-bone"
          title="Custom colour"
        >
          <span className="absolute inset-0 flex items-center justify-center text-[0.625rem] text-ink-muted">+</span>
          <input
            id={id}
            type="color"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label={`Custom ${label} colour`}
          />
        </label>
      </div>
    </div>
  )
}
