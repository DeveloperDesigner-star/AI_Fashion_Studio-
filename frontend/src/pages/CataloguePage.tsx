import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import { Button, LinkButton } from '@/components/ui/Button'
import { EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Primitives'
import { IconChevronRight, IconSearch } from '@/components/ui/Icons'
import { cn } from '@/lib/format'
import {
  DEPARTMENTS,
  categoryCount,
  categoryValues,
  findDepartment,
  paramsFromQuery,
  queryFromParams,
} from '@/lib/merchandising'

const PAGE_SIZE = 24

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name' },
] as const

export function CataloguePage() {
  const [params, setParams] = useSearchParams()
  const query = queryFromParams(params)
  const [page, setPage] = useState(1)
  const [searchDraft, setSearchDraft] = useState(query.q)

  const department = findDepartment(query.department) ?? DEPARTMENTS[0]
  const category = department.categories.find((entry) => entry.value === query.category)

  const apiCategories = category ? categoryValues(category).join(',') : ''

  const garments = useQuery({
    queryKey: qk.garments({
      department: query.department,
      category: apiCategories,
      q: query.q,
      sort: query.sort,
      page,
    }),
    queryFn: () =>
      fetchers.garments({
        category: apiCategories || undefined,
        q: query.q || undefined,
        sort: query.sort,
        page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  const counts = useMemo(() => garments.data?.facets?.categories ?? {}, [garments.data])

  const update = (next: Partial<typeof query>, resetPage = true) => {
    if (resetPage) setPage(1)
    const merged = { ...query, ...next }
    setParams(paramsFromQuery(merged), { replace: true })
  }

  const total = garments.data?.total ?? 0
  const items = garments.data?.items ?? []
  const hasMore = items.length < total

  return (
    <div className="shell py-8 sm:py-10">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span>Catalogue</span>
            <IconChevronRight size={12} />
            <span className="text-ink">{department.label}</span>
            {category && (
              <>
                <IconChevronRight size={12} />
                <span className="text-ink">{category.label}</span>
              </>
            )}
          </nav>
          <h1 className="display-lg">{category ? category.label : department.label}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{department.description}</p>
        </div>
        <div className="text-sm text-ink-muted">
          {garments.isLoading ? 'Loading…' : `${total} product${total === 1 ? '' : 's'}`}
        </div>
      </header>

      {/* Departments ------------------------------------------------------ */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line pb-0 no-scrollbar">
        {DEPARTMENTS.map((entry) => {
          const active = entry.id === department.id
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => update({ department: entry.id, category: '' })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {entry.label}
              {entry.planned && (
                <span className="ml-1.5 rounded-full bg-bone px-1.5 py-0.5 text-[0.625rem] font-medium text-ink-muted">
                  Soon
                </span>
              )}
            </button>
          )
        })}
      </div>

      {department.planned ? (
        <div className="mt-6">
          <EmptyState
            title={`${department.label} is not stocked yet`}
            description="This department is planned. It will appear here when real blanks, photographs and print areas are added — nothing is listed early to look bigger than it is."
            action={<LinkButton to="/catalogue?department=clothing">Browse clothing</LinkButton>}
          />
        </div>
      ) : (
        <>
          {/* Category chips ---------------------------------------------- */}
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => update({ category: '' })}
              className={cn(
                'min-h-9 rounded-full px-3 text-[0.8125rem] font-medium transition-colors',
                query.category === ''
                  ? 'bg-ink text-paper'
                  : 'bg-paper text-ink-soft ring-1 ring-inset ring-line hover:ring-line-strong',
              )}
            >
              All
            </button>
            {department.categories.map((entry) => {
              const count = categoryCount(counts, entry)
              const active = entry.value === query.category
              return (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => update({ category: entry.value })}
                  disabled={count === 0 && !active}
                  className={cn(
                    'min-h-9 rounded-full px-3 text-[0.8125rem] font-medium transition-colors',
                    active
                      ? 'bg-ink text-paper'
                      : count === 0
                        ? 'cursor-not-allowed bg-bone text-ink-muted/60'
                        : 'bg-paper text-ink-soft ring-1 ring-inset ring-line hover:ring-line-strong',
                  )}
                >
                  {entry.label}
                  {count > 0 && <span className="ml-1.5 tabular-nums opacity-60">{count}</span>}
                </button>
              )
            })}
          </div>

          {/* Toolbar ------------------------------------------------------ */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              className="relative flex-1"
              onSubmit={(event) => {
                event.preventDefault()
                update({ q: searchDraft })
              }}
              role="search"
            >
              <IconSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="h-10 w-full rounded-sm border border-line bg-paper pl-9 pr-20 text-sm placeholder:text-ink-muted focus:border-ink-soft focus:outline-none"
              />
              <button
                type="submit"
                className="absolute right-1 top-1 h-8 rounded-xs px-3 text-xs font-medium text-ink-soft hover:bg-bone"
              >
                Search
              </button>
            </form>

            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Sort products</span>
              <select
                value={query.sort}
                onChange={(event) => update({ sort: event.target.value as typeof query.sort })}
                className="h-10 rounded-sm border border-line bg-paper px-3 text-sm focus:border-ink-soft focus:outline-none"
              >
                {SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Grid --------------------------------------------------------- */}
          {garments.isError && (
            <div className="mt-6">
              <ErrorState
                title="The catalogue could not load"
                message="The product service did not respond. Check your connection and try again."
                onRetry={() => void garments.refetch()}
              />
            </div>
          )}

          {garments.isLoading && (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="space-y-2.5">
                  <Skeleton className="aspect-[4/5] w-full rounded-md" />
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {!garments.isLoading && !garments.isError && items.length === 0 && (
            <div className="mt-6">
              <EmptyState
                title={query.q ? `No products match “${query.q}”` : 'Nothing here yet'}
                description={
                  query.q
                    ? 'Try a different term, or clear the search and browse the category.'
                    : 'This category has no products listed. Nothing is shown to pad the page out.'
                }
                action={
                  query.q || category ? (
                    <Button variant="secondary" onClick={() => update({ q: '', category: '' })}>
                      Clear filters
                    </Button>
                  ) : (
                    <LinkButton to="/catalogue?department=accessories">Try accessories</LinkButton>
                  )
                }
              />
            </div>
          )}

          {items.length > 0 && (
            <>
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((garment, index) => (
                  <ProductCard
                    key={garment.id}
                    garment={garment}
                    facets={garments.data?.facets}
                    priority={index < 4}
                  />
                ))}
              </div>

              <div className="mt-10 flex flex-col items-center gap-3">
                {hasMore && (
                  <Button
                    variant="secondary"
                    onClick={() => setPage((current) => current + 1)}
                    loading={garments.isFetching}
                  >
                    Load more
                  </Button>
                )}
                <p className="text-xs text-ink-muted">
                  Showing {items.length} of {total}
                </p>
              </div>
            </>
          )}

          <div className="mt-8">
            <Notice tone="warn" title="Demonstration catalogue">
              Products, prices and copy are sample data authored for this platform — they are not supplier
              listings and no manufacturer relationship is implied. Photographs are rendered garment previews,
              not pictures of a physical sample.
            </Notice>
          </div>
        </>
      )}
    </div>
  )
}
