import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { AvatarScene } from '@/components/three/AvatarScene'
import { Button } from '@/components/ui/Button'
import { Checkbox, Input, Select } from '@/components/ui/Field'
import { ColorField } from '@/components/ui/ColorField'
import { Modal } from '@/components/ui/Modal'
import { Badge, ErrorState, LoadingBlock, Notice, Progress, StatTile } from '@/components/ui/Primitives'
import { cmToInches, formatBytes, formatDate, inchesToCm, titleCase } from '@/lib/format'
import type {
  Avatar,
  MediaAsset,
  MeasurementInput,
  PaletteColor,
  PhotoMetrics,
  Profile,
  SizeRecommendation,
} from '@/lib/types'

type Unit = 'metric' | 'imperial'

const measurementFields = [
  { key: 'bust_cm', label: 'Bust / chest' },
  { key: 'underbust_cm', label: 'Underbust' },
  { key: 'waist_cm', label: 'Waist' },
  { key: 'hips_cm', label: 'Hips' },
  { key: 'shoulder_cm', label: 'Shoulder width' },
  { key: 'neck_cm', label: 'Neck' },
  { key: 'sleeve_cm', label: 'Sleeve length' },
  { key: 'inseam_cm', label: 'Inseam' },
  { key: 'thigh_cm', label: 'Thigh' },
  { key: 'calf_cm', label: 'Calf' },
] as const

function toValue(value: number | null | undefined, unit: Unit): string {
  if (value === null || value === undefined) return ''
  return unit === 'metric' ? String(value) : String(cmToInches(value))
}

function fromValue(value: string, unit: Unit): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return unit === 'metric' ? parsed : inchesToCm(parsed)
}

