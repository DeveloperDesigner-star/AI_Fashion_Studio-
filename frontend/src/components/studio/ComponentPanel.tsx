import { ColorField } from '@/components/ui/ColorField'
import { Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Primitives'
import { titleCase } from '@/lib/format'
import type {
  ComponentCustomisation,
  Garment,
  PatternOption,
} from '@/lib/types'

interface ComponentPanelProps {
  garment: Garment
  components: Record<string, ComponentCustomisation>
  activeComponentId: string
  library: { patterns: PatternOption[]; embroideries: string[]; families: string[] } | undefined
  onSelect: (componentId: string) => void
  onUpdate: (componentId: string, patch: Partial<ComponentCustomisation>) => void
  onReset: (componentId: string) => void
  readOnly?: boolean
}

const EMBROIDERY_LABELS: Record<string, string> = {
  none: 'No embroidery',
  thread: 'Thread work',
  sequin: 'Sequins',
  beadwork: 'Beadwork',
  applique: 'Applique',
  gold_work: 'Gold zari',
}

const FAMILY_LABELS: Record<string, string> = {
  plain: 'Plain',
  printed: 'Printed',
  embroidered: 'Embroidered',
  floral: 'Floral',
  geometric: 'Geometric',
  traditional: 'Traditional',
  custom: 'Custom artwork',
}

export function ComponentPanel({
  garment,
  components,
  activeComponentId,
  library,
  onSelect,
  onUpdate,
  onReset,
  readOnly = false,
}: ComponentPanelProps) {
  const active = components[activeComponentId]
  const definition = garment.components.find((component) => component.id === activeComponentId)
  const patterns = library?.patterns ?? []

  const patternOptions = patterns.length
    ? patterns.map((pattern) => ({
        value: pattern.id,
        label: `${FAMILY_LABELS[pattern.family] ?? titleCase(pattern.family)} · ${pattern.label}`,
      }))
    : [{ value: active?.pattern ?? 'solid', label: titleCase(active?.pattern ?? 'solid') }]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="label-xs">Components</h2>
          <Badge tone="neutral">{garment.components.length} pieces</Badge>
        </div>
        <p className="mt-1 text-[0.6875rem] leading-snug text-ink-muted">
          Every piece is adjustable on its own. Select a piece to work on it.
        </p>
      </div>

      <ul className="max-h-[36vh] overflow-y-auto border-b border-line lg:max-h-[38%]">
        {garment.components.map((component) => {
          const custom = components[component.id]
          const layers = custom?.layers?.length ?? 0
          const isActive = component.id === activeComponentId
          return (
            <li key={component.id}>
              <button
                type="button"
                onClick={() => onSelect(component.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`flex w-full items-center gap-3 border-b border-line/60 px-4 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-bone' : 'hover:bg-bone/60'
                }`}
              >
                <span
                  className="size-6 shrink-0 border border-line"
                  style={{ backgroundColor: custom?.color ?? '#ddd' }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] text-ink">
                    {component.label}
                  </span>
                  <span className="block truncate text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                    {titleCase((component.kind ?? 'piece').replace(/_/g, ' '))}
                    {layers > 0 ? ` · ${layers} layer${layers === 1 ? '' : 's'}` : ''}
                  </span>
                </span>
                {isActive && <span className="text-clay">→</span>}
              </button>
            </li>
          )
        })}
      </ul>

      {active && definition ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-lg leading-tight">{definition.label}</h3>
            {!readOnly && (
              <button
                type="button"
                className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted underline-offset-2 hover:text-danger hover:underline"
                onClick={() => onReset(definition.id)}
              >
                Reset
              </button>
            )}
          </div>
          {definition.description && (
            <p className="text-[0.6875rem] leading-relaxed text-ink-muted">{definition.description}</p>
          )}

          <ColorField
            label="Colour"
            value={active.color}
            disabled={readOnly}
            onChange={(color) => onUpdate(definition.id, { color })}
          />

          <Select
            label="Fabric"
            value={active.fabric}
            disabled={readOnly}
            onChange={(event) => onUpdate(definition.id, { fabric: event.target.value })}
            options={definition.fabrics.map((fabric) => ({
              value: fabric,
              label: titleCase(fabric),
            }))}
          />

          <Select
            label="Pattern / texture"
            value={active.pattern}
            disabled={readOnly}
            onChange={(event) => onUpdate(definition.id, { pattern: event.target.value })}
            options={patternOptions}
            hint={
              patterns.find((pattern) => pattern.id === active.pattern)?.description ??
              'Plain dyed fabric.'
            }
          />

          {active.pattern === 'custom_print' && (
            <p className="border border-line bg-bone px-3 py-2 text-[0.6875rem] text-ink-muted">
              {active.print_asset_id
                ? 'Using your uploaded artwork as the pattern tile.'
                : 'Upload artwork in the Layers panel, then pick it as the pattern.'}
            </p>
          )}

          <Select
            label="Embroidery"
            value={active.embroidery}
            disabled={readOnly}
            onChange={(event) => onUpdate(definition.id, { embroidery: event.target.value })}
            options={(library?.embroideries ?? ['none']).map((value) => ({
              value,
              label: EMBROIDERY_LABELS[value] ?? titleCase(value),
            }))}
          />

          <label className="block space-y-1.5">
            <span className="flex items-baseline justify-between">
              <span className="label-xs">Pattern scale</span>
              <span className="font-mono text-[0.625rem] text-ink-muted">
                {(active.pattern_scale ?? 1).toFixed(2)}×
              </span>
            </span>
            <input
              type="range"
              min={0.4}
              max={3}
              step={0.05}
              value={active.pattern_scale ?? 1}
              disabled={readOnly}
              onChange={(event) =>
                onUpdate(definition.id, { pattern_scale: Number(event.target.value) })
              }
              className="w-full accent-ink"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="flex items-baseline justify-between">
              <span className="label-xs">Pattern rotation</span>
              <span className="font-mono text-[0.625rem] text-ink-muted">
                {Math.round(active.pattern_rotation ?? 0)}°
              </span>
            </span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={active.pattern_rotation ?? 0}
              disabled={readOnly}
              onChange={(event) =>
                onUpdate(definition.id, { pattern_rotation: Number(event.target.value) })
              }
              className="w-full accent-ink"
            />
          </label>

          <div className="border border-line bg-bone/60 px-3 py-2 text-[0.6875rem] text-ink-muted">
            {active.pattern === 'custom_print' || active.layers?.length
              ? 'Artwork layers are clipped to this piece and never merged with the fabric.'
              : 'Add artwork from the Layers panel to place a print, motif or reference image.'}
          </div>
        </div>
      ) : (
        <div className="p-4 text-sm text-ink-muted">Select a component to edit it.</div>
      )}
    </div>
  )
}
