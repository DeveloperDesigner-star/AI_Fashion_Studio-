import { useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { GarmentCard } from '@/components/garment/GarmentCard'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { Input, Select } from '@/components/ui/Field'
import { Button, LinkButton } from '@/components/ui/Button'
import { cn, formatPrice } from '@/lib/format'
import {
  activeFilterCount,
  categoryLabel,
  departmentCategories,
  filtersFromParams,
  filtersToParams,
  occasionLabel,
  styleLabel,
  toggleValue,
  type CatalogFilters,
} from '@/lib/catalog'
import { useFavorites } from '@/hooks/useFavorites'

const SORT_OPTIONS = [
  { value: 'featured', label: 'Editorial picks' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price · low to high' },
  { value: 'price_desc', label: 'Price · high to low' },
  { value: 'name', label: 'Alphabetical' },
]

const FITS = [
  { value: 'slim', label: 'Slim' },
  { value: 'regular', label: 'Regular' },
  { value: 'loose', label: 'Loose' },
]

export function StudioPage() {
  const { gender } = useParams<{ gender: string }>()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [showAllCategories, setShowAllCategories] = useState(false)

  const department: 'womenswear' | 'menswear' = gender === 'men' ? 'menswear' : 'womenswear'
  const filters = useMemo(() => filtersFromParams(params), [params])
  const { signedIn } = useFavorites()

  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: fetchers.taxonomy, staleTime: 600_000 })

  const queryParams = useMemo(
    () => ({
      gender: department,
      // Department studios show apparel; footwear and accessories live on their own page.
      slot: 'headwear,outerwear,top,dress,bottom',
      q: filters.q || undefined,
      category: filters.category.length ? filters.category.join(',') : undefined,
      style: filters.style.length ? filters.style.join(',') : undefined,
      occasion: filters.occasion.length ? filters.occasion.join(',') : undefined,
      season: filters.season || undefined,
      fit: filters.fit || undefined,
      favorites_only: filters.favorites || undefined,
      sort: filters.sort,
      page,
      page_size: 12,
    }),
    [department, filters, page],
  )

  const garments = useQuery({
    queryKey: qk.garments(queryParams),
    queryFn: () => fetchers.garments(queryParams),
  })

  const looks = useQuery({
    queryKey: qk.looks(department),
    queryFn: () => fetchers.looks(department),
  })

  if (gender !== 'women' && gender !== 'men') {
    return <Navigate to="/studio/women" replace />
  }

  const update = (next: Partial<CatalogFilters>) => {
    setParams(filtersToParams({ ...filters, ...next }), { replace: true })
    setPage(1)
  }

  const clearFilters = () => {
    setParams(new URLSearchParams(), { replace: true })
    setPage(1)
  }

  const facets = garments.data?.facets
  const categories = departmentCategories(taxonomy.data, department)
  const visibleCategories = showAllCategories ? categories : categories.slice(0, 10)
  const styles = (taxonomy.data?.styles ?? []).filter((entry) => (facets?.styles?.[entry.value] ?? 0) > 0)
  const occasions = (taxonomy.data?.occasions ?? []).filter(
    (entry) => (facets?.occasions?.[entry.value] ?? 0) > 0,
  )
  const activeCount = activeFilterCount(filters)
  const featuredLook = looks.data?.items.find((look) => look.is_featured) ?? looks.data?.items[0]
  const totalPages = garments.data ? Math.max(1, Math.ceil(garments.data.total / garments.data.page_size)) : 1

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow={department === 'menswear' ? 'Menswear studio' : 'Womenswear studio'}
        title={department === 'menswear' ? 'Menswear, component by component' : 'Womenswear, component by component'}
        description="Traditional and contemporary pieces across every category — filter by style, occasion and season, then set colour, fabric, pattern and embroidery for each component before trying it on."
        actions={
          <>
            <LinkButton to="/studio/women" size="sm" variant={gender === 'women' ? 'primary' : 'outline'}>
              Women
            </LinkButton>
            <LinkButton to="/studio/men" size="sm" variant={gender === 'men' ? 'primary' : 'outline'}>
              Men
            </LinkButton>
            <LinkButton to="/studio/accessories" size="sm" variant="outline">
              Shoes & accessories
            </LinkButton>
          </>
        }
      />

      {featuredLook && (
        <section className="mt-8 grid gap-6 border border-line bg-bone/40 p-5 md:grid-cols-[auto_1fr_auto] md:items-center md:p-7">
          <div className="flex -space-x-8">
            {featuredLook.garments.slice(0, 3).map((garment) => (
              <GarmentArt
                key={garment.id}
                garment={garment}
                className="h-28 w-20 border border-line bg-paper"
                showShadow={false}
              />
            ))}
          </div>
          <div>
            <p className="eyebrow">Curated look · {occasionLabel(featuredLook.occasion, facets)}</p>
            <h2 className="display-md mt-1">{featuredLook.name}</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">{featuredLook.description}</p>
            <p className="mt-2 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
              {featuredLook.garments.length} pieces ·{' '}
              {formatPrice(featuredLook.garments.reduce((sum, garment) => sum + garment.base_price_cents, 0))}
            </p>
          </div>
          <LinkButton to={`/garment/${featuredLook.garments[0]?.slug ?? ''}`} variant="secondary" size="sm">
            Open the look
          </LinkButton>
        </section>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[248px_1fr]">
        <aside className="min-w-0 space-y-6">
          <Input
            label="Search"
            placeholder="Saree, sherwani, khussa…"
            value={filters.q}
            onChange={(event) => update({ q: event.target.value })}
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label-xs">Category</p>
              <button
                type="button"
                onClick={() => update({ category: [] })}
                className={cn(
                  'text-[0.5625rem] uppercase tracking-[0.1em] hover:text-ink',
                  filters.category.length ? 'text-clay' : 'text-ink-muted/60',
                )}
              >
                All
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 lg:flex-col lg:items-stretch">
              {visibleCategories.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => update({ category: toggleValue(filters.category, item.value) })}
                  aria-pressed={filters.category.includes(item.value)}
                  className={cn(
                    'flex items-center justify-between gap-2 border px-2.5 py-1.5 text-left text-[0.6875rem] uppercase tracking-[0.1em] transition-colors',
                    filters.category.includes(item.value)
                      ? 'border-ink bg-ink text-paper'
                      : 'border-transparent text-ink-muted hover:border-line hover:text-ink',
                  )}
                >
                  <span className="truncate">{categoryLabel(item.value, facets)}</span>
                  <span className="shrink-0 tabular-nums opacity-60">
                    {facets?.categories?.[item.value] ?? item.count ?? 0}
                  </span>
                </button>
              ))}
            </div>
            {categories.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllCategories((current) => !current)}
                className="mt-2 text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted underline decoration-line underline-offset-4 hover:text-ink"
              >
                {showAllCategories ? 'Show fewer' : `Show all ${categories.length}`}
              </button>
            )}
          </div>

          <div>
            <p className="label-xs mb-2">Style</p>
            <div className="flex flex-wrap gap-1.5">
              {styles.map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => update({ style: toggleValue(filters.style, style.value) })}
                  aria-pressed={filters.style.includes(style.value)}
                  className={cn(
                    'border px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em]',
                    filters.style.includes(style.value)
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line text-ink-muted hover:border-ink',
                  )}
                >
                  {styleLabel(style.value, facets)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label-xs mb-2">Occasion</p>
            <div className="flex flex-wrap gap-1.5">
              {occasions.map((occasion) => (
                <button
                  key={occasion.value}
                  type="button"
                  onClick={() => update({ occasion: toggleValue(filters.occasion, occasion.value) })}
                  aria-pressed={filters.occasion.includes(occasion.value)}
                  className={cn(
                    'border px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em]',
                    filters.occasion.includes(occasion.value)
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line text-ink-muted hover:border-ink',
                  )}
                >
                  {occasionLabel(occasion.value, facets)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label-xs mb-2">Fit</p>
            <div className="flex gap-1.5">
              {FITS.map((fit) => (
                <button
                  key={fit.value}
                  type="button"
                  onClick={() => update({ fit: filters.fit === fit.value ? '' : fit.value })}
                  aria-pressed={filters.fit === fit.value}
                  className={cn(
                    'flex-1 border px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em]',
                    filters.fit === fit.value
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line text-ink-muted hover:border-ink',
                  )}
                >
                  {fit.label}
                </button>
              ))}
            </div>
          </div>

          <Select
            label="Season"
            value={filters.season}
            onChange={(event) => update({ season: event.target.value })}
            options={[
              { value: '', label: 'All seasons' },
              ...(taxonomy.data?.seasons ?? []).map((season) => ({
                value: season.value,
                label: season.label,
              })),
            ]}
          />

          <button
            type="button"
            onClick={() => {
              if (!signedIn) return
              update({ favorites: !filters.favorites })
            }}
            aria-pressed={filters.favorites}
            disabled={!signedIn}
            className={cn(
              'flex w-full items-center justify-between border px-3 py-2 text-[0.625rem] uppercase tracking-[0.12em]',
              filters.favorites
                ? 'border-ink bg-ink text-paper'
                : 'border-line text-ink-muted hover:border-ink disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <span>Saved pieces</span>
            <span>{signedIn ? (filters.favorites ? '♥' : '♡') : 'Sign in'}</span>
          </button>

          <Select
            label="Sort"
            value={filters.sort}
            onChange={(event) => update({ sort: event.target.value })}
            options={SORT_OPTIONS}
          />

          {activeCount > 0 && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
            </Button>
          )}

          <div className="border border-line bg-bone/40 p-3 text-xs leading-relaxed text-ink-muted">
            Need something not in the catalogue? Upload a reference garment and we will build the
            technical pack around it.
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
              {garments.data ? `${garments.data.total} pieces` : 'Loading catalogue'}
              {filters.category.length > 0 &&
                ` · ${filters.category.map((value) => categoryLabel(value, facets)).join(', ')}`}
            </p>
            {activeCount > 0 && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {garments.isError && (
            <ErrorState
              title="The catalogue could not be loaded"
              message="Check that the API server is running, then retry."
              onRetry={() => garments.refetch()}
            />
          )}

          {garments.isLoading && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="min-w-0 border border-line bg-paper">
                  <Skeleton className="aspect-[4/5] w-full" />
                  <div className="space-y-2 border-t border-line p-4">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!garments.isLoading && garments.data?.items.length === 0 && (
            <EmptyState
              title={filters.favorites ? 'No saved pieces yet' : 'No pieces match these filters'}
              description={
                filters.favorites
                  ? 'Tap the heart on any catalogue piece to keep it here.'
                  : 'Try another category, widen the style selection, or clear the search.'
              }
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Reset filters
                </Button>
              }
            />
          )}

          {!garments.isLoading && Boolean(garments.data?.items.length) && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {garments.data!.items.map((garment) => (
                  <GarmentCard key={garment.id} garment={garment} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs uppercase tracking-[0.14em] text-ink-muted">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border border-line bg-bone/30 px-5 py-4">
            <div>
              <p className="label-xs">Try before you save</p>
              <p className="text-sm text-ink-soft">Open the fitting room to layer pieces on your avatar.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">3D</Badge>
              <LinkButton to="/fitting-room" size="sm" variant="outline">
                Fitting room
              </LinkButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
