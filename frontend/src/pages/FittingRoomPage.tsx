import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useStudioStore, type FittingItem } from '@/stores/studioStore'
import { toast } from '@/stores/toastStore'
import { AvatarScene } from '@/components/three/AvatarScene'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { Button, LinkButton, Spinner } from '@/components/ui/Button'
import { Input, Select, Textarea, Toggle } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui/Primitives'
import { FALLBACK_AVATAR } from '@/lib/avatarDefaults'
import { SLOT_LABELS, SLOT_ORDER, cn, formatPrice, titleCase } from '@/lib/format'
import type { Avatar, Design, Garment, Outfit, Profile } from '@/lib/types'

export function FittingRoomPage() {
  const queryClient = useQueryClient()
  const { items, addItem, removeItem, clear, hydrate, walk, autoRotate, showAccessories, setWalk, setAutoRotate, setShowAccessories } =
    useStudioStore()

  const [activeSlot, setActiveSlot] = useState<string>('dress')
  const [saveOpen, setSaveOpen] = useState(false)
  const [outfitName, setOutfitName] = useState('Untitled look')
  const [occasion, setOccasion] = useState('everyday')
  const [notes, setNotes] = useState('')

  const garmentsQuery = useQuery({
    queryKey: qk.garments({ page_size: 60, sort: 'featured' }),
    queryFn: () => fetchers.garments({ page_size: 60, sort: 'featured' }),
  })
  const designsQuery = useQuery({ queryKey: qk.designs, queryFn: fetchers.designs })
  const avatarsQuery = useQuery<Avatar[]>({ queryKey: qk.avatars, queryFn: fetchers.avatars })
  const profileQuery = useQuery<Profile>({ queryKey: qk.profile, queryFn: fetchers.profile })
  const outfitsQuery = useQuery({ queryKey: qk.outfits, queryFn: fetchers.outfits })

  const avatar = avatarsQuery.data?.find((item) => item.is_primary) ?? avatarsQuery.data?.[0]
  const parameters = avatar?.parameters ?? FALLBACK_AVATAR
  const genderStyle = profileQuery.data?.style_gender ?? 'womenswear'

  const catalogue = useMemo(() => {
    const garments = garmentsQuery.data?.items ?? []
    return garments.filter(
      (garment) => garment.gender === genderStyle || garment.gender === 'unisex',
    )
  }, [garmentsQuery.data, genderStyle])

  const slotOptions = useMemo(() => {
    const garments = garmentsQuery.data?.items ?? []
    return SLOT_ORDER.filter((slot) =>
      garments.some(
        (garment) =>
          garment.slot === slot && (garment.gender === genderStyle || garment.gender === 'unisex'),
      ),
    )
  }, [garmentsQuery.data, genderStyle])

  const designsByGarment = useMemo(() => {
    const map = new Map<string, Design[]>()
    ;(designsQuery.data?.items ?? []).forEach((design) => {
      const list = map.get(design.garment_id) ?? []
      list.push(design)
      map.set(design.garment_id, list)
    })
    return map
  }, [designsQuery.data])

  const totalPrice = items.reduce((sum, item) => sum + item.garment.base_price_cents, 0)

  const wear = (garment: Garment, designId: string | null = null) => {
    const design = (designsQuery.data?.items ?? []).find((item) => item.id === designId)
    addItem({
      slot: garment.slot,
      garment,
      designId,
      designName: design?.name ?? null,
      components: design?.components ?? {},
    })
  }

  const saveOutfit = useMutation({
    mutationFn: () =>
      api.post<Outfit>('/outfits', {
        name: outfitName.trim() || 'Untitled look',
        gender: genderStyle,
        occasion,
        notes: notes.trim() || null,
        items: items.map((item, index) => ({
          garment_id: item.garment.id,
          design_id: item.designId,
          slot: item.slot,
          sort_order: index,
        })),
      }),
    onSuccess: (outfit) => {
      queryClient.invalidateQueries({ queryKey: qk.outfits })
      setSaveOpen(false)
      toast.success('Outfit saved', `${outfit.name} is in your library.`)
    },
    onError: (error) => {
      toast.error('Could not save the outfit', error instanceof ApiError ? error.message : 'Try again.')
    },
  })

  const loadSavedOutfit = (outfit: Outfit) => {
    const nextItems: Omit<FittingItem, 'key'>[] = outfit.items
      .filter((item) => item.garment)
      .map((item) => ({
        slot: item.slot,
        garment: item.garment as Garment,
        designId: item.design_id,
        designName: item.design?.name ?? null,
        components: item.design?.components ?? {},
      }))
    hydrate(nextItems)
    toast.info('Outfit loaded', `${outfit.name} is now on the avatar.`)
  }

  if (avatarsQuery.isLoading) {
    return (
      <div className="shell py-16">
        <Skeleton className="h-8 w-1/3" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (avatarsQuery.isError) {
    return (
      <div className="shell py-16">
        <ErrorState
          title="The fitting room could not load your avatar"
          message="Check your connection and retry."
          onRetry={() => avatarsQuery.refetch()}
        />
      </div>
    )
  }

  if (!avatar) {
    return (
      <div className="shell py-16">
        <EmptyState
          title="Create your avatar to open the fitting room"
          description="Add a few measurements and we will generate a parametric body you can rotate, animate and dress."
          action={<LinkButton to="/onboarding">Complete onboarding</LinkButton>}
        />
      </div>
    )
  }

  return (
    <div className="shell py-8">
      <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Fitting room</p>
          <h1 className="display-lg mt-1">{avatar.name}</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-muted">
            {avatar.parameters.height_m.toFixed(2)} m ·{' '}
            {avatar.parameters.derived_body_shape ? titleCase(avatar.parameters.derived_body_shape) : 'Custom'} ·{' '}
            {items.length} pieces worn
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clear} disabled={items.length === 0}>
            Undress
          </Button>
          <LinkButton to="/profile" size="sm" variant="outline">
            Adjust avatar
          </LinkButton>
          <Button size="sm" onClick={() => setSaveOpen(true)} disabled={items.length === 0}>
            Save outfit
          </Button>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_1fr]">
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <AvatarScene
            parameters={parameters}
            skinTone={avatar.skin_tone}
            hairColor={avatar.hair_color}
            hairStyle={avatar.hair_style}
            className="aspect-[4/5] w-full"
          />
          <div className="grid grid-cols-3 gap-px bg-line">
            <button
              type="button"
              onClick={() => setWalk(!walk)}
              className={cn(
                'bg-paper px-3 py-3 text-left transition-colors hover:bg-bone',
                walk && 'bg-ink text-paper hover:bg-ink',
              )}
              aria-pressed={walk}
            >
              <span className="block text-[0.5625rem] uppercase tracking-[0.14em] opacity-70">Animation</span>
              <span className="mt-1 block text-xs">{walk ? 'Walking' : 'Play walk'}</span>
            </button>
            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={cn(
                'bg-paper px-3 py-3 text-left transition-colors hover:bg-bone',
                autoRotate && 'bg-ink text-paper hover:bg-ink',
              )}
              aria-pressed={autoRotate}
            >
              <span className="block text-[0.5625rem] uppercase tracking-[0.14em] opacity-70">Turntable</span>
              <span className="mt-1 block text-xs">{autoRotate ? 'Rotating' : 'Rotate 360°'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAccessories(!showAccessories)}
              className={cn(
                'bg-paper px-3 py-3 text-left transition-colors hover:bg-bone',
                !showAccessories && 'bg-ink text-paper hover:bg-ink',
              )}
              aria-pressed={!showAccessories}
            >
              <span className="block text-[0.5625rem] uppercase tracking-[0.14em] opacity-70">Layers</span>
              <span className="mt-1 block text-xs">{showAccessories ? 'Accessories on' : 'Accessories off'}</span>
            </button>
          </div>

          <div className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="label-xs">Worn now</p>
              <span className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                {formatPrice(totalPrice)} base
              </span>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-5 text-xs text-ink-muted">
                Nothing worn yet. Pick a piece from the wardrobe on the right — a dress replaces a
                separate top and bottom automatically.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.key} className="flex items-center gap-3 px-4 py-3">
                    <GarmentArt garment={item.garment} components={item.components} className="h-12 w-9 bg-bone" showShadow={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{item.garment.name}</p>
                      <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                        {SLOT_LABELS[item.slot] ?? item.slot}
                        {item.designName ? ` · ${item.designName}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/garment/${item.garment.slug}`}
                        className="text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        className="text-ink-muted hover:text-danger"
                        aria-label={`Remove ${item.garment.name}`}
                      >
                        <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
                          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">Wardrobe</h2>
              <span className="text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
                {titleCase(genderStyle)} catalogue
              </span>
            </div>

            <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar">
              {slotOptions.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setActiveSlot(slot)}
                  className={cn(
                    'shrink-0 border px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.12em]',
                    activeSlot === slot ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted hover:border-ink',
                  )}
                  aria-pressed={activeSlot === slot}
                >
                  {SLOT_LABELS[slot] ?? slot}
                </button>
              ))}
            </div>

            {garmentsQuery.isLoading && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="aspect-[4/5] w-full" />
                ))}
              </div>
            )}

            {!garmentsQuery.isLoading && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {catalogue
                  .filter((garment) => garment.slot === activeSlot)
                  .map((garment) => {
                    const designs = designsByGarment.get(garment.id) ?? []
                    const worn = items.some((item) => item.garment.id === garment.id)
                    return (
                      <div
                        key={garment.id}
                        className={cn(
                          'group border bg-paper transition-colors',
                          worn ? 'border-ink' : 'border-line hover:border-ink/60',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => wear(garment)}
                          className="block w-full text-left"
                          aria-pressed={worn}
                        >
                          <div className="flex aspect-[4/5] items-center justify-center bg-bone">
                            <GarmentArt garment={garment} className="h-[86%] w-[86%]" />
                          </div>
                          <div className="border-t border-line px-2.5 py-2">
                            <p className="truncate text-xs">{garment.name}</p>
                            <p className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                              {worn ? 'Wearing' : titleCase(garment.default_fabric)}
                            </p>
                          </div>
                        </button>
                        {designs.length > 0 && (
                          <div className="border-t border-line px-2 py-1.5">
                            <select
                              aria-label={`Wear a saved design of ${garment.name}`}
                              className="w-full border border-line bg-paper px-1.5 py-1 text-[0.625rem]"
                              value=""
                              onChange={(event) => {
                                if (event.target.value) wear(garment, event.target.value)
                              }}
                            >
                              <option value="">Saved designs…</option>
                              {designs.map((design) => (
                                <option key={design.id} value={design.id}>
                                  {design.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                {catalogue.filter((garment) => garment.slot === activeSlot).length === 0 && (
                  <p className="col-span-full border border-dashed border-line p-6 text-center text-xs text-ink-muted">
                    No pieces in this slot for {titleCase(genderStyle)}.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border border-line bg-paper p-4">
              <p className="label-xs">Saved outfits</p>
              {outfitsQuery.data?.items.length ? (
                <ul className="mt-2 space-y-1.5">
                  {outfitsQuery.data.items.slice(0, 4).map((outfit) => (
                    <li key={outfit.id}>
                      <button
                        type="button"
                        onClick={() => loadSavedOutfit(outfit)}
                        className="flex w-full items-center justify-between gap-2 text-left text-xs hover:text-clay"
                      >
                        <span className="truncate">{outfit.name}</span>
                        <span className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                          {outfit.items.length} pcs
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-ink-muted">Nothing saved yet.</p>
              )}
              <Link to="/outfits" className="mt-3 inline-block text-[0.625rem] uppercase tracking-[0.12em] underline underline-offset-4">
                Outfit library
              </Link>
            </div>

            <div className="border border-line bg-paper p-4">
              <p className="label-xs">Avatar</p>
              <p className="mt-2 font-display text-lg leading-tight">{avatar.name}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {items.length === 0
                  ? 'Undressed mannequin'
                  : `${items.length} pieces · ${formatPrice(totalPrice)}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="neutral">{titleCase(avatar.gender_presentation)}</Badge>
                <Badge tone="neutral">{avatar.parameters.height_m.toFixed(2)} m</Badge>
              </div>
            </div>
          </div>

          <div className="border border-line border-dashed p-4 text-xs leading-relaxed text-ink-muted">
            The mannequin is generated from your measurements, not scanned. Garment geometry is a
            simplified drape — use the print proof and technical pack for real production tolerances.
          </div>
        </div>
      </div>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save this outfit"
        description="Saved outfits can be compared, exported as a technical pack and sent to a production partner."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveOutfit.mutate()} loading={saveOutfit.isPending}>
              Save outfit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={outfitName} onChange={(event) => setOutfitName(event.target.value)} maxLength={140} />
          <Select
            label="Occasion"
            value={occasion}
            onChange={(event) => setOccasion(event.target.value)}
            options={['everyday', 'office', 'evening', 'wedding', 'travel'].map((value) => ({
              value,
              label: titleCase(value),
            }))}
          />
          <Textarea
            label="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What is this look for?"
            maxLength={2000}
          />
          <Toggle
            checked={walk}
            onChange={setWalk}
            label="Keep walking animation on"
            description="Only affects the preview, not the saved outfit."
          />
          <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-ink-muted">
            <span>{items.length} pieces</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
        </div>
      </Modal>

      {saveOutfit.isPending && (
        <span className="fixed bottom-4 left-4 flex items-center gap-2 border border-line bg-paper px-3 py-2 text-xs">
          <Spinner className="size-3" /> Saving outfit
        </span>
      )}
    </div>
  )
}
