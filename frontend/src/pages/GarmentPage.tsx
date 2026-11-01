import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { useStudioStore } from '@/stores/studioStore'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { AvatarScene } from '@/components/three/AvatarScene'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { ColorField } from '@/components/ui/ColorField'
import { Badge, ErrorState, LoadingBlock, Notice } from '@/components/ui/Primitives'
import { FALLBACK_AVATAR } from '@/lib/avatarDefaults'
import { formatPrice, titleCase } from '@/lib/format'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { useFavorites } from '@/hooks/useFavorites'
import { occasionLabel, styleLabel } from '@/lib/catalog'
import type {
  Avatar,
  ComponentCustomisation,
  Design,
  DesignAnalysis,
  Garment,
  MediaAsset,
  Profile,
} from '@/lib/types'

const PATTERNS = [
  'solid',
  'printed',
  'embroidered',
  'traditional',
  'stripes',
  'checks',
  'houndstooth',
  'floral',
  'paisley',
  'geometric',
  'polka',
  'animal',
  'gradient',
  'custom_print',
]

const EMBROIDERIES = ['none', 'thread', 'sequin', 'beadwork', 'applique', 'gold_work']

function defaultComponents(garment: Garment): Record<string, ComponentCustomisation> {
  const result: Record<string, ComponentCustomisation> = {}
  garment.components.forEach((component) => {
    result[component.id] = {
      color: garment.palette.primary ?? garment.default_color,
      fabric: component.fabrics.includes(garment.default_fabric)
        ? garment.default_fabric
        : component.fabrics[0] ?? 'cotton',
      pattern: 'solid',
      embroidery: 'none',
    }
  })
  return result
}

