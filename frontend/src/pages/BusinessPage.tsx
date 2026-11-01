import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { Button, LinkButton } from '@/components/ui/Button'
import { Badge, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { formatPrice, titleCase } from '@/lib/format'
import { offeringPriceLabel, pricingLabels } from '@/lib/marketplace'

function Stars({ rating, count }: { rating: number; count: number }) {
  const rounded = Math.round(rating)
  return (
    <span className="flex items-center gap-1.5 text-xs" aria-label={`Rated ${rating} out of 5 from ${count} reviews`}>
      <span aria-hidden="true" className="text-gold">
        {'★'.repeat(rounded)}
        <span className="text-line">{'★'.repeat(Math.max(0, 5 - rounded))}</span>
      </span>
      <span className="text-ink-muted">
        {rating ? rating.toFixed(1) : 'No rating'} · {count} review{count === 1 ? '' : 's'}
      </span>
    </span>
  )
}

export function BusinessPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const business = useQuery({
    queryKey: qk.business(slug),
    queryFn: () => fetchers.business(slug),
    enabled: Boolean(slug),
  })

  if (business.isLoading) {
    return (
      <div className="shell py-12">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (business.isError || !business.data) {
    return (
      <div className="shell py-12">
        <ErrorState
          title="This studio could not be loaded"
          message="It may have been deactivated. Browse the directory for other ateliers and printers."
        />
        <div className="mt-4">
          <LinkButton to="/marketplace" variant="outline">
            Back to the directory
          </LinkButton>
        </div>
      </div>
    )
  }

  const data = business.data
  const startRequest = () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/marketplace/${data.slug}`)}`)
      return
    }
    navigate(`/marketplace?business=${data.id}&request=1`)
  }

  return (
    <div className="shell py-10">
      <nav className="mb-5 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
        <Link to="/marketplace" className="hover:text-ink">
          Partners
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span>{data.name}</span>
      </nav>

      <PageHeader
        eyebrow={`${titleCase(data.type)} · ${[data.city, data.country].filter(Boolean).join(', ') || 'Location on request'}`}
        title={data.name}
        description={data.tagline || data.description}
        actions={
          <Button size="sm" onClick={startRequest}>
            Request a quote
          </Button>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section className="border border-line bg-paper p-5">
            <div className="flex flex-wrap items-center gap-2">
              {data.is_verified ? <Badge tone="olive">Verified</Badge> : <Badge tone="neutral">Unverified</Badge>}
              <Stars rating={data.rating} count={data.review_count} />
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {data.description || 'This studio has not added a description yet.'}
            </p>
            {data.services.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {data.services.map((service) => (
                  <Badge key={service} tone="neutral">
                    {service}
                  </Badge>
                ))}
              </div>
            )}
          </section>

          <section className="border border-line bg-paper">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-display text-xl">Services & products</h2>
              <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                {data.offerings.length} listed · prices in {data.currency}
              </p>
            </div>
            {data.offerings.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">
                No priced services listed yet. Send a brief and the studio will quote it.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.offerings.map((offering) => (
                  <li key={offering.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-lg leading-tight">{offering.name}</h3>
                          <Badge tone={offering.kind === 'product' ? 'clay' : 'neutral'}>
                            {titleCase(offering.kind)}
                          </Badge>
                          {offering.category && <Badge tone="neutral">{offering.category}</Badge>}
                        </div>
                        <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-muted">
                          {offering.description}
                        </p>
                        <p className="mt-1 text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                          {pricingLabels[offering.pricing_mode] ?? offering.pricing_mode}
                          {offering.min_quantity > 1 ? ` · min ${offering.min_quantity} ${offering.unit}` : ''}
                          {offering.lead_time_days ? ` · ${offering.lead_time_days} day lead time` : ''}
                        </p>
                      </div>
                      <p className="text-sm">{offeringPriceLabel(offering)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border border-line bg-paper">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-display text-xl">Portfolio</h2>
            </div>
            {data.portfolio.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">
                Work samples will appear here once the studio uploads them.
              </p>
            ) : (
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                {data.portfolio.map((item) => (
                  <article key={item.id} className="border border-line">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-bone text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
                        No image uploaded
                      </div>
                    )}
                    <div className="p-3">
                      <h3 className="font-display text-base leading-tight">{item.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="border border-line bg-paper">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-display text-xl">Reviews</h2>
              <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                Only customers with a completed order can review
              </p>
            </div>
            {data.reviews.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">No reviews yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.reviews.map((review) => (
                  <li key={review.id} className="px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-base">{review.title}</p>
                      <span className="text-xs text-gold" aria-label={`${review.rating} out of 5`}>
                        {'★'.repeat(review.rating)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {review.reviewer_name ?? 'Customer'} · {new Date(review.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed">{review.body}</p>
                    {review.business_reply && (
                      <div className="mt-2 border-l-2 border-line pl-3">
                        <p className="text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">Studio reply</p>
                        <p className="text-sm leading-relaxed">{review.business_reply}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="border border-line bg-paper p-4 text-sm">
            <p className="label-xs">Contact</p>
            <dl className="mt-3 space-y-2 text-xs">
              {data.contact_email && (
                <div>
                  <dt className="text-ink-muted">Email</dt>
                  <dd>
                    <a href={`mailto:${data.contact_email}`} className="underline decoration-line">
                      {data.contact_email}
                    </a>
                  </dd>
                </div>
              )}
              {data.contact_phone && (
                <div>
                  <dt className="text-ink-muted">Phone</dt>
                  <dd>{data.contact_phone}</dd>
                </div>
              )}
              {data.website && (
                <div>
                  <dt className="text-ink-muted">Website</dt>
                  <dd>
                    <a href={data.website} rel="noreferrer noopener" target="_blank" className="underline decoration-line">
                      {data.website}
                    </a>
                  </dd>
                </div>
              )}
              {(data.address_line || data.city) && (
                <div>
                  <dt className="text-ink-muted">Address</dt>
                  <dd>{[data.address_line, data.city, data.postal_code, data.country].filter(Boolean).join(', ')}</dd>
                </div>
              )}
              {data.response_time_hours && (
                <div>
                  <dt className="text-ink-muted">Typical reply</dt>
                  <dd>Within {data.response_time_hours} hours</dd>
                </div>
              )}
              {data.min_order_cents !== null && (
                <div>
                  <dt className="text-ink-muted">Minimum order</dt>
                  <dd>{formatPrice(data.min_order_cents, data.currency)}</dd>
                </div>
              )}
              {data.lead_time_days && (
                <div>
                  <dt className="text-ink-muted">Lead time</dt>
                  <dd>{data.lead_time_days} days</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="border border-line bg-paper p-4">
            <p className="label-xs">Service areas</p>
            {data.service_areas.length === 0 ? (
              <p className="mt-2 text-xs text-ink-muted">Ask the studio about delivery.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-xs">
                {data.service_areas.map((area) => (
                  <li key={area.id}>
                    <p>{area.label}</p>
                    <p className="text-ink-muted">
                      {[area.city, area.country].filter(Boolean).join(', ') || 'Remote'}
                      {area.remote ? ' · works remotely' : ''}
                      {area.radius_km ? ` · ${area.radius_km} km radius` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border border-line bg-bone/40 p-4 text-xs leading-relaxed text-ink-muted">
            <p className="label-xs">How orders work</p>
            <p className="mt-2">
              Submit a brief or attach an approved print package. The studio quotes, you approve the quote and the
              artwork, then follow the ten production stages from order received to completed.
            </p>
            <p className="mt-2">Payment and shipping are arranged directly with the studio.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
