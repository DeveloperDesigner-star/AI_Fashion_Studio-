import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useStudioStore, type FittingItem } from '@/stores/studioStore'
import { toast } from '@/stores/toastStore'
import { downloadFile } from '@/lib/download'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { Button, LinkButton } from '@/components/ui/Button'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { cn, formatDate, formatPrice, titleCase } from '@/lib/format'
import type { Garment, Outfit, OutfitComparison } from '@/lib/types'

export function OutfitsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hydrate = useStudioStore((state) => state.hydrate)
  const [selected, setSelected] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const outfitsQuery = useQuery({ queryKey: qk.outfits, queryFn: fetchers.outfits })

  const comparison = useQuery({
    queryKey: ['outfit-compare', selected],
    queryFn: () => fetchers.compare(selected),
    enabled: selected.length >= 2,
  })

  const toggleFavorite = useMutation({
    mutationFn: (outfit: Outfit) => api.patch<Outfit>(`/outfits/${outfit.id}`, { is_favorite: !outfit.is_favorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.outfits }),
    onError: (error) =>
      toast.error('Could not update the outfit', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const removeOutfit = useMutation({
    mutationFn: (outfitId: string) => api.delete(`/outfits/${outfitId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.outfits })
      toast.success('Outfit removed')
    },
    onError: (error) =>
      toast.error('Could not delete the outfit', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const outfits = useMemo(() => outfitsQuery.data?.items ?? [], [outfitsQuery.data])

  const totals = useMemo(() => {
    const map = new Map<string, number>()
    outfits.forEach((outfit) => {
      map.set(
        outfit.id,
        outfit.items.reduce((sum, item) => sum + (item.garment?.base_price_cents ?? 0), 0),
      )
    })
    return map
  }, [outfits])

  const toggleSelection = (outfitId: string) => {
    setSelected((current) => {
      if (current.includes(outfitId)) return current.filter((id) => id !== outfitId)
      if (current.length >= 3) {
        toast.info('Compare up to three outfits', 'Remove one from the selection first.')
        return current
      }
      return [...current, outfitId]
    })
  }

  const wear = (outfit: Outfit) => {
    const items: Omit<FittingItem, 'key'>[] = outfit.items
      .filter((item) => item.garment)
      .map((item) => ({
        slot: item.slot,
        garment: item.garment as Garment,
        designId: item.design_id,
        designName: item.design?.name ?? null,
        components: item.design?.components ?? {},
      }))
    if (!items.length) {
      toast.error('This outfit has no garments left')
      return
    }
    hydrate(items)
    navigate('/fitting-room')
  }

  const exportPack = async (outfit: Outfit) => {
    setBusyId(outfit.id)
    try {
      await downloadFile(
        `/outfits/${outfit.id}/export`,
        `${outfit.name.toLowerCase().replace(/\s+/g, '-')}-tech-pack.json`,
      )
      toast.success('Technical pack downloaded')
    } catch (error) {
      toast.error('Export failed', error instanceof ApiError ? error.message : 'Try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Outfit library"
        title="Saved looks & comparisons"
        description="Every saved outfit keeps the exact component customisations and can be exported as a production technical pack."
        actions={
          <>
            <LinkButton to="/fitting-room" variant="outline" size="sm">
              Open fitting room
            </LinkButton>
            <LinkButton to="/studio/women" size="sm">
              Add pieces
            </LinkButton>
          </>
        }
      />

      {outfitsQuery.isLoading && (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full" />
          ))}
        </div>
      )}

      {outfitsQuery.isError && (
        <div className="mt-8">
          <ErrorState
            title="Outfits could not be loaded"
            message="Check the API connection and retry."
            onRetry={() => outfitsQuery.refetch()}
          />
        </div>
      )}

      {!outfitsQuery.isLoading && outfits.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="No outfits saved yet"
            description="Assemble a look in the fitting room and save it — you can then compare colourways and export the technical pack."
            action={<LinkButton to="/fitting-room">Open the fitting room</LinkButton>}
          />
        </div>
      )}

      {outfits.length > 0 && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
              {outfits.length} outfits · select 2–3 to compare
            </p>
            {selected.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Clear selection ({selected.length})
              </Button>
            )}
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {outfits.map((outfit) => (
              <article key={outfit.id} className="flex flex-col border border-line bg-paper">
                <div className="relative flex h-44 items-center justify-center gap-1 bg-bone px-3">
                  {outfit.items.slice(0, 4).map((item) =>
                    item.garment ? (
                      <GarmentArt
                        key={item.id}
                        garment={item.garment}
                        components={item.design?.components}
                        className="h-[85%] w-1/4"
                        showShadow={false}
                      />
                    ) : null,
                  )}
                  {outfit.items.length === 0 && (
                    <p className="text-xs text-ink-muted">All pieces were removed from the catalogue.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleFavorite.mutate(outfit)}
                    className="absolute right-3 top-3 text-ink-muted hover:text-clay"
                    aria-label={outfit.is_favorite ? `Remove ${outfit.name} from favourites` : `Favourite ${outfit.name}`}
                    aria-pressed={outfit.is_favorite}
                  >
                    <svg viewBox="0 0 20 20" className="size-4" fill={outfit.is_favorite ? 'currentColor' : 'none'} aria-hidden="true">
                      <path
                        d="M10 16.5S3.5 12.6 3.5 7.9A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 6.5 1.9c0 4.7-6.5 8.6-6.5 8.6Z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                    </svg>
                  </button>
                  <label className="absolute left-3 top-3 flex items-center gap-1.5 bg-paper/90 px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em]">
                    <input
                      type="checkbox"
                      checked={selected.includes(outfit.id)}
                      onChange={() => toggleSelection(outfit.id)}
                      className="size-3"
                    />
                    Compare
                  </label>
                </div>

                <div className="flex flex-1 flex-col gap-2 border-t border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-lg leading-tight">{outfit.name}</h2>
                      <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                        {titleCase(outfit.occasion)} · {outfit.items.length} pieces · {formatDate(outfit.updated_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm">{formatPrice(totals.get(outfit.id) ?? 0)}</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {outfit.items.slice(0, 4).map((item) => (
                      <Badge key={item.id} tone="neutral">
                        {item.garment ? titleCase(item.garment.category) : 'removed'}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    <Button size="sm" variant="outline" onClick={() => wear(outfit)}>
                      Try on
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => exportPack(outfit)}
                      loading={busyId === outfit.id}
                    >
                      Tech pack
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Delete “${outfit.name}”? This cannot be undone.`)) {
                          removeOutfit.mutate(outfit.id)
                        }
                      }}
                      className="ml-auto text-danger"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {selected.length >= 2 && (
        <section className="mt-10 border border-line bg-paper">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div>
              <p className="eyebrow">Side by side</p>
              <h2 className="font-display text-xl">Comparison</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Close
            </Button>
          </div>

          {comparison.isLoading && <div className="p-5 text-sm text-ink-muted">Comparing…</div>}
          {comparison.isError && (
            <div className="p-5 text-sm text-danger">The comparison could not be generated.</div>
          )}

          {comparison.data && <ComparisonTable data={comparison.data} />}
        </section>
      )}
    </div>
  )
}

