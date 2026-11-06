import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { downloadFile } from '@/lib/download'
import { cn } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { ReferenceUploader } from '@/components/design/ReferenceUploader'
import { BlueprintReview } from '@/components/design/BlueprintReview'
import { Button, LinkButton } from '@/components/ui/Button'
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Primitives'
import {
  replication,
  type Blueprint,
  type BlueprintPatch,
  type GarmentTemplate,
  type RenderJob,
  TRY_ON_DISCLOSURE,
} from '@/lib/designReplication'
import type { Design, MediaAsset } from '@/lib/types'

const STEPS = [
  { id: 1, label: 'Reference' },
  { id: 2, label: 'Garment' },
  { id: 3, label: 'Analysis' },
  { id: 4, label: 'Customise' },
  { id: 5, label: 'Preview' },
  { id: 6, label: 'Save & try on' },
] as const

const LENGTHS = ['', 'cropped', 'hip length', 'knee length', 'mid calf', 'floor length'] as const

interface Customisation {
  neckline: string
  sleeves: string
  collar: string
  borders: string
  length: string
  scale: number
  primary: string
  secondary: string
  notes: string
}

const EMPTY_CUSTOM: Customisation = {
  neckline: '',
  sleeves: '',
  collar: '',
  borders: '',
  length: '',
  scale: 1,
  primary: '',
  secondary: '',
  notes: '',
}

function activeJob(jobs: RenderJob[] | undefined): RenderJob | undefined {
  return jobs?.find((job) => job.status === 'queued' || job.status === 'running')
}

