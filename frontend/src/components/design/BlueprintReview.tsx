import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge, Notice } from '@/components/ui/Primitives'
import { cn } from '@/lib/format'
import {
  BLUEPRINT_SLOTS,
  SLOT_LABELS,
  type Blueprint,
  type BlueprintPatch,
  type BlueprintSlot,
} from '@/lib/designReplication'

interface Props {
  blueprint: Blueprint
  saving?: boolean
  onSave: (patch: BlueprintPatch) => void
}

function confidenceLabel(confidence: number): { text: string; tone: 'olive' | 'gold' | 'neutral' } {
  if (confidence >= 0.75) return { text: 'Clear', tone: 'olive' }
  if (confidence >= 0.5) return { text: 'Fairly clear', tone: 'gold' }
  return { text: 'Uncertain', tone: 'neutral' }
}

/**
 * Displays the model's reading of the reference and lets the person correct it.
 *
 * Unknown slots are rendered as an explicit "Not visible in the reference" row
 * with an input to fill it in — never filled with a plausible default, and never
 * hidden, because a silently missing attribute is how a design drifts away from
 * what the user asked for.
 */
export function BlueprintReview({ blueprint, saving = false, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const slot of BLUEPRINT_SLOTS) {
      next[slot] = blueprint.observations?.[slot]?.value ?? ''
    }
    setValues(next)
  }, [blueprint])

  const changed = useMemo(() => {
    const patch: NonNullable<BlueprintPatch['observations']> = {}
    for (const slot of BLUEPRINT_SLOTS) {
      const original = blueprint.observations?.[slot]?.value ?? ''
      const current = (values[slot] ?? '').trim()
      if (current !== original) {
        patch[slot] = { value: current === '' ? null : current, confidence: current === '' ? 0 : 1 }
      }
    }
    return patch
  }, [blueprint, values])

  const changedCount = Object.keys(changed).length
  const unknownCount = BLUEPRINT_SLOTS.filter(
    (slot) => !(blueprint.observations?.[slot]?.value ?? ''),
  ).length

  return (
    <section aria-label="Reference analysis" className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold">What we could see</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-muted">
            These are observations from your image, not guesses. Anything the model could not see
            is marked as not visible — correct it if you know better.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="ink">{BLUEPRINT_SLOTS.length - unknownCount} identified</Badge>
          {unknownCount > 0 && <Badge tone="neutral">{unknownCount} not visible</Badge>}
        </div>
      </div>

      {blueprint.summary && (
        <p className="mt-3 rounded-sm bg-bone px-3 py-2 text-sm leading-relaxed text-ink-soft">
          {blueprint.summary}
        </p>
      )}

      {blueprint.colors.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            Colours detected
          </h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {blueprint.colors.map((colour) => (
              <li
                key={`${colour.hex}-${colour.role}`}
                className="flex items-center gap-2 rounded-full bg-paper pr-3 ring-1 ring-inset ring-line"
              >
                <span
                  className="size-7 rounded-l-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: colour.hex }}
                  aria-hidden="true"
                />
                <span className="text-xs text-ink-soft">
                  {colour.name ?? colour.hex}
                  <span className="ml-1 text-ink-muted">{colour.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-4 divide-y divide-line border-y border-line">
        {BLUEPRINT_SLOTS.map((slot) => {
          const observation = blueprint.observations?.[slot]
          const isUnknown = !observation?.value
          const confidence = observation?.confidence ?? 0
          const meta = confidenceLabel(confidence)
          return (
            <li key={slot} className="py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <label
                  htmlFor={`slot-${slot}`}
                  className="text-xs font-semibold text-ink-soft"
                >
                  {SLOT_LABELS[slot as BlueprintSlot]}
                </label>
                <div className="flex items-center gap-1.5">
                  {observation?.source === 'user' && <Badge tone="clay">Yours</Badge>}
                  {isUnknown ? (
                    <Badge tone="neutral">Not visible</Badge>
                  ) : (
                    <Badge tone={meta.tone}>{meta.text}</Badge>
                  )}
                </div>
              </div>
              <input
                id={`slot-${slot}`}
                type="text"
                value={values[slot] ?? ''}
                placeholder={isUnknown ? 'Not visible in the reference — add if you know' : ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [slot]: event.target.value }))
                }
                className={cn(
                  'mt-1.5 h-9 w-full rounded-sm border border-line bg-paper px-2.5 text-sm',
                  'placeholder:text-ink-muted focus:border-ink-soft focus:outline-none',
                )}
              />
              {observation?.note && (
                <p className="mt-1 text-[0.6875rem] text-ink-muted">{observation.note}</p>
              )}
            </li>
          )
        })}
      </ul>

      {blueprint.placements.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            Where the design sits
          </h4>
          <ul className="mt-2 space-y-1.5">
            {blueprint.placements.map((placement, index) => (
              <li key={`${placement.area}-${index}`} className="text-xs text-ink-soft">
                <span className="font-medium capitalize">{placement.area}</span> — {placement.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {changedCount > 0 && (
        <div className="mt-4">
          <Notice tone="info" title={`${changedCount} correction${changedCount === 1 ? '' : 's'} not saved yet`}>
            Corrected fields are marked as yours and are what the render will follow.
          </Notice>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          loading={saving}
          disabled={changedCount === 0 || saving}
          onClick={() => onSave({ observations: changed })}
        >
          Save corrections
        </Button>
      </div>
    </section>
  )
}
