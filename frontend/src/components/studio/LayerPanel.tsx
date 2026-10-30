import { useRef } from 'react'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { titleCase } from '@/lib/format'
import { orderedLayers } from '@/lib/designStudio'
import type {
  BlendMode,
  ComponentCustomisation,
  DesignLayer,
  MediaAsset,
  PatternOption,
} from '@/lib/types'

interface LayerPanelProps {
  component: ComponentCustomisation | undefined
  componentLabel: string
  layers: DesignLayer[]
  selectedLayerId: string | null
  media: MediaAsset[]
  library: { patterns: PatternOption[]; blend_modes: BlendMode[] } | undefined
  maxLayers: number
  uploading: boolean
  busy: boolean
  onSelectLayer: (layerId: string) => void
  onUpload: (file: File, kind: 'print' | 'reference') => void
  onAddAsset: (asset: MediaAsset) => void
  onUseAsPattern: (asset: MediaAsset) => void
  onUpdateLayer: (patch: Partial<DesignLayer>) => void
  onUpdateLayerById: (layerId: string, patch: Partial<DesignLayer>) => void
  onUpdateTransform: (patch: Partial<DesignLayer['transform']>) => void
  onUpdateCrop: (patch: Partial<DesignLayer['crop']>) => void
  onUpdateAdjustments: (patch: Partial<DesignLayer['adjustments']>) => void
  onAction: (action: 'up' | 'down' | 'duplicate' | 'remove' | 'reset-transform') => void
  onRemoveBackground: () => void
  readOnly?: boolean
}

function MediaThumb({
  asset,
  onPick,
  onUseAsPattern,
}: {
  asset: MediaAsset
  onPick: () => void
  onUseAsPattern: () => void
}) {
  const { url, loading } = useMediaUrl(asset.thumbnail_url ?? asset.url)
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onPick}
        className="block aspect-square w-full overflow-hidden border border-line bg-bone hover:border-ink"
        title={`${asset.original_filename} — add as layer`}
      >
        {url ? (
          <img src={url} alt={asset.original_filename} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-[0.5rem] text-ink-muted">
            {loading ? 'Loading' : 'No preview'}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onUseAsPattern}
        className="absolute inset-x-0 bottom-0 bg-ink/80 py-0.5 text-[0.5rem] uppercase tracking-[0.08em] text-paper opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        Use as pattern
      </button>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between">
        <span className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">{label}</span>
        <span className="font-mono text-[0.5625rem] text-ink-muted">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-ink"
      />
    </label>
  )
}