export function GarmentPage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const requestedDesignId = searchParams.get('design')
  const appliedDesignRef = useRef<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isFavorite, toggle, signedIn } = useFavorites()
  const user = useAuthStore((state) => state.user)
  const addItem = useStudioStore((state) => state.addItem)

  const [components, setComponents] = useState<Record<string, ComponentCustomisation>>({})
  const [activeComponent, setActiveComponent] = useState<string | null>(null)
  const [designName, setDesignName] = useState('')
  const [notes, setNotes] = useState('')
  const [fit, setFit] = useState<'regular' | 'slim' | 'relaxed'>('regular')
  const [savedDesignId, setSavedDesignId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'3d' | 'flat'>('3d')
  const [analysis, setAnalysis] = useState<DesignAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)

  const garmentQuery = useQuery({
    queryKey: qk.garment(slug),
    queryFn: () => fetchers.garment(slug),
    enabled: Boolean(slug),
  })

  const profileQuery = useQuery<Profile>({
    queryKey: qk.profile,
    queryFn: fetchers.profile,
    enabled: Boolean(user),
  })

  const avatarsQuery = useQuery<Avatar[]>({
    queryKey: qk.avatars,
    queryFn: fetchers.avatars,
    enabled: Boolean(user),
  })

  const designsQuery = useQuery({
    queryKey: qk.designs({ limit: 100 }),
    queryFn: () => fetchers.designs({ limit: 100 }),
    enabled: Boolean(user),
  })

  const mediaQuery = useQuery({
    queryKey: qk.media,
    queryFn: fetchers.media,
    enabled: Boolean(user),
  })

  const garment = garmentQuery.data

  useEffect(() => {
    if (!garment) return
    setComponents(defaultComponents(garment))
    setDesignName(`${garment.name} study`)
    setActiveComponent(garment.components[0]?.id ?? null)
    setSavedDesignId(null)
  }, [garment])

  const avatar = avatarsQuery.data?.find((item) => item.is_primary) ?? avatarsQuery.data?.[0]
  const parameters = avatar?.parameters ?? FALLBACK_AVATAR

  const fittingItems = useMemo(
    () =>
      garment
        ? [
            {
              key: `${garment.id}:preview`,
              slot: garment.slot,
              garment,
              designId: savedDesignId,
              designName: null,
              components,
            },
          ]
        : [],
    [garment, components, savedDesignId],
  )

  const printAssets = useMemo(
    () => (mediaQuery.data?.items ?? []).filter((asset: MediaAsset) => asset.kind === 'print'),
    [mediaQuery.data],
  )

  const designsForGarment = useMemo(
    () => (designsQuery.data?.items ?? []).filter((design: Design) => design.garment_id === garment?.id),
    [designsQuery.data, garment?.id],
  )

  const updateComponent = (id: string, patch: Partial<ComponentCustomisation>) => {
    setComponents((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  const printRequired = Object.values(components).some(
    (component) => component.pattern === 'custom_print' && !component.print_asset_id,
  )

  const saveDesign = useMutation({
    mutationFn: async () => {
      if (!garment) throw new Error('Garment not loaded')
      const payload = {
        name: designName.trim() || `${garment.name} study`,
        components,
        fit: { cut: fit },
        notes: notes.trim() || null,
      }
      if (savedDesignId) {
        return api.patch<Design>(`/designs/${savedDesignId}`, payload)
      }
      return api.post<Design>('/designs', { ...payload, garment_id: garment.id })
    },
    onSuccess: (design) => {
      setSavedDesignId(design.id)
      queryClient.invalidateQueries({ queryKey: ['designs'] })
      toast.success('Design saved', `${design.name} is now in your library.`)
    },
    onError: (error) => {
      toast.error('Could not save the design', error instanceof ApiError ? error.message : 'Try again in a moment.')
    },
  })

  const openStudio = () => {
    if (savedDesignId) {
      navigate(`/editor/${savedDesignId}`)
      return
    }
    saveDesign.mutate(undefined, {
      onSuccess: (design) => navigate(`/editor/${design.id}`),
    })
  }

  const uploadPrint = useMutation({
    mutationFn: ({ file, componentId }: { file: File; componentId: string }) =>
      api.upload<MediaAsset>('/media/upload', file, { kind: 'print' }).then((asset) => ({ asset, componentId })),
    onSuccess: ({ asset, componentId }) => {
      updateComponent(componentId, { pattern: 'custom_print', print_asset_id: asset.id })
      queryClient.invalidateQueries({ queryKey: qk.media })
      toast.success('Artwork uploaded', 'It is stored privately against your account.')
    },
    onError: (error) => {
      toast.error('Upload failed', error instanceof ApiError ? error.message : 'Check the file and try again.')
    },
  })

  // Deep link from the design library: /garment/<slug>?design=<id>.
  // The ref keeps the link from re-applying after every save-invalidation.
  useEffect(() => {
    if (!requestedDesignId || appliedDesignRef.current === requestedDesignId) return
    const design = designsForGarment.find((item) => item.id === requestedDesignId)
    if (!design) return
    appliedDesignRef.current = requestedDesignId
    setComponents(design.components)
    setDesignName(design.name)
    setNotes(design.notes ?? '')
    setFit((design.fit?.cut as typeof fit) ?? 'regular')
    setSavedDesignId(design.id)
  }, [requestedDesignId, designsForGarment, fit])

  const loadDesign = (design: Design) => {
    setComponents(design.components)
    setDesignName(design.name)
    setNotes(design.notes ?? '')
    setFit((design.fit?.cut as typeof fit) ?? 'regular')
    setSavedDesignId(design.id)
    toast.info('Design loaded', 'Adjust any component and save to update it.')
  }

  const runAnalysis = async (assetId: string) => {
    setAnalysisLoading(true)
    setAnalysis(null)
    try {
      const result = await api.post<DesignAnalysis>(`/ai/analyze/${assetId}`)
      setAnalysis(result)
    } catch (error) {
      toast.error('Analysis unavailable', error instanceof ApiError ? error.message : 'Try again later.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  if (garmentQuery.isLoading) {
    return (
      <div className="shell py-16">
        <LoadingBlock label="Loading garment" rows={4} />
      </div>
    )
  }

  if (garmentQuery.isError || !garment) {
    return (
      <div className="shell py-16">
        <ErrorState
          title="This garment could not be loaded"
          message="It may have been retired from the catalogue."
          onRetry={() => garmentQuery.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="shell py-8">
      <nav className="mb-6 flex items-center gap-2 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
        <Link to="/studio/women" className="hover:text-ink">
          Collection
        </Link>
        <span aria-hidden="true">/</span>
        <span>{titleCase(garment.category)}</span>
        <span aria-hidden="true">/</span>
        <span className="text-ink">{garment.name}</span>
      </nav>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[1.05fr_1fr]">
        {/* -------------------------------------------------------- preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="relative border border-line bg-bone/40">
            {viewMode === '3d' ? (
              <AvatarScene
                parameters={parameters}
                skinTone={profileQuery.data?.skin_tone ?? avatar?.skin_tone ?? '#c99a76'}
                hairColor={profileQuery.data?.hair_color ?? avatar?.hair_color ?? '#241c18'}
                hairStyle={profileQuery.data?.hair_style ?? avatar?.hair_style ?? 'short'}
                itemsOverride={fittingItems}
                className="aspect-[4/5] w-full"
                showControls={false}
              />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center">
                <GarmentArt garment={garment} components={components} className="h-[86%] w-[70%]" />
              </div>
            )}

            <div className="absolute left-3 top-3 flex border border-line bg-paper/90 text-[0.625rem] uppercase tracking-[0.12em]">
              {(['3d', 'flat'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-2.5 py-1.5 ${viewMode === mode ? 'bg-ink text-paper' : 'text-ink-muted'}`}
                  aria-pressed={viewMode === mode}
                >
                  {mode === '3d' ? 'Avatar' : 'Flat'}
                </button>
              ))}
            </div>

            <div className="absolute right-3 top-3">
              <Badge tone="neutral">{titleCase(garment.slot)}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-line border border-t-0 border-line bg-paper">
            <div className="p-3">
              <p className="label-xs">Fabric</p>
              <p className="mt-1 text-xs">{titleCase(garment.default_fabric)}</p>
            </div>
            <div className="p-3">
              <p className="label-xs">Components</p>
              <p className="mt-1 text-xs">{garment.components.length} parts</p>
            </div>
            <div className="p-3">
              <p className="label-xs">From</p>
              <p className="mt-1 text-xs">{formatPrice(garment.base_price_cents, garment.currency)}</p>
            </div>
          </div>

          {profileQuery.data?.size_recommendation?.size && (
            <div className="mt-3 flex items-center justify-between border border-line bg-paper p-3 text-xs">
              <span className="text-ink-muted">Your recommended base size</span>
              <span className="font-medium">
                {profileQuery.data.size_recommendation.size.label} · EU {profileQuery.data.size_recommendation.size.eu}
              </span>
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- editor */}
        <div className="space-y-6">
          <header className="border-b border-line pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="clay">{titleCase(garment.category)}</Badge>
              <Badge tone="neutral">{titleCase(garment.season)}</Badge>
              {garment.styles.slice(0, 3).map((style) => (
                <Badge key={style} tone="olive">
                  {styleLabel(style)}
                </Badge>
              ))}
              {garment.occasions.slice(0, 2).map((occasion) => (
                <Badge key={occasion} tone="neutral">
                  {occasionLabel(occasion)}
                </Badge>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <h1 className="display-lg">{garment.name}</h1>
              {signedIn && (
                <button
                  type="button"
                  onClick={() =>
                    toggle.mutate({ slug: garment.slug, next: !isFavorite(garment.slug, garment.is_favorite) })
                  }
                  aria-pressed={isFavorite(garment.slug, garment.is_favorite)}
                  className="flex items-center gap-2 border border-line px-3 py-2 text-[0.625rem] uppercase tracking-[0.12em] hover:border-ink"
                >
                  <span className={isFavorite(garment.slug, garment.is_favorite) ? 'text-clay' : 'text-ink-muted'}>
                    {isFavorite(garment.slug, garment.is_favorite) ? '♥' : '♡'}
                  </span>
                  {isFavorite(garment.slug, garment.is_favorite) ? 'Saved' : 'Save piece'}
                </button>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{garment.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs sm:grid-cols-4">
              <div>
                <dt className="label-xs">Fit</dt>
                <dd className="mt-0.5">{titleCase(garment.fit)}</dd>
              </div>
              <div>
                <dt className="label-xs">Sizes</dt>
                <dd className="mt-0.5">{garment.sizes.join(' · ')}</dd>
              </div>
              <div>
                <dt className="label-xs">Fabric</dt>
                <dd className="mt-0.5">{titleCase(garment.default_fabric)}</dd>
              </div>
              <div>
                <dt className="label-xs">Components</dt>
                <dd className="mt-0.5">{garment.components.length} independent parts</dd>
              </div>
            </dl>
          </header>

          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">Components</h2>
              <span className="text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
                Each part is independent
              </span>
            </div>
            <div className="mt-3 divide-y divide-line border border-line">
              {garment.components.map((component, index) => {
                const values = components[component.id]
                const isOpen = activeComponent === component.id
                return (
                  <div key={component.id}>
                    <button
                      type="button"
                      onClick={() => setActiveComponent(isOpen ? null : component.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bone/40"
                      aria-expanded={isOpen}
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-[0.625rem] tabular-nums text-ink-muted">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span>
                          <span className="block text-sm">{component.label}</span>
                          <span className="block text-[0.6875rem] text-ink-muted">
                            {values ? `${titleCase(values.fabric)} · ${titleCase(values.pattern)}` : 'Default'}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-4 border border-line"
                          style={{ backgroundColor: values?.color }}
                          aria-hidden="true"
                        />
                        <span className="text-ink-muted" aria-hidden="true">
                          {isOpen ? '−' : '+'}
                        </span>
                      </span>
                    </button>

                    {isOpen && values && component && (
                      <div className="space-y-4 border-t border-line bg-bone/20 px-4 py-4">
                        {component.description && (
                          <p className="text-xs leading-relaxed text-ink-muted">{component.description}</p>
                        )}
                        <ColorField
                          label="Colour"
                          value={values.color}
                          onChange={(color) => updateComponent(component.id, { color })}
                          swatches={[
                            garment.palette.primary ?? '#15130f',
                            garment.palette.secondary ?? '#f4f1ea',
                            garment.palette.accent ?? '#8a5a3b',
                            '#15130f',
                            '#f4f1ea',
                            '#8a5a3b',
                            '#55614c',
                            '#6d2230',
                            '#c9b7a0',
                          ]}
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Select
                            label="Fabric"
                            value={values.fabric}
                            onChange={(event) => updateComponent(component.id, { fabric: event.target.value })}
                            options={component.fabrics.map((fabric) => ({
                              value: fabric,
                              label: titleCase(fabric),
                            }))}
                          />
                          <Select
                            label="Pattern"
                            value={values.pattern}
                            onChange={(event) => updateComponent(component.id, { pattern: event.target.value })}
                            options={PATTERNS.filter(
                              (pattern) => pattern !== 'custom_print' || component.allows_print,
                            ).map((pattern) => ({ value: pattern, label: titleCase(pattern) }))}
                          />
                          <Select
                            label="Embroidery"
                            value={values.embroidery}
                            onChange={(event) => updateComponent(component.id, { embroidery: event.target.value })}
                            options={EMBROIDERIES.map((item) => ({ value: item, label: titleCase(item) }))}
                          />
                          {component.allows_print && (
                            <div className="space-y-1.5">
                              <p className="label-xs">Print artwork</p>
                              <div className="flex items-center gap-2">
                                <label className="cursor-pointer border border-line bg-paper px-3 py-2 text-[0.625rem] uppercase tracking-[0.1em] hover:border-ink">
                                  {uploadPrint.isPending ? 'Uploading…' : 'Upload file'}
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="sr-only"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0]
                                      if (file) uploadPrint.mutate({ file, componentId: component.id })
                                    }}
                                  />
                                </label>
                                <select
                                  aria-label="Select existing artwork"
                                  className="min-w-0 flex-1 border border-line bg-paper px-2 py-2 text-xs"
                                  value={values.print_asset_id ?? ''}
                                  onChange={(event) => {
                                    const assetId = event.target.value || null
                                    updateComponent(component.id, {
                                      print_asset_id: assetId,
                                      pattern: assetId ? 'custom_print' : 'solid',
                                    })
                                  }}
                                >
                                  <option value="">No artwork</option>
                                  {printAssets.map((asset) => (
                                    <option key={asset.id} value={asset.id}>
                                      {asset.original_filename}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                        {values.print_asset_id && (
                          <PrintAssetPreview assetId={values.print_asset_id} onAnalyse={runAnalysis} loading={analysisLoading} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {analysis && (
            <Notice tone={analysis.mode === 'model' ? 'success' : 'warn'} title={analysis.mode === 'model' ? `Analysed by ${analysis.provider}` : 'Analysis unavailable'}>
              <p className="font-medium">{analysis.summary}</p>
              {analysis.observations.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {analysis.observations.slice(0, 6).map((observation) => (
                    <li key={observation}>· {observation}</li>
                  ))}
                </ul>
              )}
              {analysis.notice && <p className="mt-2 text-xs opacity-80">{analysis.notice}</p>}
            </Notice>
          )}

          <section className="space-y-4 border border-line p-4">
            <h2 className="font-display text-xl">Fit & finishing</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Cut"
                value={fit}
                onChange={(event) => setFit(event.target.value as typeof fit)}
                options={[
                  { value: 'regular', label: 'Regular' },
                  { value: 'slim', label: 'Slim' },
                  { value: 'relaxed', label: 'Relaxed' },
                ]}
                hint="Recorded in the technical pack for the tailor."
              />
              <Input
                label="Design name"
                value={designName}
                onChange={(event) => setDesignName(event.target.value)}
                maxLength={140}
              />
            </div>
            <Textarea
              label="Production notes (optional)"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Stitch density, lining preference, embroidery placement…"
              maxLength={2000}
            />
          </section>

          {designsForGarment.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-xl">Your designs for this piece</h2>
                <span className="text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
                  {designsForGarment.length} saved
                </span>
              </div>
              <div className="mt-3 divide-y divide-line border border-line">
                {designsForGarment.map((design) => (
                  <div key={design.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{design.name}</p>
                      <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                        {design.status} · {Object.keys(design.components).length} components
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => loadDesign(design)}>
                      Load
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="sticky bottom-0 border border-line bg-paper/95 p-4 backdrop-blur">
            {printRequired && (
              <p className="mb-3 text-xs text-danger">
                A component uses a custom print but no artwork is attached.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="label-xs">Base price</p>
                <p className="font-display text-xl">{formatPrice(garment.base_price_cents, garment.currency)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    addItem({
                      slot: garment.slot,
                      garment,
                      designId: savedDesignId,
                      designName: savedDesignId ? designName : null,
                      components,
                    })
                    toast.success('Added to the fitting room', 'Layer more pieces or save the outfit.')
                    navigate('/fitting-room')
                  }}
                  disabled={printRequired}
                >
                  Try on
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!user) {
                      navigate(`/login?next=${encodeURIComponent(`/garment/${garment.slug}`)}`)
                      return
                    }
                    saveDesign.mutate()
                  }}
                  loading={saveDesign.isPending}
                  disabled={printRequired}
                >
                  {user ? (savedDesignId ? 'Update design' : 'Save design') : 'Sign in to save'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!user) {
                      navigate(`/login?next=${encodeURIComponent(`/garment/${garment.slug}`)}`)
                      return
                    }
                    openStudio()
                  }}
                  disabled={printRequired}
                >
                  Studio layers →
                </Button>
              </div>
            </div>
          </div>

          {!user && (
            <p className="text-xs text-ink-muted">
              Design editing is free without an account. Saving, the fitting room and production
              requests need a free account.{' '}
              <Link to="/register" className="border-b border-ink text-ink">
                Create one
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function PrintAssetPreview({
  assetId,
  onAnalyse,
  loading,
}: {
  assetId: string
  onAnalyse: (assetId: string) => void
  loading: boolean
}) {
  const { url } = useMediaUrl(`/api/v1/media/${assetId}/content?thumbnail=true`)
  return (
    <div className="flex items-center gap-3 border border-line bg-paper p-3">
      <div className="size-14 shrink-0 border border-line bg-bone">
        {url ? (
          <img src={url} alt="Print artwork preview" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-[0.5625rem] text-ink-muted">…</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs">Print artwork attached</p>
        <p className="truncate text-[0.625rem] text-ink-muted">Tiled seamlessly for the print proof sheet.</p>
      </div>
      <Button size="sm" variant="ghost" onClick={() => onAnalyse(assetId)} loading={loading}>
        Analyse
      </Button>
    </div>
  )
}

export default GarmentPage
