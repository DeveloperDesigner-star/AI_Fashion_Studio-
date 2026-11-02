import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Primitives'
import { IconInfo, IconSearch } from '@/components/ui/Icons'
import { cn } from '@/lib/format'
import { inspiration, type InspirationImage, type InspirationStatus } from '@/lib/inspiration'

const PER_PAGE = 20

function InspirationCard({ image }: { image: InspirationImage }) {
  const [failed, setFailed] = useState(false)
  const ratio = image.width && image.height ? Math.min(1.6, Math.max(0.6, image.width / image.height)) : 1

  return (
    <figure className="group overflow-hidden rounded-md border border-line bg-paper">
      <div className="relative overflow-hidden bg-bone" style={{ aspectRatio: String(ratio) }}>
        {failed ? (
          <div className="flex size-full flex-col items-center justify-center gap-1 px-3 text-center">
            <p className="text-xs font-medium text-ink-soft">Image unavailable</p>
            <p className="text-[0.6875rem] text-ink-muted">Pixabay did not return a renderable file.</p>
          </div>
        ) : (
          <img
            src={image.preview_url}
            alt={image.tags.length ? `Fashion reference: ${image.tags.slice(0, 4).join(', ')}` : 'Fashion reference image'}
            width={image.width || undefined}
            height={image.height || undefined}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-2.5 py-2">
        <p className="min-w-0 truncate text-[0.6875rem] text-ink-muted">by {image.contributor}</p>
        <a
          href={image.source_page}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="shrink-0 text-[0.6875rem] font-medium text-ink-soft underline decoration-line underline-offset-2 hover:text-clay"
        >
          Source
        </a>
      </figcaption>
    </figure>
  )
}

function UnconfiguredNotice({ status }: { status?: InspirationStatus }) {
  return (
    <div className="panel p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm bg-bone text-ink-soft">
          <IconInfo size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Inspiration is not configured</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {status?.note ??
              'Fashion inspiration is not configured on this server. An administrator must set PIXABAY_API_KEY before this section can load.'}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Nothing is shown in its place: this page will not display stock photography from an
            unlicensed source, and it will not fall back to product copy. The rest of the studio is
            unaffected.
          </p>
        </div>
      </div>
    </div>
  )
}

export function InspirationPage() {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('mens fashion')
  const [page, setPage] = useState(1)
  const [order, setOrder] = useState<'popular' | 'latest'>('popular')

  const status = useQuery({ queryKey: ['inspiration', 'status'], queryFn: inspiration.status, staleTime: 300_000 })

  const search = useQuery({
    queryKey: ['inspiration', 'search', query, page, order],
    queryFn: () => inspiration.search({ q: query, page, per_page: PER_PAGE, order }),
    enabled: Boolean(query) && status.data?.configured === true,
    staleTime: 600_000,
  })

  useEffect(() => {
    setPage(1)
  }, [query, order])

  const submit = (next: string) => {
    const cleaned = next.trim()
    if (cleaned.length < 2) return
    setQuery(cleaned)
    setDraft(cleaned)
  }

  const configured = status.data?.configured === true
  const results = search.data?.results ?? []
  const suggestions = status.data?.suggested_searches ?? []

  return (
    <div className="shell py-8 sm:py-10">
      <header className="border-b border-line pb-6">
        <p className="eyebrow">Reference library</p>
        <h1 className="mt-2 display-lg">Fashion inspiration</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Look, borrow a mood, then build something original in the studio. This library is reference
          imagery from Pixabay — it is never sold, never quoted and never carries a verified badge.
        </p>
      </header>

      {status.isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-10 w-full max-w-md" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[3/4] w-full rounded-md" />
            ))}
          </div>
        </div>
      )}

      {status.isError && (
        <div className="mt-6">
          <ErrorState
            title="Could not check inspiration availability"
            message="The configuration endpoint did not respond."
            onRetry={() => void status.refetch()}
          />
        </div>
      )}

      {status.data && !configured && (
        <div className="mt-6">
          <UnconfiguredNotice status={status.data} />
        </div>
      )}

      {configured && (
        <>
          <form
            className="mt-6 flex flex-col gap-2 sm:flex-row"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              submit(draft)
            }}
          >
            <div className="relative flex-1">
              <IconSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                type="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Search inspiration, e.g. shalwar kameez embroidery"
                aria-label="Search fashion inspiration"
                className="h-10 w-full rounded-sm border border-line bg-paper pl-9 pr-3 text-sm placeholder:text-ink-muted focus:border-ink-soft focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                Search
              </Button>
              <label className="sr-only" htmlFor="inspiration-order">
                Sort inspiration
              </label>
              <select
                id="inspiration-order"
                value={order}
                onChange={(event) => setOrder(event.target.value as 'popular' | 'latest')}
                className="h-10 rounded-sm border border-line bg-paper px-3 text-sm focus:border-ink-soft focus:outline-none"
              >
                <option value="popular">Popular</option>
                <option value="latest">Latest</option>
              </select>
            </div>
          </form>

          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested searches">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.query}
                  type="button"
                  onClick={() => submit(suggestion.query)}
                  className={cn(
                    'min-h-9 rounded-full px-3 text-[0.8125rem] font-medium transition-colors',
                    suggestion.query === query
                      ? 'bg-ink text-paper'
                      : 'bg-paper text-ink-soft ring-1 ring-inset ring-line hover:ring-line-strong',
                  )}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}

          {search.isLoading && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="aspect-[3/4] w-full rounded-md" />
              ))}
            </div>
          )}

          {search.isError && (
            <div className="mt-6">
              <ErrorState
                title="Inspiration could not be loaded"
                message="Pixabay did not return a usable response. This is usually a rate limit or a temporary outage."
                onRetry={() => void search.refetch()}
              />
            </div>
          )}

          {!search.isLoading && !search.isError && results.length === 0 && (
            <div className="mt-6">
              <EmptyState
                title={`No inspiration for “${query}”`}
                description="Pixabay returned no images for this search. Try a broader phrase, or pick one of the suggestions above."
              />
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {results.map((image) => (
                  <InspirationCard key={image.id} image={image} />
                ))}
              </div>

              <div className="mt-8 flex flex-col items-center gap-3">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={page === 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!search.data?.has_more || search.isFetching}
                    loading={search.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
                <p className="text-xs text-ink-muted">
                  Page {search.data?.page ?? page}
                  {search.data?.total ? ` · ${search.data.total.toLocaleString()} images available` : ''}
                  {search.data?.cached ? ' · served from cache' : ''}
                </p>
              </div>
            </>
          )}

          <div className="mt-8">
            <Notice tone="info" title="Fashion Inspiration from Pixabay">
              {search.data?.license_note ??
                'Images are served by Pixabay under the Pixabay Content License. They are inspiration only and are never treated as product inventory.'}
            </Notice>
          </div>
        </>
      )}
    </div>
  )
}
