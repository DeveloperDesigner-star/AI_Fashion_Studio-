import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { toast } from '@/stores/toastStore'
import { FittingRoomViewport } from '@/components/fitting/FittingRoomViewport'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { CompareSlider } from '@/components/tryon/CompareSlider'
import { Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui/Primitives'
import { Button, LinkButton } from '@/components/ui/Button'
import { Checkbox, Select } from '@/components/ui/Field'
import { FALLBACK_AVATAR } from '@/lib/avatarDefaults'
import { lookFromItems, proportionPlan, rigForAvatar, type FittingLook } from '@/lib/fittingRoom'
import { renderStagePng } from '@/lib/stageExport'
import {
  ACCESSORY_SLOTS,
  AI_SUPPORTED_SLOTS,
  baseLookForComparison,
  supportsAi,
} from '@/lib/tryOn'
import { SLOT_LABELS, cn, formatPrice, titleCase } from '@/lib/format'
import type {
  Avatar,
  Design,
  Garment,
  MediaAsset,
  Profile,
  TryOnCapabilities,
  TryOnList,
  TryOnSession,
  TryOnSessionCreate,
} from '@/lib/types'
import type { FittingItem } from '@/stores/studioStore'

type Mode = 'photo' | 'avatar'

interface PhotoChoice {
  id: string
  url: string
}

interface SelectedPiece {
  garment: Garment
  designId: string | null
  designName: string | null
  size: string | null
  fabric: string
  color: string
  colorTouched: boolean
  fabricTouched: boolean
  components: Record<string, Design['components'][string]>
}

interface AccessoryChoice {
  garment: Garment
  size: string | null
  designId: string | null
  components: Record<string, Design['components'][string]>
}

const MAIN_SLOTS = [...AI_SUPPORTED_SLOTS]
const ACCESSORY_SLOT_ORDER = [...ACCESSORY_SLOTS]
const FALLBACK_FABRICS = [
  'cotton',
  'linen',
  'silk',
  'wool',
  'denim',
  'satin',
  'chiffon',
  'velvet',
  'leather',
  'organza',
]

function isAccessory(slot: string): boolean {
  return (ACCESSORY_SLOTS as readonly string[]).includes(slot)
}

function statusTone(status: string): 'neutral' | 'olive' | 'gold' | 'danger' {
  if (status === 'ready') return 'olive'
  if (status === 'unavailable') return 'gold'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

function statusLabel(status: string): string {
  if (status === 'ready') return 'Saved preview'
  if (status === 'unavailable') return 'AI unavailable'
  if (status === 'failed') return 'Generation failed'
  return 'Look saved'
}

function PreviewImage({
  path,
  alt,
  className,
}: {
  path: string | null
  alt: string
  className?: string
}) {
  const image = useMediaUrl(path)
  if (image.loading) return <Skeleton className={cn('aspect-[4/5] w-full', className)} />
  if (!image.url) {
    return (
      <div className={cn('flex aspect-[4/5] items-center justify-center border border-line bg-bone p-4 text-center text-xs text-ink-muted', className)}>
        This private preview could not be loaded.
      </div>
    )
  }
  return <img src={image.url} alt={alt} className={cn('h-full w-full object-cover', className)} />
}

function CapabilitiesPanel({ capabilities }: { capabilities: TryOnCapabilities }) {
  return (
    <section
      className={cn(
        'border p-4',
        capabilities.available ? 'border-olive/30 bg-olive/5' : 'border-gold/40 bg-gold/8',
      )}
      aria-live="polite"
      data-testid={capabilities.available ? 'tryon-ready' : 'tryon-unavailable'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-xs">{capabilities.available ? 'AI preview ready' : 'AI preview unavailable'}</p>
        <Badge tone={capabilities.available ? 'olive' : 'gold'}>
          {capabilities.available ? 'GPU worker connected' : 'No fabricated result'}
        </Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{capabilities.reason}</p>
      <ul className="mt-3 space-y-1.5">
        {capabilities.checks.map((check) => (
          <li key={check.id} className="flex gap-2 text-xs leading-relaxed">
            <span className={check.ok ? 'text-olive' : 'text-danger'} aria-hidden="true">
              {check.ok ? '✓' : '✕'}
            </span>
            <span>
              <span className="font-medium">{check.label}.</span>{' '}
              <span className="text-ink-muted">{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line/70 pt-2 text-[0.625rem] leading-relaxed text-ink-muted">
        {capabilities.model.name} · {capabilities.model.license} ·{' '}
        <a
          href={capabilities.model.license_url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          licence
        </a>{' '}
        ·{' '}
        <a
          href={capabilities.model.repository}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          source
        </a>
      </p>
      <details className="mt-2 text-xs text-ink-muted">
        <summary className="cursor-pointer text-[0.625rem] uppercase tracking-[0.12em]">
          Requirements & limitations
        </summary>
        <ul className="mt-2 space-y-1.5 leading-relaxed">
          {capabilities.model.requirements.map((requirement) => (
            <li key={requirement}>• {requirement}</li>
          ))}
          {capabilities.model.limitations.map((limitation) => (
            <li key={limitation}>• {limitation}</li>
          ))}
        </ul>
        <p className="mt-2">{capabilities.disclaimer}</p>
      </details>
    </section>
  )
}

function SavedSessionCard({
  session,
  onOpen,
  onDelete,
  deleting,
  active,
}: {
  session: TryOnSession
  onOpen: () => void
  onDelete: () => void
  deleting: boolean
  active: boolean
}) {
  const thumb = session.result_thumbnail_url ?? session.preview_thumbnail_url
  return (
    <article
      className={cn(
        'group flex gap-3 border bg-paper p-2.5 transition-colors',
        active ? 'border-ink' : 'border-line hover:border-ink/60',
      )}
    >
      <button type="button" onClick={onOpen} className="w-20 shrink-0 text-left">
        <div className="flex aspect-[4/5] items-center justify-center overflow-hidden bg-bone">
          {thumb ? (
            <PreviewImage path={thumb} alt="" />
          ) : (
            <span className="p-2 text-center text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
              No image
            </span>
          )}
        </div>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 text-left">
            <p className="truncate text-sm">{session.name}</p>
            <p className="mt-0.5 text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">
              {session.mode === 'photo' ? 'Photo · AI' : 'Avatar · 3D'} ·{' '}
              {new Date(session.created_at).toLocaleDateString()}
            </p>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`Delete ${session.name}`}
            className="text-ink-muted hover:text-danger disabled:opacity-40"
          >
            <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(session.status)}>{statusLabel(session.status)}</Badge>
          <Badge tone="neutral">{session.items.length} pcs</Badge>
          {session.approximate ? <Badge tone="gold">Approx.</Badge> : null}
        </div>
        {session.status === 'unavailable' ? (
          <p className="mt-2 line-clamp-2 text-[0.625rem] leading-relaxed text-ink-muted">
            {session.error ?? 'No AI preview was generated.'}
          </p>
        ) : null}
      </div>
    </article>
  )
}

export function TryOnPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('avatar')
  const [photo, setPhoto] = useState<PhotoChoice | null>(null)
  const [consent, setConsent] = useState(false)
  const [avatarId, setAvatarId] = useState<string | null>(null)
  const [mainSlot, setMainSlot] = useState<string>('dress')
  const [mainGarmentId, setMainGarmentId] = useState<string | null>(null)
  const [mainDesignId, setMainDesignId] = useState('')
  const [size, setSize] = useState<string | null>(null)
  const [fabric, setFabric] = useState('cotton')
  const [color, setColor] = useState('#1f1d1a')
  const [colorTouched, setColorTouched] = useState(false)
  const [fabricTouched, setFabricTouched] = useState(false)
  const [accessories, setAccessories] = useState<Record<string, AccessoryChoice>>({})
  const [accessorySlot, setAccessorySlot] = useState<string>('footwear')
  const [session, setSession] = useState<TryOnSession | null>(null)
  const [sessionSignature, setSessionSignature] = useState<string | null>(null)
  const [compareBase, setCompareBase] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving3d, setSaving3d] = useState(false)
  const [generating, setGenerating] = useState(false)
  const captureRef = useRef<(() => string | null) | null>(null)
  const artRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const handleCaptureReady = useCallback((capture: (() => string | null) | null) => {
    captureRef.current = capture
  }, [])

  const garmentsQuery = useQuery({
    queryKey: qk.garments({ page_size: 60, sort: 'featured', try_on: true }),
    queryFn: () => fetchers.garments({ page_size: 60, sort: 'featured' }),
  })
  const designsQuery = useQuery({
    queryKey: qk.designs({ limit: 100 }),
    queryFn: () => fetchers.designs({ limit: 100 }),
  })
  const designLibraryQuery = useQuery({
    queryKey: qk.designLibrary,
    queryFn: fetchers.designLibrary,
  })
  const avatarsQuery = useQuery<Avatar[]>({ queryKey: qk.avatars, queryFn: fetchers.avatars })
  const profileQuery = useQuery<Profile>({ queryKey: qk.profile, queryFn: fetchers.profile })
  const capabilitiesQuery = useQuery<TryOnCapabilities>({
    queryKey: qk.tryOnCapabilities,
    queryFn: fetchers.tryOnCapabilities,
  })
  const sessionsQuery = useQuery<TryOnList>({
    queryKey: qk.tryOnSessions,
    queryFn: fetchers.tryOnSessions,
  })

  const styleGender = profileQuery.data?.style_gender ?? 'womenswear'
  const avatars = useMemo(() => avatarsQuery.data ?? [], [avatarsQuery.data])
  const avatar =
    avatars.find((item) => item.id === avatarId) ??
    avatars.find((item) => item.is_primary) ??
    avatars[0]
  const garments = useMemo(
    () =>
      (garmentsQuery.data?.items ?? []).filter(
        (garment) =>
          garment.is_active &&
          (garment.gender === styleGender || garment.gender === 'unisex'),
      ),
    [garmentsQuery.data, styleGender],
  )
  const mainGarments = useMemo(
    () => garments.filter((garment) => MAIN_SLOTS.includes(garment.slot as (typeof MAIN_SLOTS)[number])),
    [garments],
  )
  const accessoryGarments = useMemo(
    () => garments.filter((garment) => isAccessory(garment.slot)),
    [garments],
  )
  const mainGarment = garments.find((garment) => garment.id === mainGarmentId) ?? null
  const designsForMain = useMemo(
    () => (designsQuery.data?.items ?? []).filter((design) => design.garment_id === mainGarmentId),
    [designsQuery.data, mainGarmentId],
  )
  const mainDesign = designsForMain.find((design) => design.id === mainDesignId) ?? null
  const accessoryChoice = accessories[accessorySlot] ?? null
  const designsForAccessory = useMemo(
    () =>
      (designsQuery.data?.items ?? []).filter(
        (design) => design.garment_id === accessoryChoice?.garment.id,
      ),
    [accessoryChoice?.garment.id, designsQuery.data],
  )
  const fabricOptions = (
    designLibraryQuery.data?.fabrics?.length ? designLibraryQuery.data.fabrics : FALLBACK_FABRICS
  ).map((value) => ({ value, label: titleCase(value) }))

  useEffect(() => {
    if (mainGarmentId && mainGarments.some((garment) => garment.id === mainGarmentId)) return
    const first =
      mainGarments.find((garment) => garment.slot === mainSlot) ?? mainGarments[0] ?? null
    if (first) {
      setMainGarmentId(first.id)
      // Keep the slot tabs honest when the catalog has no piece in the
      // previously selected slot (e.g. menswear profile with no dress).
      setMainSlot(first.slot)
    }
  }, [mainGarmentId, mainGarments, mainSlot])

  useEffect(() => {
    if (!mainGarment) return
    setSize((current) =>
      current && mainGarment.sizes.includes(current)
        ? current
        : mainGarment.sizes[1] ?? mainGarment.sizes[0] ?? null,
    )
    setFabric((current) => current || mainGarment.default_fabric || 'cotton')
    setColor((current) => current || mainGarment.default_color || '#1f1d1a')
  }, [mainGarment])

  useEffect(() => {
    if (!avatarId && avatars.length > 0) setAvatarId(avatars.find((entry) => entry.is_primary)?.id ?? avatars[0].id)
  }, [avatarId, avatars])

  const parameters = avatar?.parameters ?? FALLBACK_AVATAR
  const rig = rigForAvatar(avatar, styleGender)
  const proportions = useMemo(
    () => proportionPlan(parameters, avatar?.adjustments),
    [parameters, avatar?.adjustments],
  )

  const selectedPieces = useMemo<SelectedPiece[]>(() => {
    const pieces: SelectedPiece[] = []
    if (mainGarment) {
      pieces.push({
        garment: mainGarment,
        designId: mainDesignId || null,
        designName: mainDesign?.name ?? null,
        size,
        fabric,
        color,
        colorTouched,
        fabricTouched,
        components: mainDesign?.components ?? {},
      })
    }
    pieces.push(
      ...Object.values(accessories).map((entry) => ({
        garment: entry.garment,
        designId: entry.designId,
        designName:
          (designsQuery.data?.items ?? []).find((design) => design.id === entry.designId)?.name ??
          null,
        size: entry.size,
        components: entry.components,
        fabric: entry.garment.default_fabric,
        color: entry.garment.default_color,
        colorTouched: false,
        fabricTouched: false,
      })),
    )
    return pieces
  }, [
    accessories,
    color,
    colorTouched,
    designsQuery.data,
    fabric,
    fabricTouched,
    mainDesign,
    mainDesignId,
    mainGarment,
    size,
  ])

  const fittingItems = useMemo<FittingItem[]>(
    () =>
      selectedPieces.map((piece) => ({
        key: `${piece.garment.id}:${piece.designId ?? 'base'}`,
        slot: piece.garment.slot,
        garment: piece.garment,
        designId: piece.designId,
        designName: piece.designName,
        components: piece.components,
        colorOverride: piece.colorTouched ? piece.color : null,
        fabricOverride: piece.fabricTouched ? piece.fabric : null,
      })),
    [selectedPieces],
  )

  const customLook = useMemo(() => lookFromItems(fittingItems), [fittingItems])
  const baseLook = useMemo(() => baseLookForComparison(fittingItems), [fittingItems])
  const look: FittingLook = compareBase ? baseLook : customLook
  const totalPrice = selectedPieces.reduce((sum, piece) => sum + piece.garment.base_price_cents, 0)
  const canUseAi = capabilitiesQuery.data?.available === true
  const aiSlot = mainGarment ? supportsAi(mainGarment.slot) : false

  const resetSessionForChange = useCallback(() => {
    setSession(null)
    setSessionSignature(null)
    setCompareBase(false)
  }, [])

  const chooseMain = (garment: Garment) => {
    setMainSlot(garment.slot)
    setMainGarmentId(garment.id)
    setMainDesignId('')
    setSize(garment.sizes[1] ?? garment.sizes[0] ?? null)
    setFabric(garment.default_fabric)
    setColor(garment.default_color)
    setColorTouched(false)
    setFabricTouched(false)
    resetSessionForChange()
  }

  const chooseDesign = (designId: string) => {
    setMainDesignId(designId)
    const design = designsForMain.find((entry) => entry.id === designId)
    setColorTouched(false)
    setFabricTouched(false)
    if (design) {
      const first = Object.values(design.components)[0]
      if (first?.color) setColor(first.color)
      if (first?.fabric) setFabric(first.fabric)
    }
    resetSessionForChange()
  }

  const toggleAccessory = (garment: Garment) => {
    setAccessories((current) => {
      const next = { ...current }
      if (next[garment.slot]?.garment.id === garment.id) delete next[garment.slot]
      else {
        next[garment.slot] = {
          garment,
          size: garment.sizes[0] ?? null,
          designId: null,
          components: {},
        }
      }
      return next
    })
    resetSessionForChange()
  }

  const chooseAccessorySize = (value: string) => {
    setAccessories((current) => {
      const chosen = current[accessorySlot]
      if (!chosen) return current
      return { ...current, [accessorySlot]: { ...chosen, size: value } }
    })
    resetSessionForChange()
  }

  const chooseAccessoryDesign = (value: string) => {
    const design = designsForAccessory.find((entry) => entry.id === value) ?? null
    setAccessories((current) => {
      const chosen = current[accessorySlot]
      if (!chosen) return current
      return {
        ...current,
        [accessorySlot]: {
          ...chosen,
          designId: design?.id ?? null,
          components: design?.components ?? {},
        },
      }
    })
    resetSessionForChange()
  }

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Unsupported file', 'Choose a JPEG, PNG or WebP photo.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Photo too large', 'Use an image under 8 MB.')
      return
    }
    setUploading(true)
    try {
      const asset = await api.upload<MediaAsset>('/media/upload', file, {
        kind: 'photo',
        view: 'full_body',
      })
      if (!asset.url) throw new Error('The photo URL was missing.')
      setPhoto({ id: asset.id, url: asset.url })
      setConsent(false)
      resetSessionForChange()
      toast.success('Photo added', 'Private and processed only for the previews you request.')
    } catch (error) {
      toast.error(
        'Photo upload failed',
        error instanceof ApiError ? error.message : 'Use a portrait, full-body photo.',
      )
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const buildItems = () =>
    selectedPieces.map((piece) => ({
      garment_id: piece.garment.id,
      design_id: piece.designId,
      size: piece.size,
      fabric: piece.fabric,
      color: piece.color,
    }))

  const validateSelection = (): string | null => {
    if (!mainGarment) return 'Choose a main garment first.'
    if (mainGarment.sizes.length > 0 && !size) return 'Choose a size for the main garment.'
    if (mode === 'photo') {
      if (!photo) return 'Upload a full-body photo first.'
      if (!consent) return 'Confirm photo-processing consent first.'
      if (!aiSlot) return 'Photo try-on supports upper, lower and full-body garments. Use avatar mode for accessories.'
    }
    if (mode === 'avatar' && !avatar) return 'Create or choose a saved avatar first.'
    return null
  }

  const buildPayload = (targetMode: Mode): TryOnSessionCreate => ({
    name: `${mainGarment?.name ?? 'Try-on'} · ${targetMode === 'photo' ? 'photo' : '3D'}`,
    mode: targetMode,
    ...(targetMode === 'photo'
      ? { photo_asset_id: photo?.id ?? null, photo_processing_consent: consent }
      : { avatar_id: avatar?.id ?? null }),
    items: buildItems(),
    training_opt_in: false,
  })

  const ensureSession = async (targetMode: Mode): Promise<TryOnSession> => {
    const payload = buildPayload(targetMode)
    const signature = JSON.stringify(payload)
    if (session && sessionSignature === signature) return session
    const created = await api.post<TryOnSession>('/try-on/sessions', payload)
    setSession(created)
    setSessionSignature(signature)
    queryClient.invalidateQueries({ queryKey: qk.tryOnSessions })
    return created
  }

  const saveLook = useMutation({
    mutationFn: async () => {
      const problem = validateSelection()
      if (problem) throw new Error(problem)
      return ensureSession(mode)
    },
    onSuccess: (saved) => {
      toast.success('Try-on saved', saved.mode === 'photo'
        ? 'The look is saved. AI generation still needs a configured GPU worker.'
        : 'Capture the 3D preview to keep a visual record of this look.')
    },
    onError: (error) => {
      toast.error('Could not save this try-on', error instanceof Error ? error.message : 'Try again.')
    },
  })

  const deleteSession = useMutation({
    mutationFn: (id: string) => api.delete(`/try-on/sessions/${id}`),
    onSuccess: (_data, id) => {
      if (session?.id === id) {
        setSession(null)
        setSessionSignature(null)
      }
      queryClient.invalidateQueries({ queryKey: qk.tryOnSessions })
      toast.info('Try-on deleted', 'Its generated preview was removed from private storage.')
    },
    onError: (error) => {
      toast.error('Could not delete the try-on', error instanceof ApiError ? error.message : 'Try again.')
    },
  })

  const handleSave3D = async () => {
    const problem = validateSelection()
    if (problem) {
      toast.error('This 3D preview is not ready', problem)
      return
    }
    setSaving3d(true)
    try {
      const saved = await ensureSession('avatar')
      const capture = captureRef.current?.()
      if (!capture || capture.length < 2000) {
        throw new Error('The 3D canvas is not ready. Wait a moment and try again.')
      }
      const blob = await (await fetch(capture)).blob()
      const file = new File([blob], 'try-on-3d-preview.png', { type: 'image/png' })
      const updated = await api.upload<TryOnSession>(
        `/try-on/sessions/${saved.id}/preview`,
        file,
        {},
      )
      setSession(updated)
      setSessionSignature(JSON.stringify(buildPayload('avatar')))
      queryClient.invalidateQueries({ queryKey: qk.tryOnSessions })
      toast.success('3D preview saved', 'This is an authored sample render, not an AI photo try-on.')
    } catch (error) {
      toast.error(
        '3D snapshot was not saved',
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Try again.',
      )
    } finally {
      setSaving3d(false)
    }
  }

  const handleGenerate = async () => {
    const problem = validateSelection()
    if (problem) {
      toast.error('AI preview is not ready', problem)
      return
    }
    if (!canUseAi) {
      toast.error('No AI preview was generated', capabilitiesQuery.data?.reason ?? 'No GPU worker is configured.')
      return
    }
    setGenerating(true)
    let saved: TryOnSession | null = null
    try {
      saved = await ensureSession('photo')
      const svg = artRef.current?.querySelector('svg')
      if (!svg) throw new Error('The garment artwork is not ready to render.')
      const rendered = await renderStagePng(svg, {
        width: 768,
        height: 960,
        background: '#f7f4ef',
      })
      const garmentFile = new File([rendered.blob], `garment-${mainGarment?.slug ?? 'piece'}.png`, {
        type: 'image/png',
      })
      const garmentAsset = await api.upload<MediaAsset>('/media/upload', garmentFile, {
        kind: 'clothing',
      })
      const updated = await api.post<TryOnSession>(
        `/try-on/sessions/${saved.id}/generate`,
        { garment_asset_id: garmentAsset.id, steps: 50 },
      )
      setSession(updated)
      setSessionSignature(JSON.stringify(buildPayload('photo')))
      queryClient.invalidateQueries({ queryKey: qk.tryOnSessions })
      toast.success('Approximate preview generated', 'Review it as an illustration, not a fit guarantee.')
    } catch (error) {
      if (saved) {
        try {
          const refreshed = await api.get<TryOnSession>(`/try-on/sessions/${saved.id}`)
          setSession(refreshed)
        } catch {
          /* keep the in-memory draft */
        }
      }
      toast.error(
        'No AI preview was generated',
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Try again.',
      )
    } finally {
      setGenerating(false)
    }
  }

  const loadSession = (saved: TryOnSession) => {
    const pieces = saved.items
      .map((item) => {
        const garment = garments.find((entry) => entry.id === item.garment_id) ??
          garments.find((entry) => entry.slug === item.garment_slug)
        return garment ? { item, garment } : null
      })
      .filter((entry): entry is { item: TryOnSession['items'][number]; garment: Garment } => Boolean(entry))
    const main = pieces[0]
    if (!main) {
      toast.error('This try-on references a piece that is no longer in the catalogue.')
      return
    }
    setMode(saved.mode)
    setMainSlot(main.garment.slot)
    setMainGarmentId(main.garment.id)
    setMainDesignId(main.item.design_id ?? '')
    setSize(main.item.size)
    setFabric(main.item.fabric)
    setColor(main.item.color)
    setColorTouched(true)
    setFabricTouched(true)
    const nextAccessories: Record<string, AccessoryChoice> = {}
    for (const entry of pieces.slice(1)) {
      const accessoryDesignEntry = (designsQuery.data?.items ?? []).find(
        (design) => design.id === entry.item.design_id,
      )
      nextAccessories[entry.garment.slot] = {
        garment: entry.garment,
        size: entry.item.size,
        designId: entry.item.design_id,
        components: accessoryDesignEntry?.components ?? {},
      }
    }
    setAccessories(nextAccessories)
    setPhoto(
      saved.mode === 'photo' && saved.photo_asset_id && saved.original_url
        ? { id: saved.photo_asset_id, url: saved.original_url }
        : null,
    )
    setConsent(saved.mode === 'photo')
    setSession(saved)
    setSessionSignature(null)
    setCompareBase(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeSession = session

  const fabricChoices = fabricOptions.some((option) => option.value === fabric)
    ? fabricOptions
    : [{ value: fabric, label: titleCase(fabric) }, ...fabricOptions]

  return (
    <div className="shell py-8">
      <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Virtual try-on</p>
          <h1 className="display-lg mt-1">See the idea before the fitting</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Try a catalogue garment, your saved design and a chosen size, fabric and colour on a
            private photo or your saved 3D avatar. Footwear and accessories attach to the rigged
            avatar; AI previews are approximate.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="gold">Approximate preview</Badge>
          <Badge tone="neutral">No fit guarantee</Badge>
          <Badge tone="neutral">Private by default</Badge>
        </div>
      </header>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <div className="flex gap-1 border border-line bg-paper p-1" role="tablist" aria-label="Try-on source">
            {(['avatar', 'photo'] as Mode[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => {
                  setMode(value)
                  setCompareBase(false)
                  setSession(null)
                  setSessionSignature(null)
                }}
                className={cn(
                  'min-h-9 flex-1 px-3 text-[0.625rem] uppercase tracking-[0.14em] transition-colors',
                  mode === value ? 'bg-ink text-paper' : 'text-ink-muted hover:bg-bone',
                )}
              >
                {value === 'avatar' ? 'Saved avatar · 3D' : 'My photo · AI'}
              </button>
            ))}
          </div>

          {mode === 'avatar' ? (
            avatar ? (
              <div className="space-y-2">
                {avatars.length > 1 ? (
                  <label className="flex items-center justify-between gap-3 border border-line bg-paper px-3 py-2">
                    <span className="text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
                      Saved avatar
                    </span>
                    <select
                      aria-label="Saved avatar"
                      value={avatar.id}
                      onChange={(event) => {
                        setAvatarId(event.target.value)
                        resetSessionForChange()
                      }}
                      className="min-h-8 border border-line bg-paper px-2 py-1 text-xs"
                    >
                      {avatars.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                          {entry.is_primary ? ' · primary' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <FittingRoomViewport
                  rig={rig}
                  look={look}
                  proportions={proportions}
                  skinTone={avatar.skin_tone}
                  hairColor={avatar.hair_color}
                  hairStyle={avatar.hair_style}
                  className="h-[clamp(520px,70vh,760px)] w-full"
                  captureEnabled
                  onCaptureReady={handleCaptureReady}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1 border border-line bg-paper p-1">
                    <button
                      type="button"
                      onClick={() => setCompareBase(false)}
                      aria-pressed={!compareBase}
                      className={cn(
                        'px-3 py-1.5 text-[0.5625rem] uppercase tracking-[0.12em]',
                        !compareBase ? 'bg-ink text-paper' : 'text-ink-muted',
                      )}
                    >
                      Customised
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompareBase(true)}
                      aria-pressed={compareBase}
                      className={cn(
                        'px-3 py-1.5 text-[0.5625rem] uppercase tracking-[0.12em]',
                        compareBase ? 'bg-ink text-paper' : 'text-ink-muted',
                      )}
                      data-testid="compare-base-toggle"
                    >
                      Base look
                    </button>
                  </div>
                  <p className="text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">
                    {look.pieces.length} authored {look.pieces.length === 1 ? 'piece' : 'pieces'} ·{' '}
                    {look.externalFootwear ? 'shoes on foot bones' : 'sample shoes hidden'}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Create an avatar for 3D try-on"
                description="The 3D preview needs a rigged avatar. Photo try-on works with an uploaded photo."
                action={<LinkButton to="/onboarding">Create your avatar</LinkButton>}
              />
            )
          ) : (
            <div className="border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="label-xs">1 · Full-body photo</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    Portrait, clear lighting, one person, full body. Stored privately and processed
                    only for the preview you request.
                  </p>
                </div>
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void uploadPhoto(file)
                    }}
                  />
                  <Button size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
                    {photo ? 'Replace photo' : 'Upload photo'}
                  </Button>
                </div>
              </div>
              {photo ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
                  <div className="overflow-hidden border border-line bg-bone">
                    <PreviewImage path={photo.url} alt="Your private try-on photo" />
                  </div>
                  <div className="space-y-3">
                    <Checkbox
                      checked={consent}
                      onChange={(event) => {
                        setConsent(event.target.checked)
                        resetSessionForChange()
                      }}
                      label="I consent to processing this photo for this preview."
                      hint="It is not used to train any model. Delete the try-on or the photo at any time."
                    />
                    <p className="border border-line bg-bone/50 px-3 py-2 text-[0.625rem] leading-relaxed text-ink-muted">
                      Your identity is preserved as far as the model allows, but results are
                      approximate. The AI model works on the main garment only; shoes, bags, watches
                      and headwear are 3D previews.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 border border-dashed border-line bg-bone/40 px-4 py-8 text-center text-xs text-ink-muted">
                  No photo yet. Choose a portrait image (at least 480 px tall) to begin.
                </div>
              )}
            </div>
          )}

          {capabilitiesQuery.isLoading ? <Skeleton className="h-40 w-full" /> : null}
          {capabilitiesQuery.data ? <CapabilitiesPanel capabilities={capabilitiesQuery.data} /> : null}
          {capabilitiesQuery.isError ? (
            <ErrorState
              title="Could not check the AI worker"
              message="The 3D preview and saved try-ons still work. Retry to check whether a GPU worker is available."
              onRetry={() => capabilitiesQuery.refetch()}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="label-xs">2 · Garment</p>
              <span className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                {formatPrice(totalPrice)} base
              </span>
            </div>
            <div className="flex flex-wrap gap-1 px-4 pt-3">
              {MAIN_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    const first = mainGarments.find((garment) => garment.slot === slot)
                    if (first) {
                      chooseMain(first)
                    } else {
                      setMainSlot(slot)
                      setMainGarmentId(null)
                      setMainDesignId('')
                      resetSessionForChange()
                    }
                  }}
                  aria-pressed={mainSlot === slot}
                  className={cn(
                    'border px-2.5 py-1.5 text-[0.5625rem] uppercase tracking-[0.12em]',
                    mainSlot === slot ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted',
                  )}
                >
                  {SLOT_LABELS[slot]}
                </button>
              ))}
            </div>
            <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3">
              {mainGarments
                .filter((garment) => garment.slot === mainSlot)
                .map((garment) => {
                  const selected = garment.id === mainGarmentId
                  return (
                    <button
                      key={garment.id}
                      type="button"
                      onClick={() => chooseMain(garment)}
                      aria-pressed={selected}
                      className={cn(
                        'border text-left transition-colors',
                        selected ? 'border-ink' : 'border-line hover:border-ink/60',
                      )}
                    >
                      <span className="flex aspect-[4/5] items-center justify-center bg-bone p-1">
                        <GarmentArt garment={garment} className="h-full w-full" showShadow={false} />
                      </span>
                      <span className="block border-t border-line px-2 py-1.5">
                        <span className="block truncate text-[0.6875rem]">{garment.name}</span>
                        <span className="block text-[0.5rem] uppercase tracking-[0.1em] text-ink-muted">
                          {garment.components.length} components · {titleCase(garment.default_fabric)}
                        </span>
                      </span>
                    </button>
                  )
                })}
            </div>
            {mainGarments.filter((garment) => garment.slot === mainSlot).length === 0 ? (
              <p className="px-4 pb-4 text-xs text-ink-muted">No pieces in this slot for your profile.</p>
            ) : null}
            <p className="border-t border-line px-4 py-2 text-[0.625rem] leading-relaxed text-ink-muted">
              Kameez, shirt and jacket map to the upper body; shalwar and trouser to the lower body;
              a full suit or dress maps to the whole look. A selected design is applied per component.
            </p>
          </section>

          {mainGarment ? (
            <section className="border border-line bg-paper">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <p className="label-xs">3 · Design, size, fabric & colour</p>
                <Badge tone="neutral">{titleCase(mainGarment.slot)}</Badge>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-[140px_1fr]">
                <div ref={artRef} className="border border-line bg-bone p-2">
                  <GarmentArt
                    garment={mainGarment}
                    components={mainDesign?.components}
                    colorOverride={colorTouched ? color : null}
                    className="h-auto w-full"
                  />
                  <p className="mt-1 text-center text-[0.5rem] uppercase tracking-[0.1em] text-ink-muted">
                    Flat-lay reference
                  </p>
                </div>
                <div className="space-y-3">
                  <Select
                    label="Saved design"
                    value={mainDesignId}
                    onChange={(event) => chooseDesign(event.target.value)}
                    options={[
                      { value: '', label: 'Catalogue finish (no saved design)' },
                      ...designsForMain.map((design) => ({ value: design.id, label: design.name })),
                    ]}
                    hint={
                      designsForMain.length === 0
                        ? 'Save a design in the studio to apply component-level colours and fabrics here.'
                        : 'The design’s component colours are used until you override them below.'
                    }
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Size"
                      value={size ?? ''}
                      onChange={(event) => {
                        setSize(event.target.value)
                        resetSessionForChange()
                      }}
                      options={(mainGarment.sizes.length ? mainGarment.sizes : ['one-size']).map((value) => ({
                        value,
                        label: value,
                      }))}
                      hint="Catalogue sample size, not a fit guarantee."
                    />
                    <Select
                      label="Fabric"
                      value={fabric}
                      onChange={(event) => {
                        setFabric(event.target.value)
                        setFabricTouched(true)
                        resetSessionForChange()
                      }}
                      options={fabricChoices}
                      hint="Illustrative appearance only."
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <label className="flex-1">
                      <span className="label-xs">Colour</span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <input
                          type="color"
                          value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#1f1d1a'}
                          onChange={(event) => {
                            setColor(event.target.value)
                            setColorTouched(true)
                            resetSessionForChange()
                          }}
                          className="h-10 w-14 border border-line bg-paper p-1"
                          aria-label="Garment colour"
                        />
                        <span className="font-mono text-xs text-ink-muted">{color}</span>
                      </span>
                    </label>
                    {colorTouched || fabricTouched ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setColorTouched(false)
                          setFabricTouched(false)
                          const first = mainDesign ? Object.values(mainDesign.components)[0] : null
                          setColor(first?.color ?? mainGarment.default_color)
                          setFabric(first?.fabric ?? mainGarment.default_fabric)
                          resetSessionForChange()
                        }}
                      >
                        Use design colours
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="label-xs">4 · 3D accessories</p>
              <Badge tone="neutral">Rig-attached</Badge>
            </div>
            <div className="flex flex-wrap gap-1 px-4 pt-3">
              {ACCESSORY_SLOT_ORDER.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setAccessorySlot(slot)}
                  aria-pressed={accessorySlot === slot}
                  className={cn(
                    'border px-2.5 py-1.5 text-[0.5625rem] uppercase tracking-[0.12em]',
                    accessorySlot === slot ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted',
                  )}
                >
                  {SLOT_LABELS[slot]}
                  {accessories[slot] ? ' · 1' : ''}
                </button>
              ))}
            </div>
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3">
              {accessoryGarments
                .filter((garment) => garment.slot === accessorySlot)
                .map((garment) => {
                  const selected = accessories[garment.slot]?.garment.id === garment.id
                  return (
                    <button
                      key={garment.id}
                      type="button"
                      onClick={() => toggleAccessory(garment)}
                      aria-pressed={selected}
                      className={cn(
                        'border text-left transition-colors',
                        selected ? 'border-ink' : 'border-line hover:border-ink/60',
                      )}
                    >
                      <span className="flex aspect-[4/3] items-center justify-center bg-bone p-1">
                        <GarmentArt garment={garment} className="h-full w-full" showShadow={false} />
                      </span>
                      <span className="block border-t border-line px-2 py-1.5">
                        <span className="block truncate text-[0.6875rem]">{garment.name}</span>
                        <span className="block text-[0.5rem] uppercase tracking-[0.1em] text-ink-muted">
                          {selected ? 'Wearing · click to remove' : 'Add to 3D look'}
                        </span>
                      </span>
                    </button>
                  )
                })}
            </div>
            {accessoryChoice ? (
              <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
                <Select
                  label={`Size · ${accessoryChoice.garment.name}`}
                  value={accessoryChoice.size ?? ''}
                  onChange={(event) => chooseAccessorySize(event.target.value)}
                  options={(
                    accessoryChoice.garment.sizes.length
                      ? accessoryChoice.garment.sizes
                      : ['one-size']
                  ).map((value) => ({ value, label: value }))}
                  hint="Catalogue sample size, not a fit guarantee."
                />
                {designsForAccessory.length ? (
                  <Select
                    label={`Saved design · ${accessoryChoice.garment.name}`}
                    value={accessoryChoice.designId ?? ''}
                    onChange={(event) => chooseAccessoryDesign(event.target.value)}
                    options={[
                      { value: '', label: 'Catalogue finish (no saved design)' },
                      ...designsForAccessory.map((design) => ({
                        value: design.id,
                        label: design.name,
                      })),
                    ]}
                    hint="Component colours from the saved design are applied to the 3D accessory."
                  />
                ) : (
                  <p className="self-end pb-1 text-[0.625rem] leading-relaxed text-ink-muted">
                    No saved design for this accessory. Its catalogue colour is used; the render is
                    an authored sample, not a fit guarantee.
                  </p>
                )}
              </div>
            ) : null}
            <p className="border-t border-line px-4 py-2 text-[0.625rem] leading-relaxed text-ink-muted">
              Footwear is a separate authored mesh parented to <code>foot_L</code> /{' '}
              <code>foot_R</code>, so it moves with the walk animation. Other accessories use the
              rigged sample meshes. The AI photo preview models the main garment only.
            </p>
          </section>

          <section className="space-y-3 border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="label-xs">5 · Save & generate</p>
              <Badge tone="gold">Approx.</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => saveLook.mutate()}
                loading={saveLook.isPending}
                disabled={!mainGarment}
              >
                Save look
              </Button>
              {mode === 'avatar' ? (
                <Button onClick={() => void handleSave3D()} loading={saving3d} disabled={!avatar || !mainGarment}>
                  Save 3D preview
                </Button>
              ) : (
                <Button
                  onClick={() => void handleGenerate()}
                  loading={generating}
                  disabled={!canUseAi || !photo || !consent || !mainGarment}
                  title={
                    canUseAi
                      ? 'Generate an approximate AI preview'
                      : capabilitiesQuery.data?.reason ?? 'No GPU worker is configured.'
                  }
                >
                  Generate AI preview
                </Button>
              )}
            </div>
            <p className="text-[0.625rem] leading-relaxed text-ink-muted">
              {mode === 'photo'
                ? canUseAi
                  ? 'The model runs on a self-hosted GPU worker. Your photo is sent only for this request and is not used for training.'
                  : 'AI generation is disabled because this environment has no ready GPU worker. No placeholder image is produced.'
                : 'Saving a 3D preview captures the current canvas. It is an authored sample render, not an AI photo of you.'}
            </p>
          </section>

          {activeSession?.mode === 'photo' && activeSession.result_url ? (
            <section className="border border-line bg-paper p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="label-xs">Original vs customised</p>
                <Badge tone="gold">AI · approximate</Badge>
              </div>
              <div className="mt-3">
                <CompareSlider
                  original={activeSession.original_url ?? ''}
                  customised={activeSession.result_url}
                  originalLabel={activeSession.comparison.original_label}
                  customisedLabel={activeSession.comparison.customised_label}
                />
              </div>
              <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-muted">
                {activeSession.comparison.note}
              </p>
            </section>
          ) : null}

          {activeSession?.mode === 'avatar' && activeSession.preview_url ? (
            <section className="border border-line bg-paper p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="label-xs">Saved 3D preview</p>
                <Badge tone="olive">3D · authored samples</Badge>
              </div>
              <div className="mt-3 max-h-[420px] overflow-hidden border border-line bg-bone">
                <PreviewImage path={activeSession.preview_url} alt="Saved customised 3D try-on" />
              </div>
              <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-muted">
                {activeSession.comparison.note}
              </p>
            </section>
          ) : null}

          {mode === 'photo' && !activeSession?.result_url ? (
            <section className="border border-gold/40 bg-gold/8 p-4" data-testid="no-photo-result">
              <p className="label-xs">No generated preview</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {activeSession?.error ??
                  'No AI preview has been generated. The source photo is shown for reference only; nothing is being presented as a successful try-on.'}
              </p>
              {activeSession?.original_url ? (
                <div className="mt-3 max-h-80 overflow-hidden border border-line bg-bone">
                  <PreviewImage path={activeSession.original_url} alt="Source photo, not a try-on result" />
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      <section className="mt-10 border-t border-line pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Private library</p>
            <h2 className="display-md mt-1">Saved try-ons</h2>
          </div>
          <Link to="/fitting-room" className="text-[0.625rem] uppercase tracking-[0.14em] underline underline-offset-4">
            Open the full fitting room
          </Link>
        </div>
        {sessionsQuery.isLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))}
          </div>
        ) : sessionsQuery.data?.items.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessionsQuery.data.items.map((entry) => (
              <SavedSessionCard
                key={entry.id}
                session={entry}
                active={session?.id === entry.id}
                onOpen={() => loadSession(entry)}
                onDelete={() => {
                  if (window.confirm('Delete this saved try-on and its generated image?')) {
                    deleteSession.mutate(entry.id)
                  }
                }}
                deleting={deleteSession.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 border border-dashed border-line bg-bone/40 p-6 text-center text-xs text-ink-muted">
            Nothing saved yet. A saved look keeps your choices and any preview you generated.
          </div>
        )}
      </section>

      <p className="mt-8 border-t border-line pt-4 text-[0.625rem] leading-relaxed text-ink-muted">
        {capabilitiesQuery.data?.disclaimer ??
          'AI try-on previews are approximate illustrations. They are not a fit guarantee and do not simulate physical fabric behaviour.'}{' '}
        Photo try-on requires explicit consent and never trains on your images. 3D sample garments are
        original authored assets, not auto-fitted catalogue products.
      </p>
    </div>
  )
}
