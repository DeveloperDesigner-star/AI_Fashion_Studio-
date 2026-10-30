import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button, LinkButton } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { formatPrice, titleCase } from '@/lib/format'
import type { Business, QuoteRequest } from '@/lib/types'

const businessTypes = [
  { value: 'tailor', label: 'Tailor / made-to-measure' },
  { value: 'printing', label: 'Printing' },
  { value: 'fabric', label: 'Fabric supplier' },
  { value: 'atelier', label: 'Atelier' },
  { value: 'brand', label: 'Brand' },
]

export function MarketplacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [requestTarget, setRequestTarget] = useState<Business | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)

  const [requestForm, setRequestForm] = useState({
    title: '',
    description: '',
    service_type: 'tailoring',
    quantity: '1',
    target_date: '',
    budget: '',
    outfit_id: '',
  })
  const [businessForm, setBusinessForm] = useState({
    name: '',
    type: 'tailor',
    city: '',
    country: '',
    description: '',
    services: '',
    contact_email: '',
    price_from: '',
  })

  const businesses = useQuery({
    queryKey: qk.businesses({ type, q: search }),
    queryFn: () => fetchers.businesses({ type: type || undefined, q: search || undefined }),
  })
  const outfits = useQuery({
    queryKey: qk.outfits,
    queryFn: fetchers.outfits,
    enabled: Boolean(user),
  })

  const createRequest = useMutation({
    mutationFn: () =>
      api.post<QuoteRequest>('/marketplace/requests', {
        business_id: requestTarget?.id ?? null,
        outfit_id: requestForm.outfit_id || null,
        title: requestForm.title.trim(),
        description: requestForm.description.trim(),
        service_type: requestForm.service_type,
        quantity: Number(requestForm.quantity) || 1,
        target_date: requestForm.target_date || null,
        budget_cents: requestForm.budget ? Math.round(Number(requestForm.budget) * 100) : null,
      }),
    onSuccess: (request) => {
      queryClient.invalidateQueries({ queryKey: qk.notifications })
      setRequestOpen(false)
      setRequestTarget(null)
      setRequestForm({ title: '', description: '', service_type: 'tailoring', quantity: '1', target_date: '', budget: '', outfit_id: '' })
      toast.success('Request submitted', `Reference ${request.reference_code}. Track it under Requests.`)
      navigate(`/orders/${request.id}`)
    },
    onError: (error) =>
      toast.error('Could not submit the request', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const createBusiness = useMutation({
    mutationFn: () =>
      api.post<Business>('/marketplace/businesses', {
        name: businessForm.name.trim(),
        type: businessForm.type,
        city: businessForm.city.trim(),
        country: businessForm.country.trim(),
        description: businessForm.description.trim(),
        services: businessForm.services
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        contact_email: businessForm.contact_email || null,
        price_from_cents: businessForm.price_from ? Math.round(Number(businessForm.price_from) * 100) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businesses'] })
      setRegisterOpen(false)
      toast.success('Studio profile submitted', 'It is pending verification and visible in the directory.')
    },
    onError: (error) =>
      toast.error('Could not create the listing', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const openRequest = (business: Business | null) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent('/marketplace')}`)
      return
    }
    setRequestTarget(business)
    setRequestOpen(true)
  }

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Production network"
        title="Ateliers, tailors & printers"
        description="Send a technical pack for quoting, negotiate in one thread and keep the measurements attached to the order."
        actions={
          <Button size="sm" variant="outline" onClick={() => (user ? setRegisterOpen(true) : navigate('/register'))}>
            {user ? 'List your studio' : 'Join as a partner'}
          </Button>
        }
      />

      <div className="mt-6 flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setType('')}
            className={`border px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.12em] ${
              type === '' ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted hover:border-ink'
            }`}
            aria-pressed={type === ''}
          >
            All partners
          </button>
          {businessTypes.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setType(item.value)}
              className={`border px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.12em] ${
                type === item.value ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted hover:border-ink'
              }`}
              aria-pressed={type === item.value}
            >
              {titleCase(item.value)}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Input label="Search" placeholder="City or studio name" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>

      {businesses.isLoading && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-52 w-full" />
          ))}
        </div>
      )}

      {businesses.isError && (
        <div className="mt-6">
          <ErrorState title="The directory could not be loaded" onRetry={() => businesses.refetch()} />
        </div>
      )}

      {!businesses.isLoading && businesses.data?.items.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No partners in this category yet"
            description="Studios that join appear here after verification. You can still submit a request and we will match it manually."
            action={<Button onClick={() => openRequest(null)}>Submit a production request</Button>}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {businesses.data?.items.map((business) => (
          <article key={business.id} className="flex flex-col border border-line bg-paper">
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg leading-tight">{business.name}</h2>
                  {business.is_verified && <Badge tone="olive">Verified</Badge>}
                </div>
                <p className="mt-1 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
                  {titleCase(business.type)} · {business.city || 'Location on request'}
                  {business.country ? `, ${business.country}` : ''}
                </p>
              </div>
              {business.price_from_cents !== null && (
                <div className="text-right">
                  <p className="text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">From</p>
                  <p className="text-sm">{formatPrice(business.price_from_cents, business.currency)}</p>
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col p-4">
              <p className="text-xs leading-relaxed text-ink-muted">{business.description}</p>
              {business.services.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {business.services.map((service) => (
                    <Badge key={service} tone="neutral">
                      {service}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                <Button size="sm" onClick={() => openRequest(business)}>
                  Request a quote
                </Button>
                {business.contact_email && (
                  <a
                    href={`mailto:${business.contact_email}`}
                    className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted hover:text-ink"
                  >
                    Email
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-12 grid gap-6 border border-line bg-bone/40 p-6 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <p className="eyebrow">For workshops</p>
          <h2 className="display-md mt-2">Receive technical packs, not screenshots.</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">
            Each request arrives with the outfit specification, component fabrics, measurements and
            the generated print proof where relevant. Quote directly in the platform and keep the
            conversation with the order.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button variant="outline" onClick={() => (user ? setRegisterOpen(true) : navigate('/register'))}>
            Create a studio profile
          </Button>
          <LinkButton to="/orders" variant="ghost">
            View requests
          </LinkButton>
        </div>
      </section>

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title={requestTarget ? `Request a quote · ${requestTarget.name}` : 'Production request'}
        description="Attach a saved outfit so the workshop sees the exact components and measurements."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createRequest.mutate()}
              loading={createRequest.isPending}
              disabled={requestForm.title.trim().length < 3}
            >
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={requestForm.title}
            onChange={(event) => setRequestForm({ ...requestForm, title: event.target.value })}
            placeholder="Silk column gown for a wedding"
            maxLength={160}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Service"
              value={requestForm.service_type}
              onChange={(event) => setRequestForm({ ...requestForm, service_type: event.target.value })}
              options={[
                { value: 'tailoring', label: 'Tailoring' },
                { value: 'printing', label: 'Printing' },
                { value: 'fabric', label: 'Fabric sourcing' },
                { value: 'sampling', label: 'Sampling' },
              ]}
            />
            <Input
              label="Quantity"
              type="number"
              min="1"
              max="500"
              value={requestForm.quantity}
              onChange={(event) => setRequestForm({ ...requestForm, quantity: event.target.value })}
            />
            <Input
              label="Target date"
              type="date"
              value={requestForm.target_date}
              onChange={(event) => setRequestForm({ ...requestForm, target_date: event.target.value })}
            />
            <Input
              label="Budget (optional)"
              type="number"
              min="0"
              suffix="USD"
              value={requestForm.budget}
              onChange={(event) => setRequestForm({ ...requestForm, budget: event.target.value })}
            />
          </div>
          {outfits.data?.items.length ? (
            <Select
              label="Attach a saved outfit"
              value={requestForm.outfit_id}
              onChange={(event) => setRequestForm({ ...requestForm, outfit_id: event.target.value })}
              options={[
                { value: '', label: 'No outfit attached' },
                ...outfits.data.items.map((outfit) => ({
                  value: outfit.id,
                  label: `${outfit.name} · ${outfit.items.length} pieces`,
                })),
              ]}
            />
          ) : (
            <p className="text-xs text-ink-muted">
              You have no saved outfits yet. Requests can still be submitted with notes.
            </p>
          )}
          <Textarea
            label="Brief"
            value={requestForm.description}
            onChange={(event) => setRequestForm({ ...requestForm, description: event.target.value })}
            placeholder="Fabric preference, deadlines, fittings, delivery city…"
            maxLength={4000}
          />
        </div>
      </Modal>

      <Modal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title="List your studio"
        description="Listings are reviewed before verification. Your account gains business tools for incoming requests."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRegisterOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createBusiness.mutate()}
              loading={createBusiness.isPending}
              disabled={businessForm.name.trim().length < 2}
            >
              Submit listing
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Studio name"
            value={businessForm.name}
            onChange={(event) => setBusinessForm({ ...businessForm, name: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Type"
              value={businessForm.type}
              onChange={(event) => setBusinessForm({ ...businessForm, type: event.target.value })}
              options={businessTypes.map((item) => ({ value: item.value, label: item.label }))}
            />
            <Input
              label="Starting price"
              type="number"
              min="0"
              suffix="USD"
              value={businessForm.price_from}
              onChange={(event) => setBusinessForm({ ...businessForm, price_from: event.target.value })}
            />
            <Input
              label="City"
              value={businessForm.city}
              onChange={(event) => setBusinessForm({ ...businessForm, city: event.target.value })}
            />
            <Input
              label="Country"
              value={businessForm.country}
              onChange={(event) => setBusinessForm({ ...businessForm, country: event.target.value })}
            />
          </div>
          <Input
            label="Contact email"
            type="email"
            value={businessForm.contact_email}
            onChange={(event) => setBusinessForm({ ...businessForm, contact_email: event.target.value })}
          />
          <Input
            label="Services"
            hint="Comma separated: tailoring, hand embroidery, digital printing"
            value={businessForm.services}
            onChange={(event) => setBusinessForm({ ...businessForm, services: event.target.value })}
          />
          <Textarea
            label="Description"
            value={businessForm.description}
            onChange={(event) => setBusinessForm({ ...businessForm, description: event.target.value })}
            maxLength={2000}
          />
        </div>
      </Modal>
    </div>
  )
}
