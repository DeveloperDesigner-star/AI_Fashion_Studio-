import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { toast } from '@/stores/toastStore'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { GlbAvatar, AvatarSilhouette } from '@/components/three/GlbAvatar'
import { Button, LinkButton } from '@/components/ui/Button'
import { ColorField } from '@/components/ui/ColorField'
import { Input, Select, Toggle } from '@/components/ui/Field'
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Notice,
  PageHeader,
  Skeleton,
} from '@/components/ui/Primitives'
import {
  ADJUSTMENT_KEYS,
  ADJUSTMENT_LABELS,
  ADJUSTMENT_RANGES,
  DEFAULT_ADJUSTMENTS,
  PHOTO_VIEWS,
  adjustmentSummary,
  clampAdjustments,
  photoViewLabel,
} from '@/lib/avatarStudio'
import { formatDate, titleCase } from '@/lib/format'
import type {
  Avatar,
  AvatarAdjustments,
  AvatarBaseModel,
  AvatarParameters,
  MediaAsset,
  Profile,
} from '@/lib/types'

interface PreviewResponse {
  parameters: AvatarParameters
  measurement_notes: string[]
  base_model: string
  adjustments: Record<string, number>
}

interface Draft {
  name: string
  preset: string
  presentation: 'feminine' | 'masculine' | 'neutral'
  skinTone: string
  hairColor: string
  hairStyle: string
  baseModel: string
  adjustments: AvatarAdjustments
  photoIds: string[]
}

const STEPS = [
  'Details',
  'Photos & consent',
  'Base model',
  'Customise',
  'Manual fit',
  'Save',
  'Edit & regenerate',
] as const

const SKIN_TONES = ['#f3d3b5', '#e3b48c', '#c99a76', '#a9744f', '#7d5138', '#4f3324', '#33201a']
const HAIR_COLORS = ['#241c18', '#4a3125', '#8a5a3b', '#c9a06a', '#d9c9b4', '#7d1f2e', '#3a3f4a']

function draftFrom(avatar: Avatar | null, models: AvatarBaseModel[]): Draft {
  const fallbackModel = models[0]?.id ?? 'willow'
  if (!avatar) {
    return {
      name: 'My avatar',
      preset: 'editorial',
      presentation: 'feminine',
      skinTone: '#c99a76',
      hairColor: '#241c18',
      hairStyle: 'short',
      baseModel: fallbackModel,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      photoIds: [],
    }
  }
  return {
    name: avatar.name,
    preset: avatar.preset,
    presentation: avatar.gender_presentation,
    skinTone: avatar.skin_tone,
    hairColor: avatar.hair_color,
    hairStyle: avatar.hair_style,
    baseModel: avatar.base_model,
    adjustments: clampAdjustments(avatar.adjustments),
    photoIds: avatar.photo_asset_ids ?? [],
  }
}