function ComparisonTable({ data }: { data: OutfitComparison }) {
  const slots = useMemo(
    () => Array.from(new Set(data.differences.map((difference) => difference.slot))),
    [data],
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">Outfit comparison by garment slot</caption>
        <thead>
          <tr className="border-b border-line bg-bone/50">
            <th scope="col" className="px-4 py-3 text-left text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
              Slot
            </th>
            {data.outfits.map((outfit) => (
              <th key={outfit.id} scope="col" className="px-4 py-3 text-left font-display text-base font-normal">
                {outfit.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => {
            const row = data.differences.find((difference) => difference.slot === slot)
            return (
              <tr key={slot} className="border-b border-line/70">
                <th scope="row" className="px-4 py-2.5 text-left text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                  {titleCase(slot)}
                </th>
                {data.outfits.map((outfit) => {
                  const value = row?.by_outfit[outfit.id]
                  return (
                    <td
                      key={outfit.id}
                      className={cn('px-4 py-2.5 text-sm', !value && 'text-ink-muted/60')}
                    >
                      {value ?? '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          <tr className="bg-bone/40">
            <th scope="row" className="px-4 py-3 text-left text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
              Base total
            </th>
            {data.outfits.map((outfit) => (
              <td key={outfit.id} className="px-4 py-3 font-display text-base">
                {formatPrice((data.price_totals[outfit.id] ?? 0) * 100)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {data.shared_garments.length > 0 && (
        <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">
          Shared pieces: {data.shared_garments.map((slug) => titleCase(slug.replace(/-/g, ' '))).join(', ')}
        </p>
      )}
    </div>
  )
}