function StepNav({
  step,
  maxReached,
  onSelect,
}: {
  step: number
  maxReached: number
  onSelect: (step: number) => void
}) {
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Progress">
      {STEPS.map((entry) => {
        const reachable = entry.id <= maxReached
        const current = entry.id === step
        return (
          <li key={entry.id} className="shrink-0">
            <button
              type="button"
              disabled={!reachable}
              aria-current={current ? 'step' : undefined}
              onClick={() => reachable && onSelect(entry.id)}
              className={cn(
                'flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium transition-colors',
                current && 'bg-ink text-paper',
                !current && reachable && 'bg-paper text-ink-soft ring-1 ring-inset ring-line',
                !reachable && 'cursor-not-allowed text-ink-muted/60',
              )}
            >
              <span className="tabular-nums opacity-60">{entry.id}</span>
              {entry.label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function ArtifactCard({
  eyebrow,
  title,
  body,
  imageUrl,
  tone = 'neutral',
  action,
}: {
  eyebrow: string
  title: string
  body: string
  imageUrl?: string | null
  tone?: 'neutral' | 'ink' | 'clay'
  action?: React.ReactNode
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-md border border-line bg-paper">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-muted">
          {eyebrow}
        </p>
        <Badge tone={tone}>{title}</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={eyebrow}
            className="w-full rounded-sm bg-bone object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center rounded-sm bg-bone px-4 text-center">
            <p className="text-xs leading-relaxed text-ink-muted">{body}</p>
          </div>
        )}
        {imageUrl && <p className="text-[0.6875rem] leading-relaxed text-ink-muted">{body}</p>}
        {action}
      </div>
    </article>
  )
}

export function DesignReplicationPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1)
  const [gender, setGender] = useState<'men' | 'women' | 'unisex'>('women')
  const [garment, setGarment] = useState<GarmentTemplate | null>(null)
  const [designId, setDesignId] = useState<string | null>(null)
  const [designName, setDesignName] = useState('')
  const [pendingAsset, setPendingAsset] = useState<MediaAsset | null>(null)
  const [custom, setCustom] = useState<Customisation>(EMPTY_CUSTOM)
  const [partTargets, setPartTargets] = useState<string[]>([])
  const [renderError, setRenderError] = useState<string | null>(null)
  const [view, setView] = useState<'front' | 'back'>('front')

  const capabilities = useQuery({
    queryKey: ['replication', 'capabilities'],
    queryFn: replication.capabilities,
    staleTime: 120_000,
  })

  const templates = useQuery({
    queryKey: ['replication', 'templates', gender],
    queryFn: () => replication.templates(gender === 'unisex' ? undefined : gender),
    staleTime: 300_000,
  })

  const state = useQuery({
    queryKey: ['replication', 'state', designId],
    queryFn: () => replication.state(designId as string),
    enabled: Boolean(designId),
    refetchInterval: (query) => (activeJob(query.state.data?.renders) ? 2500 : false),
  })

  const current = state.data
  const blueprint = current?.blueprint ?? null
  const referenceUrl = current?.reference.content_url ?? pendingAsset?.url ?? null

  // Prefill the customisation controls from what the analysis actually found.
  useEffect(() => {
    if (!blueprint) return
    setCustom((existing) => ({
      ...existing,
      neckline: blueprint.observations.neckline?.value ?? existing.neckline,
      sleeves: blueprint.observations.sleeve_design?.value ?? existing.sleeves,
      collar: blueprint.observations.collar?.value ?? existing.collar,
      borders: blueprint.observations.borders_trims?.value ?? existing.borders,
      primary: blueprint.colors[0]?.hex ?? existing.primary,
      secondary: blueprint.colors[1]?.hex ?? existing.secondary,
    }))
  }, [blueprint])

  const invalidate = useCallback(() => {
    if (designId) {
      void queryClient.invalidateQueries({ queryKey: ['replication', 'state', designId] })
    }
  }, [designId, queryClient])

  const createDesign = useMutation({
    mutationFn: async () => {
      if (!garment) throw new Error('Choose a garment first.')
      const design = await api.post<Design>('/designs', {
        garment_id: garment.garment_id,
        name: designName.trim() || `Reference study — ${garment.name}`,
        components: {},
      })
      await replication.setTarget(design.id, gender)
      if (pendingAsset) {
        await replication.attachReference(design.id, pendingAsset.id)
      }
      return design
    },
    onSuccess: (design) => {
      setDesignId(design.id)
      setPendingAsset(null)
      setStep(3)
      void queryClient.invalidateQueries({ queryKey: ['designs'] })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The design could not be created.')
    },
  })

  const analyse = useMutation({
    mutationFn: () => replication.analyse(designId as string),
    onSuccess: () => {
      toast.success('Reference analysed. Check each detail before rendering.')
      invalidate()
    },
  })

  const saveCorrections = useMutation({
    mutationFn: (patch: BlueprintPatch) => replication.correct(designId as string, patch),
    onSuccess: () => {
      toast.success('Corrections saved.')
      invalidate()
    },
  })

  const render = useMutation({
    mutationFn: async (request: { kind: 'full' | 'parts'; view: 'front' | 'back' }) => {
      setRenderError(null)
      if (!designId) throw new Error('Create the design first.')

      // Fold the slot controls into the blueprint so the model is instructed
      // with what the user actually selected, not with stale analysis.
      const slotPatch: NonNullable<BlueprintPatch['observations']> = {}
      if (blueprint) {
        const compare = {
          neckline: custom.neckline,
          sleeve_design: custom.sleeves,
          collar: custom.collar,
          borders_trims: custom.borders,
        } as const
        for (const [slot, value] of Object.entries(compare)) {
          const original = blueprint.observations[slot as keyof typeof blueprint.observations]?.value ?? ''
          if (value.trim() && value.trim() !== original) {
            slotPatch[slot as keyof typeof blueprint.observations] = {
              value: value.trim(),
              confidence: 1,
            }
          }
        }
      }
      if (Object.keys(slotPatch).length > 0) {
        await replication.correct(designId, { observations: slotPatch })
      }

      const instruction = [
        custom.length ? `Garment length: ${custom.length}.` : '',
        custom.scale !== 1 ? `Scale the pattern to ${custom.scale.toFixed(1)}x.` : '',
        custom.primary ? `Primary colour ${custom.primary}.` : '',
        custom.secondary ? `Secondary colour ${custom.secondary}.` : '',
        custom.notes.trim(),
      ]
        .filter(Boolean)
        .join(' ')

      return replication.render(designId, {
        kind: request.kind,
        view: request.view,
        parts: request.kind === 'parts' ? partTargets : [],
        instruction: instruction || null,
      })
    },
    onSuccess: () => {
      toast.info('Render queued. This can take a minute.')
      invalidate()
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setRenderError(error.message)
      } else {
        setRenderError('The render could not be started.')
      }
    },
  })

  const availableGarments = useMemo(() => templates.data?.items ?? [], [templates.data])
  const grouped = useMemo(() => {
    const map = new Map<string, GarmentTemplate[]>()
    for (const item of availableGarments) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [availableGarments])

  const active = activeJob(current?.renders)
  const frontAsset = current?.latest_render_by_view.front ?? null
  const backAsset = current?.latest_render_by_view.back ?? null
  const shownAsset = view === 'back' ? backAsset : frontAsset
  const maxReached = designId ? 6 : pendingAsset ? 2 : 1

  const unknownCount = blueprint
    ? Object.values(blueprint.observations).filter((entry) => !entry.value).length
    : 0

  return (
    <div className="shell py-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow">Design studio</p>
          <h1 className="mt-2 display-lg">Replicate a design</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Bring a reference — a photo, a screenshot, a fabric detail, a sketch — and apply it to
            one of the studio's garment templates. You review every detail before anything is
            rendered.
          </p>
        </div>
        <LinkButton to="/designs" variant="secondary" size="sm">
          Saved designs
        </LinkButton>
      </header>

      <div className="mt-4">
        <StepNav step={step} maxReached={maxReached} onSelect={setStep} />
      </div>

      {capabilities.data && !capabilities.data.analysis.configured && (
        <div className="mt-4">
          <Notice tone="warn" title="Automatic analysis is unavailable on this server">
            {capabilities.data.analysis.reason}
          </Notice>
        </div>
      )}

      {/* ---------------------------------------------------------------- step 1 */}
      {step === 1 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <ReferenceUploader
            asset={pendingAsset}
            onChange={(asset) => setPendingAsset(asset)}
            onRemove={() => setPendingAsset(null)}
            disabled={Boolean(designId)}
          />
          <div className="panel p-4 sm:p-5">
            <h2 className="font-display text-base font-semibold">What makes a good reference</h2>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">
              <li>One garment, clearly lit, filling most of the frame.</li>
              <li>
                For a specific detail — a neckline, an embroidered yoke, a border — crop to that
                detail so the model is not guessing from a full-length shot.
              </li>
              <li>A flat pattern scan or your own artwork works well for prints.</li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              Your reference stays private to your account. It is sent to the analysis model only
              when you press Analyse, and it is never used to train a model.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                variant="primary"
                disabled={!pendingAsset}
                onClick={() => setStep(2)}
              >
                Continue to garment
              </Button>
              {!pendingAsset && (
                <p className="mt-2 text-[0.6875rem] text-ink-muted">
                  Add a reference to continue. You can also describe the design by hand later.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- step 2 */}
      {step === 2 && (
        <div className="mt-6 space-y-4">
          <div className="panel p-4 sm:p-5">
            <h2 className="font-display text-base font-semibold">Who is this for?</h2>
            <p className="mt-1 text-xs text-ink-muted">
              You choose this — it is never inferred from your photo or reference.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['women', 'men', 'unisex'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGender(option)}
                  aria-pressed={gender === option}
                  className={cn(
                    'min-h-10 rounded-sm px-4 text-sm font-medium capitalize transition-colors',
                    gender === option
                      ? 'bg-ink text-paper'
                      : 'bg-paper text-ink-soft ring-1 ring-inset ring-line hover:ring-line-strong',
                  )}
                >
                  {option === 'women' ? "Women's" : option === 'men' ? "Men's" : 'Unisex'}
                </button>
              ))}
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Choose a garment template</h2>
              <Badge tone="neutral">{availableGarments.length} templates</Badge>
            </div>
            <p className="mt-1 text-xs text-ink-muted">{templates.data?.note}</p>

            {templates.isLoading && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-sm" />
                ))}
              </div>
            )}

            {templates.isError && (
              <div className="mt-4">
                <ErrorState
                  title="Templates could not be loaded"
                  message="The catalogue did not respond."
                  onRetry={() => void templates.refetch()}
                />
              </div>
            )}

            {!templates.isLoading && availableGarments.length === 0 && (
              <div className="mt-4">
                <EmptyState
                  title="No templates for this category"
                  description="Try another gender category, or ask an administrator to add garment templates."
                />
              </div>
            )}

            <div className="mt-4 space-y-4">
              {grouped.map(([category, items]) => (
                <div key={category}>
                  <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
                    {category.replace(/_/g, ' ')}
                  </h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                      <button
                        key={item.garment_id}
                        type="button"
                        onClick={() => setGarment(item)}
                        aria-pressed={garment?.garment_id === item.garment_id}
                        className={cn(
                          'min-h-16 rounded-sm border p-2.5 text-left transition-colors',
                          garment?.garment_id === item.garment_id
                            ? 'border-ink bg-bone'
                            : 'border-line bg-paper hover:border-line-strong',
                        )}
                      >
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="mt-0.5 text-[0.6875rem] text-ink-muted">
                          {item.components.length} customisable parts
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <label htmlFor="design-name" className="text-xs font-semibold text-ink-soft">
              Project name
            </label>
            <input
              id="design-name"
              value={designName}
              onChange={(event) => setDesignName(event.target.value)}
              placeholder={garment ? `Reference study — ${garment.name}` : 'Reference study'}
              maxLength={140}
              className="mt-1.5 h-10 w-full max-w-md rounded-sm border border-line bg-paper px-3 text-sm focus:border-ink-soft focus:outline-none"
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                loading={createDesign.isPending}
                disabled={!garment || createDesign.isPending}
                onClick={() => createDesign.mutate()}
              >
                Create project
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              {!garment && (
                <p className="text-[0.6875rem] text-ink-muted">Select a garment to continue.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- step 3 */}
      {step >= 3 && designId && (
        <div className="mt-6 space-y-4">
          {state.isLoading && <Skeleton className="h-40 w-full rounded-md" />}

          {state.isError && (
            <ErrorState
              title="This design could not be loaded"
              message="The project may have been deleted."
              onRetry={() => void state.refetch()}
            />
          )}

          {step === 3 && current && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <div className="panel overflow-hidden">
                {referenceUrl ? (
                  <img src={referenceUrl} alt="Your reference" className="w-full bg-bone" />
                ) : (
                  <div className="flex aspect-[4/5] items-center justify-center bg-bone p-6 text-center">
                    <p className="text-xs text-ink-muted">No reference attached.</p>
                  </div>
                )}
                <div className="p-3">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">
                    Original reference
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Stored unchanged on the server. Edits create copies.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {!blueprint ? (
                  <div className="panel p-4 sm:p-5">
                    <h2 className="font-display text-base font-semibold">Analyse the reference</h2>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
                      The vision model will report only what it can actually see. Details it cannot
                      see are marked as not visible, and you can correct anything.
                    </p>

                    {!current.analysis_available && (
                      <div className="mt-3">
                        <Notice tone="warn" title="Analysis is unavailable">
                          {current.analysis_reason}
                        </Notice>
                      </div>
                    )}

                    {analyse.isError && (
                      <div className="mt-3">
                        <Notice tone="warn" title="Analysis did not complete">
                          {analyse.error instanceof ApiError
                            ? analyse.error.message
                            : 'The analyser could not process this image.'}
                        </Notice>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        loading={analyse.isPending}
                        disabled={!current.analysis_available || analyse.isPending}
                        onClick={() => analyse.mutate()}
                      >
                        Analyse reference
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setStep(4)}>
                        Skip and describe by hand
                      </Button>
                    </div>
                  </div>
                ) : (
                  <BlueprintReview
                    blueprint={blueprint as Blueprint}
                    saving={saveCorrections.isPending}
                    onSave={(patch) => saveCorrections.mutate(patch)}
                  />
                )}

                {blueprint && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="primary" onClick={() => setStep(4)}>
                      Continue to customise
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      loading={analyse.isPending}
                      disabled={!current.analysis_available}
                      onClick={() => analyse.mutate()}
                    >
                      Re-analyse
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ step 4 */}
          {step === 4 && current && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
              <div className="panel p-4 sm:p-5">
                <h2 className="font-display text-base font-semibold">Customise</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  These controls change what the render is asked for. Nothing here claims a physical
                  garment has been made.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['neckline', 'Neckline'],
                      ['sleeves', 'Sleeve length & style'],
                      ['collar', 'Collar'],
                      ['borders', 'Borders & trims'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-xs font-semibold text-ink-soft">{label}</span>
                      <input
                        value={custom[key]}
                        onChange={(event) =>
                          setCustom((existing) => ({ ...existing, [key]: event.target.value }))
                        }
                        placeholder="Leave blank to keep the template"
                        className="mt-1 h-9 w-full rounded-sm border border-line bg-paper px-2.5 text-sm focus:border-ink-soft focus:outline-none"
                      />
                    </label>
                  ))}

                  <label className="block">
                    <span className="text-xs font-semibold text-ink-soft">Garment length</span>
                    <select
                      value={custom.length}
                      onChange={(event) =>
                        setCustom((existing) => ({ ...existing, length: event.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-sm border border-line bg-paper px-2 text-sm focus:border-ink-soft focus:outline-none"
                    >
                      {LENGTHS.map((option) => (
                        <option key={option || 'keep'} value={option}>
                          {option || 'Template default'}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="block">
                    <label htmlFor="scale" className="text-xs font-semibold text-ink-soft">
                      Pattern scale · {custom.scale.toFixed(1)}×
                    </label>
                    <input
                      id="scale"
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={custom.scale}
                      onChange={(event) =>
                        setCustom((existing) => ({ ...existing, scale: Number(event.target.value) }))
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  {(
                    [
                      ['primary', 'Primary colour'],
                      ['secondary', 'Secondary colour'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="block">
                      <span className="text-xs font-semibold text-ink-soft">{label}</span>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={label}
                          value={custom[key] || '#cccccc'}
                          onChange={(event) =>
                            setCustom((existing) => ({ ...existing, [key]: event.target.value }))
                          }
                          className="size-9 rounded-sm border border-line bg-paper"
                        />
                        <input
                          value={custom[key]}
                          onChange={(event) =>
                            setCustom((existing) => ({ ...existing, [key]: event.target.value }))
                          }
                          placeholder="#hex or blank"
                          className="h-9 min-w-0 flex-1 rounded-sm border border-line bg-paper px-2.5 text-sm focus:border-ink-soft focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <label className="mt-3 block">
                  <span className="text-xs font-semibold text-ink-soft">
                    Designer instruction (optional)
                  </span>
                  <textarea
                    value={custom.notes}
                    onChange={(event) =>
                      setCustom((existing) => ({ ...existing, notes: event.target.value }))
                    }
                    rows={3}
                    maxLength={600}
                    placeholder="Keep the floral yoke on the front and a plain back."
                    className="mt-1 w-full rounded-sm border border-line bg-paper px-2.5 py-2 text-sm focus:border-ink-soft focus:outline-none"
                  />
                </label>

                <div className="mt-4 border-t border-line pt-4">
                  <h3 className="text-xs font-semibold text-ink-soft">
                    Regenerate only some parts
                  </h3>
                  <p className="mt-1 text-[0.6875rem] text-ink-muted">
                    Leave everything unselected for a full render.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {current.garment.components.map((component) => {
                      const selected = partTargets.includes(component.id)
                      return (
                        <button
                          key={component.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setPartTargets((existing) =>
                              selected
                                ? existing.filter((id) => id !== component.id)
                                : [...existing, component.id],
                            )
                          }
                          className={cn(
                            'min-h-9 rounded-full px-3 text-[0.8125rem] font-medium transition-colors',
                            selected
                              ? 'bg-clay text-paper'
                              : 'bg-paper text-ink-soft ring-1 ring-inset ring-line',
                          )}
                        >
                          {component.label ?? component.id}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="panel p-4">
                  <h3 className="text-sm font-semibold">Render</h3>
                  {!current.rendering_available ? (
                    <div className="mt-2">
                      <Notice tone="warn" title="Rendering is unavailable">
                        {current.rendering_reason}
                      </Notice>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                      Renders are queued and run in the background. You can leave this page and
                      come back.
                    </p>
                  )}

                  {active && (
                    <p className="mt-3 rounded-sm bg-bone px-2.5 py-2 text-xs text-ink-soft">
                      {active.status === 'running' ? 'Rendering…' : 'Queued…'} this usually takes
                      30–90 seconds.
                    </p>
                  )}

                  {renderError && (
                    <div className="mt-3">
                      <Notice tone="warn" title="Render not started">
                        {renderError}
                      </Notice>
                    </div>
                  )}

                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      block
                      disabled={!current.rendering_available || render.isPending || Boolean(active)}
                      loading={render.isPending}
                      onClick={() => render.mutate({ kind: 'full', view })}
                    >
                      Render {view} view
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      block
                      disabled={
                        !current.rendering_available ||
                        render.isPending ||
                        Boolean(active) ||
                        partTargets.length === 0
                      }
                      onClick={() => render.mutate({ kind: 'parts', view })}
                    >
                      Regenerate selected parts
                    </Button>
                  </div>

                  <div className="mt-3 flex gap-1.5">
                    {(['front', 'back'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setView(option)}
                        aria-pressed={view === option}
                        className={cn(
                          'min-h-9 flex-1 rounded-sm text-[0.8125rem] font-medium capitalize',
                          view === option
                            ? 'bg-ink text-paper'
                            : 'bg-paper text-ink-soft ring-1 ring-inset ring-line',
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <Button type="button" variant="outline" block onClick={() => setStep(5)}>
                  Go to preview
                </Button>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ step 5 */}
          {step === 5 && current && (
            <div className="space-y-4">
              <div className="panel p-4 sm:p-5">
                <h2 className="font-display text-base font-semibold">Four different things</h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">
                  These are deliberately shown separately. A generated design is an interpretation,
                  not a photograph of a manufactured garment, and it is not the same thing as your
                  reference.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ArtifactCard
                  eyebrow="1 · Original reference"
                  title="Your upload"
                  body="Stored unchanged. Nothing in this flow edits it."
                  imageUrl={referenceUrl}
                />
                <ArtifactCard
                  eyebrow="2 · AI-analyzed design"
                  title={blueprint ? 'Observations' : 'Not analysed'}
                  body={
                    blueprint
                      ? `${Object.keys(blueprint.observations).length - unknownCount} details identified, ${unknownCount} not visible. These are descriptions, not images.`
                      : 'No analysis was run. You can still customise and render.'
                  }
                  tone="neutral"
                />
                <ArtifactCard
                  eyebrow="3 · AI-generated clothing design"
                  title={shownAsset ? 'Rendered' : 'No render yet'}
                  body={
                    shownAsset
                      ? 'Produced by the image model from your reference and controls.'
                      : 'Render a view to see a generated design.'
                  }
                  imageUrl={shownAsset ? `/api/v1/media/${shownAsset}/content` : null}
                  tone="clay"
                />
                <ArtifactCard
                  eyebrow="4 · Final user-edited design"
                  title={shownAsset ? 'Your current version' : 'Awaiting a render'}
                  body="The latest render after your corrections. Export it to keep a copy."
                  imageUrl={shownAsset ? `/api/v1/media/${shownAsset}/content` : null}
                  tone="ink"
                  action={
                    shownAsset ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void downloadFile(
                            `/media/${shownAsset}/download`,
                            `design-${current.design_id.slice(0, 8)}-${view}.png`,
                          )
                        }
                      >
                        Download
                      </Button>
                    ) : null
                  }
                />
              </div>

              <Notice tone="info" title="About this preview">
                {current.disclosure}
              </Notice>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(4)}>
                  Back to customise
                </Button>
                <Button type="button" variant="primary" onClick={() => setStep(6)}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ step 6 */}
          {step === 6 && current && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="panel p-4 sm:p-5">
                <h2 className="font-display text-base font-semibold">Save and export</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  The project is saved automatically — every correction and render is stored against
                  this design. Reopen it any time from Saved designs.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <LinkButton to="/designs" variant="secondary" size="sm">
                    Open saved designs
                  </LinkButton>
                  {frontAsset && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void downloadFile(
                          `/media/${frontAsset}/download`,
                          `design-${current.design_id.slice(0, 8)}-front.png`,
                        )
                      }
                    >
                      Download front
                    </Button>
                  )}
                  {backAsset && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void downloadFile(
                          `/media/${backAsset}/download`,
                          `design-${current.design_id.slice(0, 8)}-back.png`,
                        )
                      }
                    >
                      Download back
                    </Button>
                  )}
                </div>
                {!frontAsset && (
                  <p className="mt-2 text-[0.6875rem] text-ink-muted">
                    Nothing to download yet — render a view first.
                  </p>
                )}
              </div>

              <div className="panel p-4 sm:p-5">
                <h2 className="font-display text-base font-semibold">Try it on</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{current.try_on.label}</p>
                <p className="mt-3 rounded-sm bg-bone px-2.5 py-2 text-[0.6875rem] leading-relaxed text-ink-soft">
                  {TRY_ON_DISCLOSURE}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/fitting-room?design=${current.design_id}&garment=${current.try_on.garment_id}`,
                      )
                    }
                  >
                    Continue to try-on
                  </Button>
                  <LinkButton to="/fitting-room" variant="secondary" size="sm">
                    How try-on works
                  </LinkButton>
                </div>
                <p className="mt-2 text-[0.6875rem] text-ink-muted">
                  Try-on uses a different model and requires your explicit consent before your
                  photo is processed.
                </p>
              </div>

              <div className="panel p-4 sm:p-5 lg:col-span-2">
                <h2 className="font-display text-base font-semibold">Recent renders</h2>
                {current.renders.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">No renders yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {current.renders.map((job) => (
                      <li key={job.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                        <Badge
                          tone={
                            job.status === 'succeeded'
                              ? 'olive'
                              : job.status === 'failed' || job.status === 'unavailable'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {job.status}
                        </Badge>
                        <span className="capitalize text-ink-soft">{job.view} view</span>
                        <span className="text-ink-muted">
                          {job.kind === 'parts' ? `parts: ${job.parts.join(', ')}` : 'full render'}
                        </span>
                        {job.stalled && (
                          <span className="text-danger">
                            stalled — the worker did not pick this up, retry it
                          </span>
                        )}
                        {job.error && <span className="text-danger">{job.error}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-[0.6875rem] leading-relaxed text-ink-muted">
        Designs are generated from your own reference imagery. Do not upload copyrighted catalogue
        photography or images you do not have permission to use. <Link to="/terms" className="underline">Terms</Link>
      </p>
    </div>
  )
}
