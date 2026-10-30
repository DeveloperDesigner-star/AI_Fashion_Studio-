import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { GarmentCard } from '@/components/garment/GarmentCard'
import { LinkButton } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { cn } from '@/lib/format'
import { accessoriesCategories, categoryLabel, styleLabel } from '@/lib/catalog'
import { useFavorites } from '@/hooks/useFavorites'

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name' },
]

export function AccessoriesPage() {
  const [category, setCategory] = useState('')
  const [style, setStyle] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('featured')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const { signedIn } = useFavorites()

  const params = useMemo(
    () => ({
      slot: 'footwear,bag,watch,headwear,accessory',
      category: category || undefined,
      style: style || undefined,
      q: search || undefined,
      sort,
      favorites_only: favoritesOnly || undefined,
      page_size: 36,
    }),
    [category, style, search, sort, favoritesOnly],
  )

  const garments = useQuery({
    queryKey: qk.garments(params),
    queryFn: () => fetchers.garments(params),
  })
  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: fetchers.taxonomy, staleTime: 600_000 })

  const facets = garments.data?.facets
  const categories = accessoriesCategories(taxonomy.data)
  const styles = (taxonomy.data?.styles ?? []).filter((entry) => (facets?.styles?.[entry.value] ?? 0) > 0)

  const reset = () => {
    setCategory('')
    setStyle('')
    setSearch('')
    setFavoritesOnly(false)
  }

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Shoes & accessories"
        title="The finishing layer"
        description="Sneakers and khussa, heels and flats, bags, watches, belts, caps, scarves, jewellery and eyewear. Accessories stack in the fitting room — they never replace each other."
        actions={
          <>
            <LinkButton to="/studio/women" size="sm" variant="outline">
              Womenswear
            </LinkButton>
            <LinkButton to="/studio/men" size="sm" variant="outline">
              Menswear
            </LinkButton>
            <LinkButton to="/fitting-room" size="sm">
              Fitting room
            </LinkButton>
          </>
        }
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[248px_1fr]">
        <aside className="space-y-6">
          <Input
            label="Search"
            placeholder="Sneaker, khussa, handbag…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label-xs">Category</p>
              <button
                type="button"
                onClick={() => setCategory('')}
                className={cn(
                  'text-[0.5625rem] uppercase tracking-[0.1em] hover:text-ink',
                  category ? 'text-clay' : 'text-ink-muted/60',
                )}
              >
                All
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 lg:flex-col lg:items-stretch">
              {categories.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setCategory(category === entry.value ? '' : entry.value)}
                  aria-pressed={category === entry.value}
                  className={cn(
                    'flex items-center justify-between gap-2 border px-2.5 py-1.5 text-left text-[0.6875rem] uppercase tracking-[0.1em]',
                    category === entry.value
                      ? 'border-ink bg-ink text-paper'
                      : 'border-transparent text-ink-muted hover:border-line hover:text-ink',
                  )}
                >
                  <span className="truncate">{categoryLabel(entry.value, facets)}</span>
                  <span className="shrink-0 tabular-nums opacity-60">
                    {facets?.categories?.[entry.value] ?? entry.count ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label-xs mb-2">Style</p>
            <div className="flex flex-wrap gap-1.5">
              {styles.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setStyle(style === entry.value ? '' : entry.value)}
                  aria-pressed={style === entry.value}
                  className={cn(
                    'border px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em]',
                    style === entry.value
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line text-ink-muted hover:border-ink',
                  )}
                >
                  {styleLabel(entry.value, facets)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => signedIn && setFavoritesOnly((current) => !current)}
            aria-pressed={favoritesOnly}
            disabled={!signedIn}
            className={cn(
              'flex w-full items-center justify-between border px-3 py-2 text-[0.625rem] uppercase tracking-[0.12em]',
              favoritesOnly
                ? 'border-ink bg-ink text-paper'
                : 'border-line text-ink-muted hover:border-ink disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <span>Saved pieces</span>
            <span>{signedIn ? (favoritesOnly ? '♥' : '♡') : 'Sign in'}</span>
          </button>

          <Select label="Sort" value={sort} onChange={(event) => setSort(event.target.value)} options={SORT_OPTIONS} />
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
              {garments.data ? `${garments.data.total} pieces` : 'Loading accessories'}
              {category && ` · ${categoryLabel(category, facets)}`}
            </p>
            {(category || style || search || favoritesOnly) && (
              <button
                type="button"
                onClick={reset}
                className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted underline decoration-line underline-offset-4 hover:text-ink"
              >
                Clear filters
              </button>
            )}
          </div>

          {garments.isError && (
            <ErrorState
              title="Accessories could not be loaded"
              message="Check that the API server is running, then retry."
              onRetry={() => garments.refetch()}
            />
          )}

          {garments.isLoading && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="border border-line bg-paper">
                  <Skeleton className="aspect-[4/5] w-full" />
                  <div className="space-y-2 border-t border-line p-4">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!garments.isLoading && garments.data?.items.length === 0 && (
            <EmptyState
              title={favoritesOnly ? 'No saved pieces yet' : 'Nothing matches these filters'}
              description={
                favoritesOnly
                  ? 'Tap the heart on any accessory to keep it here.'
                  : 'Try another category, clear the style filter, or reset the search.'
              }
              action={<LinkButton to="/studio/women" size="sm" variant="outline">Browse womenswear</LinkButton>}
            />
          )}

          {!garments.isLoading && Boolean(garments.data?.items.length) && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {garments.data!.items.map((garment) => (
                <GarmentCard key={garment.id} garment={garment} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