export function LayerPanel({
  component,
  componentLabel,
  layers,
  selectedLayerId,
  media,
  library,
  maxLayers,
  uploading,
  busy,
  onSelectLayer,
  onUpload,
  onAddAsset,
  onUseAsPattern,
  onUpdateLayer,
  onUpdateLayerById,
  onUpdateTransform,
  onUpdateCrop,
  onUpdateAdjustments,
  onAction,
  onRemoveBackground,
  readOnly = false,
}: LayerPanelProps) {
  const artworkInput = useRef<HTMLInputElement>(null)
  const referenceInput = useRef<HTMLInputElement>(null)
  const sorted = [...orderedLayers(component)].reverse()
  const selected = layers.find((layer) => layer.id === selectedLayerId)
  const asset = selected ? media.find((item) => item.id === selected.asset_id) : undefined
  const atLimit = layers.length >= maxLayers
  const canRemoveBackground = Boolean(
    asset && ['photo', 'reference', 'clothing', 'print'].includes(asset.kind),
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="label-xs">Artwork layers</h2>
          <span className="font-mono text-[0.5625rem] text-ink-muted">
            {layers.length}/{maxLayers}
          </span>
        </div>
        <p className="mt-1 truncate text-[0.6875rem] text-ink-muted">{componentLabel}</p>
        {!readOnly && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => artworkInput.current?.click()}
              disabled={uploading || atLimit}
              className="border border-ink px-2 py-2 text-[0.5625rem] uppercase tracking-[0.1em] hover:bg-ink hover:text-paper disabled:opacity-40"
            >
              {uploading ? 'Uploading…' : 'Upload artwork'}
            </button>
            <button
              type="button"
              onClick={() => referenceInput.current?.click()}
              disabled={uploading || atLimit}
              className="border border-line px-2 py-2 text-[0.5625rem] uppercase tracking-[0.1em] hover:border-ink disabled:opacity-40"
            >
              Reference photo
            </button>
          </div>
        )}
        <input
          ref={artworkInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUpload(file, 'print')
            event.target.value = ''
          }}
        />
        <input
          ref={referenceInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUpload(file, 'reference')
            event.target.value = ''
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-line px-4 py-3">
          <div className="flex items-baseline justify-between">
            <h3 className="label-xs">Your files</h3>
            <span className="text-[0.5rem] uppercase tracking-[0.1em] text-ink-muted">
              Tap to add
            </span>
          </div>
          {media.length === 0 ? (
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-muted">
              Upload a print, motif or reference photo. Files stay private to your account.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {media.slice(0, 15).map((item) => (
                <MediaThumb
                  key={item.id}
                  asset={item}
                  onPick={() => onAddAsset(item)}
                  onUseAsPattern={() => onUseAsPattern(item)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="border-b border-line">
          <div className="flex items-center justify-between px-4 py-2">
            <h3 className="label-xs">Stack</h3>
            <span className="text-[0.5rem] uppercase tracking-[0.1em] text-ink-muted">
              Top paints last
            </span>
          </div>
          {sorted.length === 0 ? (
            <p className="px-4 pb-3 text-[0.6875rem] text-ink-muted">
              No artwork yet. The piece uses its fabric and pattern only.
            </p>
          ) : (
            <ul>
              {sorted.map((layer) => (
                <li
                  key={layer.id}
                  className={`flex items-center gap-2 border-t border-line/70 px-3 py-1.5 ${
                    layer.id === selectedLayerId ? 'bg-bone' : ''
                  }`}
                >
                  <button
                    type="button"
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                    onClick={() => onUpdateLayerById(layer.id, { visible: !layer.visible })}
                    className="text-[0.625rem] text-ink-muted hover:text-ink"
                  >
                    {layer.visible ? '◉' : '○'}
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-[0.75rem]"
                    onClick={() => onSelectLayer(layer.id)}
                    aria-current={layer.id === selectedLayerId ? 'true' : undefined}
                  >
                    {layer.name}
                  </button>
                  {layer.locked && <span className="text-[0.5rem] text-ink-muted">LOCK</span>}
                  <span className="font-mono text-[0.5rem] text-ink-muted">{layer.z_index}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected && (
          <section className="space-y-3 border-b border-line px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="label-xs">Selected layer</h3>
              <span className="truncate pl-2 text-[0.5625rem] text-ink-muted">{selected.name}</span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => onAction('up')}
                className="border border-line py-1 text-[0.5625rem] uppercase tracking-[0.08em] hover:border-ink"
              >
                Forward
              </button>
              <button
                type="button"
                onClick={() => onAction('down')}
                className="border border-line py-1 text-[0.5625rem] uppercase tracking-[0.08em] hover:border-ink"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => onAction('duplicate')}
                disabled={atLimit}
                className="border border-line py-1 text-[0.5625rem] uppercase tracking-[0.08em] hover:border-ink disabled:opacity-40"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => onUpdateLayer({ visible: !selected.visible })}
                className="border border-line py-1 text-[0.5625rem] uppercase tracking-[0.08em] hover:border-ink"
              >
                {selected.visible ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                onClick={() => onUpdateLayer({ locked: !selected.locked })}
                className="border border-line py-1 text-[0.5625rem] uppercase tracking-[0.08em] hover:border-ink"
              >
                {selected.locked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                onClick={() => onAction('remove')}
                className="border border-line py-1 text-[0.5625rem] uppercase tracking-[0.08em] text-danger hover:border-danger"
              >
                Delete
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Slider
                label="X"
                value={selected.transform.x}
                min={0}
                max={1}
                step={0.005}
                display={selected.transform.x.toFixed(2)}
                onChange={(x) => onUpdateTransform({ x })}
                disabled={selected.locked}
              />
              <Slider
                label="Y"
                value={selected.transform.y}
                min={0}
                max={1}
                step={0.005}
                display={selected.transform.y.toFixed(2)}
                onChange={(y) => onUpdateTransform({ y })}
                disabled={selected.locked}
              />
              <Slider
                label="Width"
                value={selected.transform.width}
                min={0.05}
                max={2}
                step={0.01}
                display={selected.transform.width.toFixed(2)}
                onChange={(width) => onUpdateTransform({ width })}
                disabled={selected.locked}
              />
              <Slider
                label="Height"
                value={selected.transform.height}
                min={0.05}
                max={2}
                step={0.01}
                display={selected.transform.height.toFixed(2)}
                onChange={(height) => onUpdateTransform({ height })}
                disabled={selected.locked}
              />
              <Slider
                label="Rotate"
                value={selected.transform.rotation}
                min={-180}
                max={180}
                step={1}
                display={`${Math.round(selected.transform.rotation)}°`}
                onChange={(rotation) => onUpdateTransform({ rotation })}
                disabled={selected.locked}
              />
              <Slider
                label="Opacity"
                value={selected.transform.opacity}
                min={0}
                max={1}
                step={0.01}
                display={selected.transform.opacity.toFixed(2)}
                onChange={(opacity) => onUpdateTransform({ opacity })}
                disabled={selected.locked}
              />
            </div>

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onUpdateTransform({ rotation: selected.transform.rotation - 15 })}
                className="border border-line px-2 py-1 text-[0.5625rem] hover:border-ink"
              >
                ↺ 15°
              </button>
              <button
                type="button"
                onClick={() => onUpdateTransform({ rotation: selected.transform.rotation + 15 })}
                className="border border-line px-2 py-1 text-[0.5625rem] hover:border-ink"
              >
                ↻ 15°
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateTransform({
                    width: selected.transform.width * 1.1,
                    height: selected.transform.height * 1.1,
                  })
                }
                className="border border-line px-2 py-1 text-[0.5625rem] hover:border-ink"
              >
                Scale +
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateTransform({
                    width: selected.transform.width / 1.1,
                    height: selected.transform.height / 1.1,
                  })
                }
                className="border border-line px-2 py-1 text-[0.5625rem] hover:border-ink"
              >
                Scale −
              </button>
              <button
                type="button"
                onClick={() => onUpdateTransform({ flip_x: !selected.transform.flip_x })}
                className="border border-line px-2 py-1 text-[0.5625rem] hover:border-ink"
              >
                Flip
              </button>
              <button
                type="button"
                onClick={() => onAction('reset-transform')}
                className="border border-line px-2 py-1 text-[0.5625rem] hover:border-ink"
              >
                Fit
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                Blend
              </span>
              <select
                value={selected.blend_mode}
                disabled={selected.locked}
                onChange={(event) =>
                  onUpdateLayer({ blend_mode: event.target.value as BlendMode })
                }
                className="w-full border border-line bg-paper px-2 py-1.5 text-xs"
              >
                {(library?.blend_modes ?? ['normal']).map((mode) => (
                  <option key={mode} value={mode}>
                    {titleCase(mode.replace('-', ' '))}
                  </option>
                ))}
              </select>
            </label>

            <details className="border border-line bg-bone/50 px-2 py-1.5">
              <summary className="cursor-pointer text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                Crop (non-destructive)
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Slider
                  label="Crop X"
                  value={selected.crop.x}
                  min={0}
                  max={0.9}
                  step={0.01}
                  display={selected.crop.x.toFixed(2)}
                  onChange={(x) => onUpdateCrop({ x })}
                />
                <Slider
                  label="Crop Y"
                  value={selected.crop.y}
                  min={0}
                  max={0.9}
                  step={0.01}
                  display={selected.crop.y.toFixed(2)}
                  onChange={(y) => onUpdateCrop({ y })}
                />
                <Slider
                  label="Crop width"
                  value={selected.crop.width}
                  min={0.1}
                  max={1}
                  step={0.01}
                  display={selected.crop.width.toFixed(2)}
                  onChange={(width) => onUpdateCrop({ width })}
                />
                <Slider
                  label="Crop height"
                  value={selected.crop.height}
                  min={0.1}
                  max={1}
                  step={0.01}
                  display={selected.crop.height.toFixed(2)}
                  onChange={(height) => onUpdateCrop({ height })}
                />
              </div>
            </details>

            <details className="border border-line bg-bone/50 px-2 py-1.5">
              <summary className="cursor-pointer text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                Colour adjustment
              </summary>
              <div className="mt-2 space-y-2">
                <Slider
                  label="Brightness"
                  value={selected.adjustments.brightness}
                  min={0.2}
                  max={2}
                  step={0.01}
                  display={`${Math.round(selected.adjustments.brightness * 100)}%`}
                  onChange={(brightness) => onUpdateAdjustments({ brightness })}
                />
                <Slider
                  label="Contrast"
                  value={selected.adjustments.contrast}
                  min={0.2}
                  max={2}
                  step={0.01}
                  display={`${Math.round(selected.adjustments.contrast * 100)}%`}
                  onChange={(contrast) => onUpdateAdjustments({ contrast })}
                />
                <Slider
                  label="Saturation"
                  value={selected.adjustments.saturation}
                  min={0}
                  max={2}
                  step={0.01}
                  display={`${Math.round(selected.adjustments.saturation * 100)}%`}
                  onChange={(saturation) => onUpdateAdjustments({ saturation })}
                />
                <Slider
                  label="Hue"
                  value={selected.adjustments.hue}
                  min={-180}
                  max={180}
                  step={1}
                  display={`${Math.round(selected.adjustments.hue)}°`}
                  onChange={(hue) => onUpdateAdjustments({ hue })}
                />
              </div>
            </details>

            <button
              type="button"
              onClick={onRemoveBackground}
              disabled={!canRemoveBackground || busy}
              className="w-full border border-ink px-2 py-2 text-[0.5625rem] uppercase tracking-[0.1em] hover:bg-ink hover:text-paper disabled:opacity-40"
            >
              {busy ? 'Working…' : 'Remove background (local)'}
            </button>
            <p className="text-[0.5625rem] leading-snug text-ink-muted">
              Background removal runs on the studio server with OpenCV GrabCut — no paid API and no
              upload to a third party.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