export function AvatarPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Avatar | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  const avatars = useQuery({ queryKey: qk.avatars, queryFn: fetchers.avatars })
  const models = useQuery({
    queryKey: ['avatar-base-models'],
    queryFn: () => api.get<AvatarBaseModel[]>('/avatars/base-models'),
    staleTime: 600_000,
  })
  const profile = useQuery({ queryKey: qk.profile, queryFn: fetchers.profile })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.avatars })

  const setPrimary = useMutation({
    mutationFn: async (avatar: Avatar) => {
      await Promise.all(
        (avatars.data ?? [])
          .filter((item) => item.is_primary && item.id !== avatar.id)
          .map((item) => api.patch(`/avatars/${item.id}`, { is_primary: false })),
      )
      return api.patch<Avatar>(`/avatars/${avatar.id}`, { is_primary: true })
    },
    onSuccess: () => {
      invalidate()
      toast.success('Primary avatar updated')
    },
    onError: () => toast.error('Could not switch the primary avatar'),
  })

  const regenerate = useMutation({
    mutationFn: (avatar: Avatar) => api.post<Avatar>(`/avatars/${avatar.id}/regenerate`),
    onSuccess: (avatar) => {
      invalidate()
      toast.success('Avatar regenerated', `Version ${avatar.version} uses your latest measurements.`)
    },
    onError: (error) =>
      toast.error('Could not regenerate', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const remove = useMutation({
    mutationFn: (avatar: Avatar) => api.delete(`/avatars/${avatar.id}`),
    onSuccess: () => {
      invalidate()
      toast.success('Avatar deleted')
    },
    onError: () => toast.error('Could not delete the avatar'),
  })

  const openWizard = (avatar: Avatar | null) => {
    setEditing(avatar)
    setWizardOpen(true)
  }

  const modelById = useMemo(() => {
    const map = new Map<string, AvatarBaseModel>()
    ;(models.data ?? []).forEach((model) => map.set(model.id, model))
    return map
  }, [models.data])

  const primary = avatars.data?.find((avatar) => avatar.is_primary) ?? avatars.data?.[0]
  const atLimit = (avatars.data?.length ?? 0) >= 5

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Avatar studio"
        title="Your fitting figure"
        description="Start from a bundled 3D base model, then adjust it with the numbers you provide. Photos are optional references — never reconstructed into a body."
        actions={
          <>
            <LinkButton to="/profile" size="sm" variant="outline">
              Measurements
            </LinkButton>
            <Button size="sm" onClick={() => openWizard(null)} disabled={atLimit}>
              {atLimit ? 'Limit reached (5)' : 'New avatar'}
            </Button>
          </>
        }
      />

      {avatars.isLoading && (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-80 w-full" />
          ))}
        </div>
      )}

      {avatars.isError && (
        <div className="mt-8">
          <ErrorState title="Avatars could not be loaded" onRetry={() => avatars.refetch()} />
        </div>
      )}

      {!avatars.isLoading && (avatars.data?.length ?? 0) === 0 && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <EmptyState
            title="No avatar yet"
            description="Create your first figure. It takes three short steps: details, optional photos and the adjustment sliders."
            action={
              <Button onClick={() => openWizard(null)} disabled={atLimit}>
                {atLimit ? 'Limit reached (5)' : 'Create an avatar'}
              </Button>
            }
          />
          <section className="border border-line bg-bone/40 p-6">
            <p className="eyebrow">How avatars work</p>
            <ol className="mt-3 space-y-3 text-sm leading-relaxed text-ink-muted">
              <li>
                <span className="font-display text-base text-ink">01</span> Pick one of four bundled
                GLB mannequins (Willow, Atlas, Line, Curve).
              </li>
              <li>
                <span className="font-display text-base text-ink">02</span> Add measurements you are
                comfortable sharing; height alone is enough to start.
              </li>
              <li>
                <span className="font-display text-base text-ink">03</span> Fine-tune with five
                sliders, then save. Regenerate any time your measurements change.
              </li>
            </ol>
          </section>
        </div>
      )}

      {(avatars.data?.length ?? 0) > 0 && (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {avatars.data?.map((avatar) => {
            const model = modelById.get(avatar.base_model)
            return (
              <article key={avatar.id} className="flex flex-col border border-line bg-paper">
                <div className="relative h-52 bg-bone">
                  <AvatarSilhouette
                    presentation={model?.presentation ?? 'neutral'}
                    skinTone={avatar.skin_tone}
                    hairColor={avatar.hair_color}
                    className="mx-auto h-full w-auto p-3"
                  />
                  <div className="absolute left-3 top-3 flex flex-col gap-1">
                    {avatar.is_primary && <Badge tone="ink">Primary</Badge>}
                    <Badge tone="neutral">{model?.label ?? titleCase(avatar.base_model)}</Badge>
                  </div>
                  <span className="absolute bottom-3 right-3 text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">
                    v{avatar.version}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-2 border-t border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-lg leading-tight">{avatar.name}</h2>
                      <p className="text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted">
                        {titleCase(avatar.gender_presentation)} · {avatar.photo_asset_ids.length} photos ·{' '}
                        {formatDate(avatar.updated_at)}
                      </p>
                    </div>
                    <Badge tone={avatar.source === 'regenerated' ? 'gold' : 'olive'}>
                      {avatar.source === 'regenerated' ? 'Regenerated' : 'Measured'}
                    </Badge>
                  </div>

                  <p className="text-[0.6875rem] leading-relaxed text-ink-muted">
                    {adjustmentSummary(clampAdjustments(avatar.adjustments))}
                  </p>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                    <Button size="sm" onClick={() => openWizard(avatar)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => regenerate.mutate(avatar)}
                      loading={regenerate.isPending && regenerate.variables?.id === avatar.id}
                    >
                      Regenerate
                    </Button>
                    {!avatar.is_primary && (
                      <Button size="sm" variant="ghost" onClick={() => setPrimary.mutate(avatar)}>
                        Set primary
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-danger"
                      onClick={() => {
                        if (window.confirm(`Delete “${avatar.name}”? This cannot be undone.`)) {
                          remove.mutate(avatar)
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {primary && (
        <section className="mt-10 border border-line bg-paper p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Live preview</p>
              <h2 className="font-display text-xl">{primary.name}</h2>
              <p className="text-xs text-ink-muted">
                Drag to orbit. The same GLB model is used by future try-on modules.
              </p>
            </div>
            <LinkButton to="/fitting-room" size="sm" variant="outline">
              Fitting room
            </LinkButton>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
            <GlbAvatar
              modelId={primary.base_model}
              adjustments={clampAdjustments(primary.adjustments)}
              parameters={primary.parameters}
              skinTone={primary.skin_tone}
              hairColor={primary.hair_color}
              hairStyle={primary.hair_style}
              className="h-[420px] w-full"
              showHint
            />
            <dl className="space-y-3 border border-line bg-bone/40 p-4 text-xs">
              <div>
                <dt className="label-xs">Height</dt>
                <dd className="mt-0.5">{primary.parameters.height_m.toFixed(2)} m</dd>
              </div>
              <div>
                <dt className="label-xs">Shoulder width</dt>
                <dd className="mt-0.5">{(primary.parameters.shoulder_width * 100).toFixed(0)} cm</dd>
              </div>
              <div>
                <dt className="label-xs">Torso / leg</dt>
                <dd className="mt-0.5">
                  {(primary.parameters.torso_length * 100).toFixed(0)} /{' '}
                  {(primary.parameters.leg_length * 100).toFixed(0)} cm
                </dd>
              </div>
              <div>
                <dt className="label-xs">Base model</dt>
                <dd className="mt-0.5">{modelById.get(primary.base_model)?.label ?? primary.base_model}</dd>
              </div>
              <div>
                <dt className="label-xs">Adjustments</dt>
                <dd className="mt-0.5 leading-relaxed">
                  {adjustmentSummary(clampAdjustments(primary.adjustments))}
                </dd>
              </div>
              <p className="border-t border-line pt-2 leading-relaxed text-ink-muted">
                A stylised figure, not a body scan. Measurements are yours; proportions outside the
                supplied numbers use population averages.
              </p>
            </dl>
          </div>
        </section>
      )}

      {wizardOpen && (
        <AvatarWizard
          avatar={editing}
          models={models.data ?? []}
          profile={profile.data}
          onClose={() => setWizardOpen(false)}
          onSaved={() => {
            invalidate()
            setWizardOpen(false)
          }}
        />
      )}
    </div>
  )
}

function AvatarWizard({
  avatar,
  models,
  profile,
  onClose,
  onSaved,
}: {
  avatar: Avatar | null
  models: AvatarBaseModel[]
  profile?: Profile
  onClose: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(avatar, models))
  const [consent, setConsent] = useState(Boolean(profile?.photo_consent_at))
  const [savedAvatar, setSavedAvatar] = useState<Avatar | null>(avatar)
  const [uploadingView, setUploadingView] = useState<string | null>(null)

  const media = useQuery({ queryKey: qk.media, queryFn: fetchers.media })
  const photos = useMemo(
    () => (media.data?.items ?? []).filter((asset) => asset.kind === 'photo'),
    [media.data],
  )
  const selectedPhotos = photos.filter((asset) => draft.photoIds.includes(asset.id))

  useEffect(() => {
    if (!avatar && models.length && !models.some((model) => model.id === draft.baseModel)) {
      setDraft((current) => ({ ...current, baseModel: models[0].id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models])

  const preview = useQuery<PreviewResponse>({
    queryKey: ['avatar-preview', draft.baseModel, draft.adjustments, profile?.height_cm, draft.presentation],
    queryFn: () =>
      api.post<PreviewResponse>('/avatars/preview', {
        base_model: draft.baseModel,
        gender_presentation: draft.presentation,
        preset: draft.preset,
        height_cm: profile?.height_cm ?? 172,
        bust_cm: profile?.measurements?.bust_cm ?? null,
        waist_cm: profile?.measurements?.waist_cm ?? null,
        hips_cm: profile?.measurements?.hips_cm ?? null,
        shoulder_cm: profile?.measurements?.shoulder_cm ?? null,
        inseam_cm: profile?.measurements?.inseam_cm ?? null,
        adjustments: draft.adjustments,
      }),
    enabled: step >= 2,
    staleTime: 30_000,
  })

  const previewParameters = preview.data?.parameters ?? avatar?.parameters ?? null

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  const uploadPhoto = useMutation({
    mutationFn: ({ file, view }: { file: File; view: string }) =>
      api.upload<MediaAsset>('/media/upload', file, { kind: 'photo', view }).then((asset) => ({ asset, view })),
    onSuccess: ({ asset }) => {
      queryClient.invalidateQueries({ queryKey: qk.media })
      setDraft((current) => ({ ...current, photoIds: [...current.photoIds, asset.id] }))
      toast.success('Photo added', 'It stays private to your account.')
    },
    onError: (error) =>
      toast.error('Upload rejected', error instanceof ApiError ? error.message : 'Check the image and try again.'),
    onSettled: () => setUploadingView(null),
  })

  const consentMutation = useMutation({
    mutationFn: (value: boolean) => api.put('/profile', { photo_consent: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.profile }),
    onError: () =>
      toast.error('Could not save consent', 'Try again before attaching photos.'),
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name.trim(),
        preset: draft.preset,
        gender_presentation: draft.presentation,
        skin_tone: draft.skinTone,
        hair_color: draft.hairColor,
        hair_style: draft.hairStyle,
        base_model: draft.baseModel,
        adjustments: draft.adjustments,
        photo_asset_ids: draft.photoIds,
      }
      if (avatar) return api.patch<Avatar>(`/avatars/${avatar.id}`, payload)
      return api.post<Avatar>('/avatars', payload)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: qk.avatars })
      setSavedAvatar(saved)
      setStep(6)
      toast.success(avatar ? 'Avatar updated' : 'Avatar created', `${saved.name} is ready in the fitting room.`)
    },
    onError: (error) =>
      toast.error('Avatar not saved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const regenerate = useMutation({
    mutationFn: () => api.post<Avatar>(`/avatars/${savedAvatar?.id}/regenerate`),
    onSuccess: (regenerated) => {
      queryClient.invalidateQueries({ queryKey: qk.avatars })
      setSavedAvatar(regenerated)
      toast.success('Avatar regenerated', `Now at version ${regenerated.version}.`)
    },
    onError: (error) =>
      toast.error('Could not regenerate', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const stepValid = () => {
    if (step === 0) return draft.name.trim().length >= 2
    if (step === 1) {
      if (draft.photoIds.length === 0) return true
      return Boolean(profile?.photo_consent_at || consent)
    }
    if (step === 2) return Boolean(draft.baseModel)
    return true
  }

  const next = () => {
    if (!stepValid()) {
      if (step === 0) toast.error('Name your avatar first')
      else if (step === 1) toast.error('Consent required', 'Confirm the photo consent to attach references.')
      else toast.error('Choose a base model first')
      return
    }
    setStep((current) => Math.min(5, current + 1))
  }

  const model = models.find((entry) => entry.id === draft.baseModel)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={avatar ? 'Edit avatar' : 'Create avatar'}
        className="my-6 w-full max-w-5xl border border-line bg-paper shadow-lift"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">{avatar ? `Editing · v${avatar.version}` : 'New avatar'}</p>
            <h2 className="font-display text-2xl">{avatar ? avatar.name : 'Build your figure'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close avatar editor"
            className="flex size-8 items-center justify-center border border-line hover:border-ink"
          >
            ×
          </button>
        </div>

        <ol className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
          {STEPS.map((label, index) => (
            <li key={label} className="shrink-0">
              <button
                type="button"
                onClick={() => index <= step && (index !== 6 || savedAvatar) && setStep(index)}
                disabled={index > step || (index === 6 && !savedAvatar)}
                aria-current={index === step ? 'step' : undefined}
                className={`px-3 py-1.5 text-[0.5625rem] uppercase tracking-[0.12em] ${
                  index === step
                    ? 'bg-ink text-paper'
                    : index < step
                      ? 'text-ink hover:bg-bone'
                      : 'text-ink-muted/60'
                }`}
              >
                {String(index + 1).padStart(2, '0')} {label}
              </button>
            </li>
          ))}
        </ol>

        <div className="grid gap-0 lg:grid-cols-[1fr_340px]">
          <div className="max-h-[62vh] overflow-y-auto p-5">
            {step === 0 && (
              <div className="space-y-5">
                <Input
                  label="Avatar name"
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                  maxLength={80}
                />

                <div>
                  <p className="label-xs mb-2">Presentation</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['feminine', 'masculine', 'neutral'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => update({ presentation: value })}
                        aria-pressed={draft.presentation === value}
                        className={`border px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.12em] ${
                          draft.presentation === value
                            ? 'border-ink bg-ink text-paper'
                            : 'border-line text-ink-muted hover:border-ink'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <Notice tone="info" title="Bundled, licence-free geometry">
                  These four mannequins ship with the app as GLB files generated from primitives —
                  nothing is downloaded at runtime, and you can swap in Blender-made models later.
                </Notice>
                <div>
                  <p className="label-xs mb-2">Base model</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {models.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => update({ baseModel: entry.id, presentation: entry.presentation })}
                        aria-pressed={draft.baseModel === entry.id}
                        className={`flex gap-3 border p-3 text-left ${
                          draft.baseModel === entry.id
                            ? 'border-ink bg-bone/60'
                            : 'border-line hover:border-ink'
                        }`}
                      >
                        <div className="h-20 w-12 shrink-0">
                          <AvatarSilhouette
                            presentation={entry.presentation}
                            skinTone={draft.skinTone}
                            hairColor={draft.hairColor}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-display text-base leading-tight">{entry.label}</p>
                          <p className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                            {entry.presentation} · {entry.build}
                          </p>
                          <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-muted">
                            {entry.description}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {!models.length && <LoadingBlock label="Loading base models" rows={2} />}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <Select
                  label="Direction"
                  value={draft.preset}
                  onChange={(event) => update({ preset: event.target.value })}
                  options={[
                    { value: 'editorial', label: 'Editorial' },
                    { value: 'tailoring', label: 'Tailoring' },
                    { value: 'minimal', label: 'Minimal' },
                    { value: 'runway', label: 'Runway' },
                  ]}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField
                    label="Skin tone"
                    value={draft.skinTone}
                    onChange={(value) => update({ skinTone: value })}
                    swatches={SKIN_TONES}
                  />
                  <ColorField
                    label="Hair colour"
                    value={draft.hairColor}
                    onChange={(value) => update({ hairColor: value })}
                    swatches={HAIR_COLORS}
                  />
                </div>

                <Select
                  label="Hair style"
                  value={draft.hairStyle}
                  onChange={(event) => update({ hairStyle: event.target.value })}
                  options={['short', 'long', 'bun', 'braid', 'curly', 'bald'].map((value) => ({
                    value,
                    label: titleCase(value),
                  }))}
                />
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <Notice tone="info" title="Photos are references, not measurements">
                  We store your photos privately so you can compare proportions later. We never
                  estimate weight, age or exact body measurements from an image, and no reconstruction
                  is attempted.
                </Notice>

                <div className="grid gap-3 sm:grid-cols-2">
                  {PHOTO_VIEWS.map((view) => {
                    const asset = photos.find((photo) => photo.photo_view === view.value)
                    const attached = asset && draft.photoIds.includes(asset.id)
                    return (
                      <div key={view.value} className="border border-line bg-bone/30 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm">{view.label}</p>
                          {attached ? <Badge tone="olive">Attached</Badge> : <Badge tone="neutral">Optional</Badge>}
                        </div>
                        <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-muted">{view.guidance}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <label className="cursor-pointer border border-line bg-paper px-2.5 py-1.5 text-[0.5625rem] uppercase tracking-[0.1em] hover:border-ink">
                            {uploadingView === view.value ? 'Uploading…' : asset ? 'Replace' : 'Upload'}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (!file) return
                                setUploadingView(view.value)
                                uploadPhoto.mutate({ file, view: view.value })
                              }}
                            />
                          </label>
                          {asset && (
                            <button
                              type="button"
                              onClick={() =>
                                update({
                                  photoIds: draft.photoIds.includes(asset.id)
                                    ? draft.photoIds.filter((id) => id !== asset.id)
                                    : [...draft.photoIds, asset.id],
                                })
                              }
                              className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
                            >
                              {draft.photoIds.includes(asset.id) ? 'Detach' : 'Attach'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {selectedPhotos.length > 0 && (
                  <div>
                    <p className="label-xs mb-2">Attached references</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedPhotos.map((photo) => (
                        <PhotoThumb key={photo.id} asset={photo} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-line pt-4">
                  <Toggle
                    checked={profile?.photo_consent_at ? true : consent}
                    onChange={(value) => {
                      setConsent(value)
                      consentMutation.mutate(value)
                    }}
                    label="I consent to storing and processing my reference photos"
                    description="Required before photos can be attached. Revoke at any time in profile privacy settings; revoking does not delete photos already uploaded."
                  />
                  {profile?.photo_consent_at && (
                    <p className="text-[0.625rem] text-olive">
                      Consent recorded {formatDate(profile.photo_consent_at)}.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <p className="text-xs leading-relaxed text-ink-muted">
                  Manual fit is applied on top of the proportions derived from your measurements.
                  Sliders are clamped to a realistic range; the server enforces the same limits.
                </p>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="label-xs">Manual adjustments</p>
                    <button
                      type="button"
                      onClick={() => update({ adjustments: { ...DEFAULT_ADJUSTMENTS } })}
                      className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="mt-3 space-y-4">
                    {ADJUSTMENT_KEYS.map((key) => {
                      const [low, high] = ADJUSTMENT_RANGES[key]
                      return (
                        <div key={key}>
                          <div className="flex items-baseline justify-between text-xs">
                            <label htmlFor={`adj-${key}`}>{ADJUSTMENT_LABELS[key].label}</label>
                            <span className="text-ink-muted">
                              {Math.round(draft.adjustments[key] * 100)}%
                            </span>
                          </div>
                          <input
                            id={`adj-${key}`}
                            type="range"
                            min={low}
                            max={high}
                            step={0.01}
                            value={draft.adjustments[key]}
                            onChange={(event) =>
                              update({
                                adjustments: clampAdjustments({
                                  ...draft.adjustments,
                                  [key]: Number(event.target.value),
                                }),
                              })
                            }
                            className="mt-1.5 w-full accent-ink"
                          />
                          <p className="text-[0.5625rem] text-ink-muted">{ADJUSTMENT_LABELS[key].hint}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {preview.data?.measurement_notes.map((note) => (
                  <p key={note} className="text-[0.625rem] leading-relaxed text-ink-muted">
                    · {note}
                  </p>
                ))}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5">
                <div className="border border-line p-4">
                  <p className="label-xs">Summary</p>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-ink-muted">Name</dt>
                      <dd>{draft.name || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Base model</dt>
                      <dd>
                        {model?.label ?? draft.baseModel} ({model?.presentation ?? draft.presentation})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Direction</dt>
                      <dd>{titleCase(draft.preset)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Reference photos</dt>
                      <dd>{draft.photoIds.length} attached</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-ink-muted">Adjustments</dt>
                      <dd>{adjustmentSummary(draft.adjustments)}</dd>
                    </div>
                  </dl>
                </div>

                <Notice tone="info" title="What gets saved">
                  The base model, your slider values, the appearance settings, the derived
                  proportions and the ids of the photos you attached. Nothing is inferred from the
                  photos.
                </Notice>

                <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!stepValid()}>
                  {avatar ? 'Save changes' : 'Create avatar'}
                </Button>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-5">
                {savedAvatar ? (
                  <>
                    <div className="border border-line bg-bone/40 p-4">
                      <p className="label-xs">Saved</p>
                      <p className="font-display text-xl">{savedAvatar.name}</p>
                      <p className="text-xs text-ink-muted">
                        Version {savedAvatar.version} · {savedAvatar.source} · {savedAvatar.photo_asset_ids.length}{' '}
                        reference photos
                      </p>
                      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-muted">
                        {adjustmentSummary(clampAdjustments(savedAvatar.adjustments))}
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" onClick={() => setStep(0)}>
                        Keep editing
                      </Button>
                      <Button
                        onClick={() => regenerate.mutate()}
                        loading={regenerate.isPending}
                        disabled={regenerate.isPending}
                      >
                        Regenerate from measurements
                      </Button>
                    </div>

                    <p className="text-[0.625rem] leading-relaxed text-ink-muted">
                      Regeneration re-derives proportions from your latest measurements, keeps the
                      base model and slider values, and records a new version. It never re-reads your
                      photographs.
                    </p>

                    <Button variant="ghost" onClick={onSaved}>
                      Back to avatar studio
                    </Button>
                  </>
                ) : (
                  <>
                    <Notice tone="info" title="Save first">
                      Save the avatar in the previous step to unlock regeneration and editing.
                    </Notice>
                    <Button variant="outline" onClick={() => setStep(5)}>
                      Go to save
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="border-t border-line bg-bone/30 p-4 lg:border-l lg:border-t-0">
            <GlbAvatar
              modelId={draft.baseModel}
              adjustments={draft.adjustments}
              parameters={previewParameters}
              skinTone={draft.skinTone}
              hairColor={draft.hairColor}
              hairStyle={draft.hairStyle}
              className="h-[300px] w-full sm:h-[360px]"
              showHint
            />
            <div className="mt-3 space-y-1 text-[0.625rem] leading-relaxed text-ink-muted">
              <p>
                {model?.label ?? 'Base model'} · {titleCase(draft.presentation)}
              </p>
              <p>Measurements: {profile?.measurements ? 'applied' : 'not provided — population averages'}</p>
              <p>
                {preview.isFetching ? 'Updating preview…' : adjustmentSummary(draft.adjustments)}
              </p>
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
            Step {step + 1} of {STEPS.length}
          </p>
          <div className="flex gap-2">
            {step > 0 && step < 6 && (
              <Button variant="ghost" onClick={() => setStep((current) => current - 1)}>
                Back
              </Button>
            )}
            {step < 5 && <Button onClick={next}>Continue</Button>}
            {step === 5 && (
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!stepValid()}>
                {avatar ? 'Save changes' : 'Create avatar'}
              </Button>
            )}
            {step === 6 && <Button onClick={onSaved}>Done</Button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function PhotoThumb({ asset }: { asset: MediaAsset }) {
  const { url } = useMediaUrl(`/api/v1/media/${asset.id}/content?thumbnail=true`)
  return (
    <figure className="w-20">
      <div className="aspect-[3/4] overflow-hidden border border-line bg-sand">
        {url ? (
          <img src={url} alt={`${photoViewLabel(asset.photo_view)} reference`} className="size-full object-cover" />
        ) : (
          <div className="skeleton size-full" />
        )}
      </div>
      <figcaption className="mt-1 text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
        {photoViewLabel(asset.photo_view)}
      </figcaption>
    </figure>
  )
}
