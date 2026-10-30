import { useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { GarmentCard } from '@/components/garment/GarmentCard'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { Input, Select } from '@/components/ui/Field'
import { Button, LinkButton } from '@/components/ui/Button'
import { cn, formatPrice, titleCase } from '@/lib/format'

const categories = [
  { value: '', label: 'All pieces' },
  { value: 'dress', label: 'Dresses' },
  { value: 'top', label: 'Tops' },
  { value: 'shirt', label: 'Shirts' },
  { value: 'knitwear', label: 'Knitwear' },
  { value: 'jacket', label: 'Jackets' },
  { value: 'coat', label: 'Coats' },
  { value: 'suit', label: 'Suits' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'skirt', label: 'Skirts' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'bag', label: 'Bags' },
  { value: 'watch', label: 'Watches' },
  { value: 'accessory', label: 'Accessories' },
]

export function StudioPage() {
  const { gender } = useParams<{ gender: string }>()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)

  const genderStyle = gender === 'men' ? 'menswear' : gender === 'women' ? 'womenswear' : null
  const category = params.get('category') ?? ''
  const search = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'featured'
  const occasion = params.get('occasion') ?? ''

  const queryParams = useMemo(
    () => ({
      gender: genderStyle ?? undefined,
      category: category || undefined,
      q: search || undefined,
      sort,
      page,
      page_size: 12,
    }),
    [genderStyle, category, search, sort, page],
  )

  const garments = useQuery({
    queryKey: qk.garments(queryParams),
    queryFn: () => fetchers.garments(queryParams),
  })

  const looks = useQuery({
    queryKey: qk.looks(genderStyle ?? undefined),
    queryFn: () => fetchers.looks(genderStyle ?? undefined),
  })

  if (gender !== 'women' && gender !== 'men') {
    return <Navigate to="/studio/women" replace />
  }

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  const filteredLook = looks.data?.items.find((look) => !occasion || look.occasion === occasion) ?? looks.data?.items[0]
  const totalPages = garments.data ? Math.max(1, Math.ceil(garments.data.total / garments.data.page_size)) : 1

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow={genderStyle === 'menswear' ? 'Menswear studio' : 'Womenswear studio'}
        title={genderStyle === 'menswear' ? 'Menswear, component by component' : 'Womenswear, component by component'}
        description="Every piece is a working pattern: choose the silhouette, then set colour, fabric, pattern and embroidery independently for each component before trying it on."
        actions={
          <>
            <LinkButton to="/studio/women" size="sm" variant={gender === 'women' ? 'primary' : 'outline'}>
              Women
            </LinkButton>
            <LinkButton to="/studio/men" size="sm" variant={gender === 'men' ? 'primary' : 'outline'}>
              Men
            </LinkButton>
          </>
        }
      />

      {filteredLook && (
        <section className="mt-8 grid gap-6 border border-line bg-bone/40 p-5 md:grid-cols-[auto_1fr_auto] md:items-center md:p-7">
          <div className="flex -space-x-8">
            {filteredLook.garments.slice(0, 3).map((garment) => (
              <GarmentArt key={garment.id} garment={garment} className="h-28 w-20 border border-line bg-paper" showShadow={false} />
            ))}
          </div>
          <div>
            <p className="eyebrow">Look of the day · {titleCase(filteredLook.occasion)}</p>
            <h2 className="display-md mt-1">{filteredLook.name}</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">{filteredLook.description}</p>
            <p className="mt-2 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
              {filteredLook.garments.length} pieces ·{' '}
              {formatPrice(filteredLook.garments.reduce((sum, garment) => sum + garment.base_price_cents, 0))}
            </p>
          </div>
          <LinkButton to={`/garment/${filteredLook.garments[0]?.slug ?? ''}`} variant="secondary" size="sm">
            Open the look
          </LinkButton>
        </section>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-6">
          <Input
            label="Search"
            placeholder="Linen, blazer, watch…"
            value={search}
            onChange={(event) => setFilter('q', event.target.value)}
          />
          <div>
            <p className="label-xs mb-2">Category</p>
            <div className="flex flex-wrap gap-1.5 lg:flex-col lg:items-start">
              {categories.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter('category', item.value)}
                  className={cn(
                    'border px-2.5 py-1.5 text-left text-[0.6875rem] uppercase tracking-[0.1em] transition-colors lg:w-full',
                    category === item.value
                      ? 'border-ink bg-ink text-paper'
                      : 'border-transparent text-ink-muted hover:border-line hover:text-ink',
                  )}
                  aria-pressed={category === item.value}
                >
                  {item.label}
                  {garments.data?.facets.categories?.[item.value] ? (
                    <span className="float-right tabular-nums opacity-60">
                      {garments.data.facets.categories[item.value]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          <Select
            label="Sort"
            value={sort}
            onChange={(event) => setFilter('sort', event.target.value)}
            options={[
              { value: 'featured', label: 'Editorial picks' },
              { value: 'newest', label: 'Newest' },
              { value: 'price_asc', label: 'Price · low to high' },
              { value: 'price_desc', label: 'Price · high to low' },
              { value: 'name', label: 'Alphabetical' },
            ]}
          />
          <div className="border border-line bg-bone/40 p-3 text-xs leading-relaxed text-ink-muted">
            Need something not in the catalogue? Upload a reference garment and we will build the
            technical pack around it.
          </div>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
              {garments.data ? `${garments.data.total} pieces` : 'Loading catalogue'}
              {category && ` · ${titleCase(category)}`}
            </p>
            {(category || search || occasion) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setParams(new URLSearchParams(), { replace: true })
                  setPage(1)
                }}
              >
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
                <div key={index} className="border border-line bg-paper">
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
              title="No pieces match these filters"
              description="Try another category, clear the search, or browse the full collection."
              action={
                <Button variant="outline" size="sm" onClick={() => setParams(new URLSearchParams())}>
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