export function ProfilePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, refreshUser, logout } = useAuthStore()

  const [unit, setUnit] = useState<Unit>('metric')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [styleGender, setStyleGender] = useState<'womenswear' | 'menswear' | 'unisex'>('womenswear')
  const [preferredSizes, setPreferredSizes] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [skinTone, setSkinTone] = useState('#c99a76')
  const [hairColor, setHairColor] = useState('#241c18')
  const [hairStyle, setHairStyle] = useState('short')
  const [chartOpen, setChartOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [newAvatarName, setNewAvatarName] = useState('Editorial avatar')
  const [newAvatarPreset, setNewAvatarPreset] = useState('editorial')
  const [newAvatarPresentation, setNewAvatarPresentation] = useState<'feminine' | 'masculine' | 'neutral'>('feminine')
  const [analysisAsset, setAnalysisAsset] = useState<MediaAsset | null>(null)
  const [metrics, setMetrics] = useState<PhotoMetrics | null>(null)
  const [palette, setPalette] = useState<PaletteColor[]>([])
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const profileQuery = useQuery<Profile>({ queryKey: qk.profile, queryFn: fetchers.profile })
  const avatarsQuery = useQuery<Avatar[]>({ queryKey: qk.avatars, queryFn: fetchers.avatars })
  const mediaQuery = useQuery({ queryKey: qk.media, queryFn: fetchers.media })
  const chartQuery = useQuery({
    queryKey: ['size-chart', styleGender],
    queryFn: () => api.get<{ rows: Record<string, string | number[]>[] }>(`/profile/size-chart?gender_style=${styleGender}`),
    enabled: chartOpen,
    staleTime: 300_000,
  })

  useEffect(() => {
    const profile = profileQuery.data
    if (!profile) return
    setHeight(profile.height_cm ? String(profile.height_cm) : '')
    setWeight(profile.weight_kg ? String(profile.weight_kg) : '')
    setAge(profile.age ? String(profile.age) : '')
    setStyleGender(profile.style_gender)
    setPreferredSizes(profile.preferred_sizes ?? '')
    setDisplayName(profile.display_name ?? '')
    setCity(profile.city ?? '')
    setCountry(profile.country ?? '')
    setSkinTone(profile.skin_tone ?? '#c99a76')
    setHairColor(profile.hair_color ?? '#241c18')
    setHairStyle(profile.hair_style ?? 'short')
    const measurements = profile.measurements
    setDraft(
      Object.fromEntries(
        measurementFields.map((field) => [
          field.key,
          measurements ? toValue(measurements[field.key as keyof typeof measurements] as number | null, unit) : '',
        ]),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data])

  const recommendation: SizeRecommendation | null | undefined = profileQuery.data?.size_recommendation
  const primaryAvatar = avatarsQuery.data?.find((avatar) => avatar.is_primary) ?? avatarsQuery.data?.[0]

  const switchUnit = (next: Unit) => {
    if (next === unit) return
    setDraft((current) => {
      const converted: Record<string, string> = {}
      Object.entries(current).forEach(([key, value]) => {
        const numeric = Number(value)
        if (!value || !Number.isFinite(numeric)) {
          converted[key] = value
          return
        }
        converted[key] = next === 'imperial' ? String(cmToInches(numeric)) : String(inchesToCm(numeric))
      })
      return converted
    })
    if (height) {
      const numeric = Number(height)
      setHeight(String(next === 'imperial' ? cmToInches(numeric) : inchesToCm(numeric)))
    }
    if (weight) {
      const numeric = Number(weight)
      setWeight(String(next === 'imperial' ? Math.round(numeric * 2.20462) : Math.round(numeric / 2.20462)))
    }
    setUnit(next)
  }

  const saveProfile = useMutation({
    mutationFn: async () => {
      const heightCm = unit === 'metric' ? Number(height) : inchesToCm(Number(height))
      const weightKg = unit === 'metric' ? Number(weight) : Number(weight) / 2.20462
      await api.put('/profile', {
        display_name: displayName || null,
        style_gender: styleGender,
        height_cm: height ? Math.round(heightCm * 10) / 10 : null,
        weight_kg: weight ? Math.round(weightKg * 10) / 10 : null,
        age: age ? Number(age) : null,
        preferred_sizes: preferredSizes || null,
        city: city || null,
        country: country || null,
        skin_tone: skinTone,
        hair_color: hairColor,
        hair_style: hairStyle,
      })
      const measurements: MeasurementInput = { unit_system: 'metric' }
      measurementFields.forEach((field) => {
        measurements[field.key] = fromValue(draft[field.key] ?? '', unit)
      })
      await api.put('/profile/measurements', measurements)
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.profile })
      refreshUser()
      toast.success('Profile saved', 'Measurements and preferences updated.')
    },
    onError: (error) =>
      toast.error('Could not save the profile', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const createAvatar = useMutation({
    mutationFn: () =>
      api.post<Avatar>('/avatars', {
        name: newAvatarName,
        preset: newAvatarPreset,
        gender_presentation: newAvatarPresentation,
        skin_tone: skinTone,
        hair_color: hairColor,
        hair_style: hairStyle,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.avatars })
      setAvatarModalOpen(false)
      toast.success('Avatar created', 'Open the fitting room to dress it.')
    },
    onError: (error) =>
      toast.error('Could not create the avatar', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const setPrimary = useMutation({
    mutationFn: (avatar: Avatar) =>
      Promise.all(
        (avatarsQuery.data ?? [])
          .filter((item) => item.id !== avatar.id && item.is_primary)
          .map((item) => api.patch(`/avatars/${item.id}`, { is_primary: false })),
      ).then(() => api.patch<Avatar>(`/avatars/${avatar.id}`, { is_primary: true })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.avatars }),
  })

  const refreshAvatar = useMutation({
    mutationFn: (avatarId: string) => api.post<Avatar>(`/avatars/${avatarId}/refresh`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.avatars })
      toast.success('Avatar re-derived', 'Proportions now match your latest measurements.')
    },
  })

  const uploadPhoto = useMutation({
    mutationFn: (file: File) => api.upload<MediaAsset>('/media/upload', file, { kind: 'photo' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.media })
      toast.success('Photo uploaded', 'It stays private to your account.')
    },
    onError: (error) =>
      toast.error('Upload failed', error instanceof ApiError ? error.message : 'Check the file format.'),
  })

  const deleteMedia = useMutation({
    mutationFn: (assetId: string) => api.delete(`/media/${assetId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.media })
      toast.success('File deleted')
    },
  })

  const analysePhoto = async (asset: MediaAsset) => {
    setAnalysisAsset(asset)
    setMetrics(null)
    setPalette([])
    try {
      const [analysis, paletteResponse] = await Promise.all([
        api.post<{ metrics: PhotoMetrics }>(`/media/${asset.id}/analyze`),
        api.get<{ palette: PaletteColor[] }>(`/media/${asset.id}/palette`),
      ])
      setMetrics(analysis.metrics)
      setPalette(paletteResponse.palette)
    } catch (error) {
      toast.error('Analysis failed', error instanceof ApiError ? error.message : 'Try another image.')
    }
  }

  const changePassword = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      }),
    onSuccess: async () => {
      setCurrentPassword('')
      setNewPassword('')
      toast.success('Password updated', 'All other sessions were signed out.')
      await logout()
      navigate('/login')
    },
    onError: (error) =>
      toast.error('Password not changed', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const deleteAccount = useMutation({
    mutationFn: () =>
      api.deleteWithBody('/auth/account', {
        password: deletePassword,
        confirmation: deleteConfirm,
      }),
    onSuccess: async () => {
      setDeleteOpen(false)
      await logout()
      navigate('/')
    },
    onError: (error) =>
      toast.error('Account not deleted', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const performDelete = () => deleteAccount.mutate()

  const photos = useMemo(
    () => (mediaQuery.data?.items ?? []).filter((asset) => asset.kind === 'photo'),
    [mediaQuery.data],
  )

  if (profileQuery.isLoading) {
    return (
      <div className="shell py-12">
        <LoadingBlock label="Loading profile" rows={5} />
      </div>
    )
  }

  if (profileQuery.isError) {
    return (
      <div className="shell py-12">
        <ErrorState title="Profile unavailable" onRetry={() => profileQuery.refetch()} />
      </div>
    )
  }

  return (
    <div className="shell space-y-10 py-10">
      <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Profile</p>
          <h1 className="display-lg mt-1">{user?.full_name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {user?.email} · member since {formatDate(user?.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={user?.role === 'admin' ? 'ink' : 'neutral'}>{titleCase(user?.role ?? 'user')}</Badge>
          <Badge tone="neutral">{titleCase(styleGender)}</Badge>
          {user?.onboarded_at && <Badge tone="olive">Onboarded</Badge>}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        {/* avatar + sizing ------------------------------------------------- */}
        <div className="space-y-6">
          <section className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="label-xs">Primary avatar</p>
                <p className="font-display text-lg">{primaryAvatar?.name ?? 'Not created'}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAvatarModalOpen(true)}>
                New
              </Button>
            </div>
            <AvatarScene
              parameters={primaryAvatar?.parameters ?? null}
              skinTone={primaryAvatar?.skin_tone ?? skinTone}
              hairColor={primaryAvatar?.hair_color ?? hairColor}
              hairStyle={primaryAvatar?.hair_style ?? hairStyle}
              className="aspect-[4/5] w-full"
            />
            {primaryAvatar && (
              <div className="space-y-3 border-t border-line p-4">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="label-xs">Height</p>
                    <p className="mt-0.5">{primaryAvatar.parameters.height_m.toFixed(2)} m</p>
                  </div>
                  <div>
                    <p className="label-xs">Shoulder</p>
                    <p className="mt-0.5">{(primaryAvatar.parameters.shoulder_width * 100).toFixed(0)} cm</p>
                  </div>
                  <div>
                    <p className="label-xs">Inseam</p>
                    <p className="mt-0.5">{(primaryAvatar.parameters.leg_length * 100).toFixed(0)} cm</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => refreshAvatar.mutate(primaryAvatar.id)} loading={refreshAvatar.isPending}>
                    Re-derive from measurements
                  </Button>
                </div>
                {avatarsQuery.data && avatarsQuery.data.length > 1 && (
                  <div className="space-y-1 border-t border-line pt-2">
                    <p className="label-xs">All avatars</p>
                    {avatarsQuery.data.map((avatar) => (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => setPrimary.mutate(avatar)}
                        className="flex w-full items-center justify-between text-xs hover:text-clay"
                      >
                        <span>{avatar.name}</span>
                        <span className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                          {avatar.is_primary ? 'Primary' : 'Make primary'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="border border-line bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-xs">Size recommendation</p>
                <p className="mt-1 font-display text-2xl">
                  {recommendation?.size ? `${recommendation.size.label}` : 'Not enough data'}
                </p>
                {recommendation?.size && (
                  <p className="text-xs text-ink-muted">
                    EU {recommendation.size.eu} · UK {recommendation.size.uk} · US {recommendation.size.us}
                  </p>
                )}
              </div>
              <Badge tone={recommendation?.confidence === 'high' ? 'olive' : recommendation?.confidence === 'none' ? 'neutral' : 'gold'}>
                {recommendation?.confidence ?? 'none'} confidence
              </Badge>
            </div>
            {recommendation?.notes?.map((note) => (
              <p key={note} className="mt-2 text-xs leading-relaxed text-ink-muted">
                · {note}
              </p>
            ))}
            <button
              type="button"
              onClick={() => setChartOpen(true)}
              className="mt-3 border-b border-ink text-[0.625rem] uppercase tracking-[0.12em]"
            >
              View size chart
            </button>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Photos" value={photos.length} hint="private references" />
            <StatTile
              label="Storage"
              value={formatBytes(mediaQuery.data?.storage_used_bytes ?? 0)}
              hint={`of ${formatBytes(mediaQuery.data?.storage_limit_bytes ?? 0)}`}
            />
          </div>

          <Progress
            value={mediaQuery.data?.storage_used_bytes ?? 0}
            max={mediaQuery.data?.storage_limit_bytes ?? 1}
            label="Upload quota"
          />
        </div>

        {/* form ------------------------------------------------------------ */}
        <div className="space-y-8">
          <section className="border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Measurements & body</h2>
              <div className="flex border border-line text-[0.625rem] uppercase tracking-[0.12em]">
                {(['metric', 'imperial'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => switchUnit(option)}
                    className={`px-2.5 py-1.5 ${unit === option ? 'bg-ink text-paper' : 'text-ink-muted'}`}
                    aria-pressed={unit === option}
                  >
                    {option === 'metric' ? 'cm / kg' : 'in / lb'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Input
                label="Height"
                type="number"
                step="0.5"
                suffix={unit === 'metric' ? 'cm' : 'in'}
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
              <Input
                label="Weight"
                type="number"
                step="0.5"
                suffix={unit === 'metric' ? 'kg' : 'lb'}
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
              <Input
                label="Age"
                type="number"
                value={age}
                onChange={(event) => setAge(event.target.value)}
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Select
                label="Catalogue focus"
                value={styleGender}
                onChange={(event) => setStyleGender(event.target.value as typeof styleGender)}
                options={[
                  { value: 'womenswear', label: 'Womenswear' },
                  { value: 'menswear', label: 'Menswear' },
                  { value: 'unisex', label: 'Both' },
                ]}
              />
              <Input label="Usual size" value={preferredSizes} onChange={(event) => setPreferredSizes(event.target.value)} placeholder="M / 38 EU" />
              <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </div>

            <div className="mt-6 border-t border-line pt-4">
              <p className="label-xs mb-3">Circumferences & lengths</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {measurementFields.map((field) => (
                  <Input
                    key={field.key}
                    label={field.label}
                    type="number"
                    step="0.5"
                    suffix={unit === 'metric' ? 'cm' : 'in'}
                    value={draft[field.key] ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                ))}
                <Input
                  label="Shoe size"
                  type="number"
                  step="0.5"
                  suffix="EU"
                  value={draft.shoe_size_eu ?? ''}
                  onChange={(event) => setDraft((current) => ({ ...current, shoe_size_eu: event.target.value }))}
                />
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Values are stored in centimetres. Imperial input is converted; the API remains metric.
              </p>
            </div>

            <div className="mt-6 border-t border-line pt-4">
              <p className="label-xs mb-3">Appearance</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField
                  label="Skin tone"
                  value={skinTone}
                  onChange={setSkinTone}
                  swatches={['#f3d3b5', '#e3b48c', '#c99a76', '#a9744f', '#7d5138', '#4f3324', '#33201a']}
                />
                <ColorField
                  label="Hair colour"
                  value={hairColor}
                  onChange={setHairColor}
                  swatches={['#241c18', '#4a3125', '#8a5a3b', '#c9a06a', '#d9c9b4', '#7d1f2e', '#3a3f4a']}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Select
                  label="Hair style"
                  value={hairStyle}
                  onChange={(event) => setHairStyle(event.target.value)}
                  options={['short', 'long', 'bun', 'braid', 'curly', 'bald'].map((value) => ({
                    value,
                    label: titleCase(value),
                  }))}
                />
                <Input label="City" value={city} onChange={(event) => setCity(event.target.value)} />
                <Input label="Country" value={country} onChange={(event) => setCountry(event.target.value)} />
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
                Save measurements
              </Button>
            </div>
          </section>

          <section className="border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl">Reference photos</h2>
                <p className="text-xs text-ink-muted">
                  Private to your account. Analysis measures pixels, not your body.
                </p>
              </div>
              <label className="cursor-pointer border border-line px-3 py-2 text-[0.625rem] uppercase tracking-[0.1em] hover:border-ink">
                {uploadPhoto.isPending ? 'Uploading…' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) uploadPhoto.mutate(file)
                  }}
                />
              </label>
            </div>

            {photos.length === 0 ? (
              <p className="mt-4 border border-dashed border-line px-4 py-6 text-center text-xs text-ink-muted">
                No photos uploaded. A full-body photo in soft daylight gives the most useful framing
                feedback.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((asset) => (
                  <PhotoCard
                    key={asset.id}
                    asset={asset}
                    onAnalyse={() => analysePhoto(asset)}
                    onDelete={() => deleteMedia.mutate(asset.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="border border-line bg-paper p-5">
            <h2 className="font-display text-xl">Security</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-muted">Changing the password signs out every other session.</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => changePassword.mutate()}
                loading={changePassword.isPending}
                disabled={!currentPassword || newPassword.length < 10}
              >
                Update password
              </Button>
            </div>

            <div className="mt-6 border-t border-line pt-4">
              <p className="label-xs">Danger zone</p>
              <p className="mt-1 text-xs text-ink-muted">
                Deleting the account removes your measurements, avatars, designs, outfits, uploads
                and requests. This cannot be undone.
              </p>
              <Button size="sm" variant="danger" className="mt-3" onClick={() => setDeleteOpen(true)}>
                Delete account
              </Button>
            </div>
          </section>
        </div>
      </div>

      {/* modals -------------------------------------------------------------- */}
      <Modal
        open={chartOpen}
        onClose={() => setChartOpen(false)}
        title="Standard size chart"
        description="Rule-based reference used for recommendations. Measurements in centimetres."
        size="lg"
      >
        {chartQuery.isLoading && <LoadingBlock label="Loading chart" />}
        {chartQuery.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">EU</th>
                  <th className="py-2 pr-3">UK</th>
                  <th className="py-2 pr-3">US</th>
                  <th className="py-2">Bust / waist / hips</th>
                </tr>
              </thead>
              <tbody>
                {chartQuery.data.rows.map((row) => {
                  const band = (key: string) => {
                    const value = row[key]
                    return Array.isArray(value) ? `${value[0]}–${value[1]}` : String(value)
                  }
                  return (
                    <tr key={String(row.label)} className="border-b border-line/60">
                      <td className="py-2 pr-3 font-medium">{String(row.label)}</td>
                      <td className="py-2 pr-3">{String(row.eu)}</td>
                      <td className="py-2 pr-3">{String(row.uk)}</td>
                      <td className="py-2 pr-3">{String(row.us)}</td>
                      <td className="py-2 text-xs text-ink-muted">
                        {band('bust_cm')} / {band('waist_cm')} / {band('hips_cm')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(analysisAsset)}
        onClose={() => setAnalysisAsset(null)}
        title="Photo analysis"
        description="Computed locally with OpenCV. These are pixel metrics, not body measurements."
        footer={
          <Button variant="ghost" onClick={() => setAnalysisAsset(null)}>
            Close
          </Button>
        }
      >
        {!metrics ? (
          <LoadingBlock label="Analysing photo" rows={2} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <p className="font-display text-3xl">{metrics.score}</p>
              <div>
                <p className="text-sm">Framing score</p>
                <p className="text-xs text-ink-muted">
                  {metrics.width}×{metrics.height} · {metrics.orientation} · sharpness {metrics.sharpness}
                </p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {metrics.checks.map((check) => (
                <li key={check.name} className="flex items-start gap-2 text-xs">
                  <span className={check.passed ? 'text-olive' : 'text-danger'}>{check.passed ? '✓' : '×'}</span>
                  <span className={check.passed ? 'text-ink-muted' : ''}>{check.message}</span>
                </li>
              ))}
            </ul>
            {palette.length > 0 && (
              <div>
                <p className="label-xs mb-2">Dominant colours</p>
                <div className="flex gap-2">
                  {palette.map((colour) => (
                    <div key={colour.hex} className="flex-1">
                      <div className="h-8 border border-line" style={{ backgroundColor: colour.hex }} />
                      <p className="mt-1 font-mono text-[0.5625rem] text-ink-muted">{colour.hex}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Notice tone="info">{metrics.disclaimer}</Notice>
          </div>
        )}
      </Modal>

      <Modal
        open={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        title="Create an avatar"
        description="Avatars use your latest measurements. Up to five per account."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAvatarModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createAvatar.mutate()} loading={createAvatar.isPending}>
              Create avatar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={newAvatarName} onChange={(event) => setNewAvatarName(event.target.value)} />
          <Select
            label="Direction"
            value={newAvatarPreset}
            onChange={(event) => setNewAvatarPreset(event.target.value)}
            options={[
              { value: 'editorial', label: 'Editorial' },
              { value: 'tailoring', label: 'Tailoring' },
              { value: 'minimal', label: 'Minimal' },
              { value: 'runway', label: 'Runway' },
            ]}
          />
          <Select
            label="Presentation"
            value={newAvatarPresentation}
            onChange={(event) => setNewAvatarPresentation(event.target.value as typeof newAvatarPresentation)}
            options={[
              { value: 'feminine', label: 'Feminine' },
              { value: 'masculine', label: 'Masculine' },
              { value: 'neutral', label: 'Neutral' },
            ]}
          />
          <Notice tone="info">
            Skin tone and hair are taken from the appearance section above. Save the profile first if
            you changed them.
          </Notice>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account"
        description="This permanently removes your data. Type DELETE to confirm."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              disabled={!deletePassword || deleteConfirm !== 'DELETE'}
              onClick={performDelete}
              loading={deleteAccount.isPending}
            >
              Permanently delete
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Password"
            type="password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
          />
          <Input
            label="Type DELETE"
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
          />
          <Checkbox
            label="I understand this cannot be undone"
            checked={deleteConfirm === 'DELETE'}
            onChange={() => undefined}
          />
        </div>
      </Modal>
    </div>
  )
}

function PhotoCard({
  asset,
  onAnalyse,
  onDelete,
}: {
  asset: MediaAsset
  onAnalyse: () => void
  onDelete: () => void
}) {
  const { url } = useMediaUrl(asset.thumbnail_url ?? `/api/v1/media/${asset.id}/content?thumbnail=true`)
  return (
    <div className="border border-line bg-bone">
      <div className="aspect-[3/4] overflow-hidden bg-sand">
        {url ? (
          <img src={url} alt={asset.original_filename} className="size-full object-cover" />
        ) : (
          <div className="skeleton size-full" />
        )}
      </div>
      <div className="space-y-2 border-t border-line bg-paper p-2">
        <p className="truncate text-[0.625rem] text-ink-muted">{asset.original_filename}</p>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onAnalyse} className="text-[0.5625rem] uppercase tracking-[0.1em] hover:text-clay">
            Analyse
          </button>
          <button type="button" onClick={onDelete} className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-danger">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
