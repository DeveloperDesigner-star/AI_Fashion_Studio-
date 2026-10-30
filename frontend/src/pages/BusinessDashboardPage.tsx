import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'
import { Button, LinkButton } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Primitives'
import { formatPrice, titleCase } from '@/lib/format'
import { offeringPriceLabel, productionLabel, productionTone } from '@/lib/marketplace'
import type { BusinessDetail, BusinessType } from '@/lib/types'

const businessTypes: { value: BusinessType; label: string }[] = [
  { value: 'tailor', label: 'Tailor / made-to-measure' },
  { value: 'printing', label: 'Printing' },
  { value: 'fabric', label: 'Fabric supplier' },
  { value: 'atelier', label: 'Atelier' },
  { value: 'brand', label: 'Brand' },
  { value: 'designer', label: 'Designer' },
  { value: 'manufacturer', label: 'Manufacturer' },
]

const emptyProfile = {
  name: '',
  type: 'tailor' as BusinessType,
  tagline: '',
  description: '',
  city: '',
  country: '',
  address_line: '',
  postal_code: '',
  services: '',
  contact_email: '',
  contact_phone: '',
  website: '',
  price_from: '',
  response_time_hours: '',
  min_order: '',
  lead_time_days: '',
}

type ProfileForm = typeof emptyProfile

function profileFromBusiness(business: BusinessDetail): ProfileForm {
  return {
    name: business.name,
    type: business.type,
    tagline: business.tagline,
    description: business.description,
    city: business.city,
    country: business.country,
    address_line: business.address_line,
    postal_code: business.postal_code,
    services: business.services.join(', '),
    contact_email: business.contact_email ?? '',
    contact_phone: business.contact_phone ?? '',
    website: business.website ?? '',
    price_from: business.price_from_cents !== null ? String(business.price_from_cents / 100) : '',
    response_time_hours: business.response_time_hours ? String(business.response_time_hours) : '',
    min_order: business.min_order_cents !== null ? String(business.min_order_cents / 100) : '',
    lead_time_days: business.lead_time_days ? String(business.lead_time_days) : '',
  }
}

function profilePayload(form: ProfileForm) {
  return {
    name: form.name.trim(),
    type: form.type,
    tagline: form.tagline.trim(),
    description: form.description.trim(),
    city: form.city.trim(),
    country: form.country.trim(),
    address_line: form.address_line.trim(),
    postal_code: form.postal_code.trim(),
    services: form.services.split(',').map((item) => item.trim()).filter(Boolean),
    contact_email: form.contact_email.trim() || null,
    contact_phone: form.contact_phone.trim() || null,
    website: form.website.trim() || null,
    price_from_cents: form.price_from ? Math.round(Number(form.price_from) * 100) : null,
    response_time_hours: form.response_time_hours ? Number(form.response_time_hours) : null,
    min_order_cents: form.min_order ? Math.round(Number(form.min_order) * 100) : null,
    lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : null,
  }
}

export function BusinessDashboardPage() {
  const queryClient = useQueryClient()
  const refreshUser = useAuthStore((state) => state.refreshUser)
  const [selectedId, setSelectedId] = useState('')
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile)
  const [offeringOpen, setOfferingOpen] = useState(false)
  const [areaOpen, setAreaOpen] = useState(false)
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const [offeringForm, setOfferingForm] = useState({
    kind: 'service',
    name: '',
    description: '',
    category: '',
    pricing_mode: 'fixed',
    price: '',
    unit: 'piece',
    min_quantity: '1',
    lead_time_days: '',
  })
  const [areaForm, setAreaForm] = useState({ label: '', city: '', country: '', radius_km: '', remote: false })
  const [portfolioForm, setPortfolioForm] = useState({ title: '', description: '' })

  const mine = useQuery({ queryKey: qk.myBusinesses, queryFn: fetchers.myBusinesses })
  const businesses = useMemo(() => mine.data ?? [], [mine.data])
  const selected = useMemo(
    () => businesses.find((business) => business.id === selectedId) ?? businesses[0],
    [businesses, selectedId],
  )

  const incoming = useQuery({
    queryKey: qk.requests('incoming'),
    queryFn: () => fetchers.requests('incoming'),
    enabled: Boolean(selected),
  })

  useEffect(() => {
    if (selected) setProfile(profileFromBusiness(selected))
  }, [selected])

  const refresh = (business: BusinessDetail) => {
    queryClient.invalidateQueries({ queryKey: qk.myBusinesses })
    queryClient.invalidateQueries({ queryKey: qk.business(business.slug) })
  }

  const saveProfile = useMutation({
    mutationFn: () => fetchers.updateBusiness(selected!.id, profilePayload(profile)),
    onSuccess: () => {
      if (selected) refresh(selected)
      toast.success('Studio profile saved')
    },
    onError: (error) =>
      toast.error('Profile not saved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const createOffering = useMutation({
    mutationFn: () =>
      fetchers.createOffering(selected!.id, {
        kind: offeringForm.kind,
        name: offeringForm.name.trim(),
        description: offeringForm.description.trim(),
        category: offeringForm.category.trim().toLowerCase(),
        pricing_mode: offeringForm.pricing_mode,
        price_cents: offeringForm.price ? Math.round(Number(offeringForm.price) * 100) : null,
        unit: offeringForm.unit || 'piece',
        min_quantity: Number(offeringForm.min_quantity) || 1,
        lead_time_days: offeringForm.lead_time_days ? Number(offeringForm.lead_time_days) : null,
      }),
    onSuccess: () => {
      if (selected) refresh(selected)
      setOfferingOpen(false)
      setOfferingForm({
        kind: 'service',
        name: '',
        description: '',
        category: '',
        pricing_mode: 'fixed',
        price: '',
        unit: 'piece',
        min_quantity: '1',
        lead_time_days: '',
      })
      toast.success('Offering added')
    },
    onError: (error) =>
      toast.error('Offering not added', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const toggleOffering = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      fetchers.updateOffering(id, { is_active: active }),
    onSuccess: () => selected && refresh(selected),
  })

  const removeOffering = useMutation({
    mutationFn: (id: string) => fetchers.deleteOffering(id),
    onSuccess: () => selected && refresh(selected),
  })

  const createArea = useMutation({
    mutationFn: () =>
      fetchers.createServiceArea(selected!.id, {
        label: areaForm.label.trim(),
        city: areaForm.city.trim(),
        country: areaForm.country.trim(),
        radius_km: areaForm.radius_km ? Number(areaForm.radius_km) : null,
        remote: areaForm.remote,
      }),
    onSuccess: () => {
      if (selected) refresh(selected)
      setAreaOpen(false)
      setAreaForm({ label: '', city: '', country: '', radius_km: '', remote: false })
    },
  })

  const removeArea = useMutation({
    mutationFn: (id: string) => fetchers.deleteServiceArea(id),
    onSuccess: () => selected && refresh(selected),
  })

  const createPortfolio = useMutation({
    mutationFn: () =>
      fetchers.createPortfolioItem(selected!.id, {
        title: portfolioForm.title.trim(),
        description: portfolioForm.description.trim(),
      }),
    onSuccess: () => {
      if (selected) refresh(selected)
      setPortfolioOpen(false)
      setPortfolioForm({ title: '', description: '' })
      toast.success('Portfolio item added', 'Upload an image from the portfolio list.')
    },
  })

  const uploadImage = useMutation({
    mutationFn: ({ itemId, file }: { itemId: string; file: File }) =>
      fetchers.uploadPortfolioImage(selected!.id, itemId, file),
    onSuccess: () => {
      if (selected) refresh(selected)
      toast.success('Portfolio image uploaded')
    },
    onError: (error) =>
      toast.error('Image not uploaded', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const removePortfolio = useMutation({
    mutationFn: (id: string) => fetchers.deletePortfolioItem(id),
    onSuccess: () => selected && refresh(selected),
  })

  const createBusiness = useMutation({
    mutationFn: () => api.post('/marketplace/businesses', profilePayload(profile)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.myBusinesses })
      void refreshUser()
      setProfile(emptyProfile)
      toast.success('Studio profile submitted', 'It is visible in the directory and can be edited here.')
    },
    onError: (error) =>
      toast.error('Studio not created', error instanceof ApiError ? error.message : 'Try again.'),
  })

  if (mine.isLoading) {
    return (
      <div className="shell py-12">
        <LoadingBlock label="Loading your studio" rows={4} />
      </div>
    )
  }

  if (mine.isError) {
    return (
      <div className="shell py-12">
        <ErrorState title="Your studio profile could not be loaded" onRetry={() => mine.refetch()} />
      </div>
    )
  }

  if (!selected) {
    return (
      <div className="shell py-10">
        <PageHeader
          eyebrow="For workshops"
          title="Open your studio"
          description="List services, products, service areas and portfolio work. Customers can then send briefs or approved print packages."
        />
        <ProfileFormFields form={profile} setForm={setProfile} />
        <div className="mt-4">
          <Button onClick={() => createBusiness.mutate()} loading={createBusiness.isPending} disabled={profile.name.trim().length < 2}>
            Create studio profile
          </Button>
        </div>
      </div>
    )
  }

  const orders = (incoming.data?.items ?? []).filter((order) => order.business?.id === selected.id)
  const openOrders = orders.filter((order) => order.production_status !== 'completed' && order.production_status !== 'cancelled')

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Business dashboard"
        title={selected.name}
        description="Keep pricing, service areas and portfolio work current. Production orders arrive in the requests list."
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton to={`/marketplace/${selected.slug}`} size="sm" variant="outline">
              View public page
            </LinkButton>
            <LinkButton to="/orders" size="sm">
              Orders
            </LinkButton>
          </div>
        }
      />

      {businesses.length > 1 && (
        <div className="mt-5 max-w-sm">
          <Select
            label="Studio"
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
            options={businesses.map((business) => ({ value: business.id, label: business.name }))}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-line bg-paper p-4">
          <p className="label-xs">Rating</p>
          <p className="mt-1 font-display text-2xl">{selected.rating ? selected.rating.toFixed(1) : '—'}</p>
          <p className="text-xs text-ink-muted">{selected.review_count} reviews</p>
        </div>
        <div className="border border-line bg-paper p-4">
          <p className="label-xs">Listings</p>
          <p className="mt-1 font-display text-2xl">{selected.offerings.length}</p>
          <p className="text-xs text-ink-muted">services and products</p>
        </div>
        <div className="border border-line bg-paper p-4">
          <p className="label-xs">Open orders</p>
          <p className="mt-1 font-display text-2xl">{openOrders.length}</p>
          <p className="text-xs text-ink-muted">in production</p>
        </div>
        <div className="border border-line bg-paper p-4">
          <p className="label-xs">Status</p>
          <p className="mt-1">
            <Badge tone={selected.is_verified ? 'olive' : 'neutral'}>
              {selected.is_verified ? 'Verified' : 'Pending verification'}
            </Badge>
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {selected.is_active ? 'Accepting requests' : 'Listing hidden'}
          </p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-2xl">Profile</h2>
        <ProfileFormFields form={profile} setForm={setProfile} />
        <div className="mt-3 flex gap-2">
          <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
            Save profile
          </Button>
          <Button
            variant="ghost"
            onClick={() => setProfile(profileFromBusiness(selected))}
          >
            Reset
          </Button>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Services & products</h2>
            <p className="text-xs text-ink-muted">Fixed, from, per-unit or quote-only pricing.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOfferingOpen(true)}>
            Add offering
          </Button>
        </div>
        {selected.offerings.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No offerings yet"
              description="Add at least one priced service so customers know what they can order."
              action={<Button onClick={() => setOfferingOpen(true)}>Add offering</Button>}
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line border border-line bg-paper">
            {selected.offerings.map((offering) => (
              <li key={offering.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg leading-tight">{offering.name}</p>
                    <Badge tone={offering.kind === 'product' ? 'clay' : 'neutral'}>{titleCase(offering.kind)}</Badge>
                    {!offering.is_active && <Badge tone="danger">Hidden</Badge>}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {offeringPriceLabel(offering)}
                    {offering.min_quantity > 1 ? ` · min ${offering.min_quantity} ${offering.unit}` : ''}
                    {offering.lead_time_days ? ` · ${offering.lead_time_days} days` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleOffering.mutate({ id: offering.id, active: !offering.is_active })}
                  >
                    {offering.is_active ? 'Hide' : 'Show'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeOffering.mutate(offering.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Service areas</h2>
            <p className="text-xs text-ink-muted">Where you can deliver, or that you work remotely.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAreaOpen(true)}>
            Add area
          </Button>
        </div>
        {selected.service_areas.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No service areas listed yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {selected.service_areas.map((area) => (
              <li key={area.id} className="flex items-start justify-between gap-3 border border-line bg-paper p-4">
                <div>
                  <p className="text-sm">{area.label}</p>
                  <p className="text-xs text-ink-muted">
                    {[area.city, area.country].filter(Boolean).join(', ') || 'Remote'}
                    {area.radius_km ? ` · ${area.radius_km} km` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted hover:text-ink"
                  onClick={() => removeArea.mutate(area.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Portfolio</h2>
            <p className="text-xs text-ink-muted">Only upload work you own. No stock or catalogue imagery.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPortfolioOpen(true)}>
            Add item
          </Button>
        </div>
        {selected.portfolio.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No portfolio items yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {selected.portfolio.map((item) => (
              <li key={item.id} className="border border-line bg-paper">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-bone text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
                    No image
                  </div>
                )}
                <div className="p-3">
                  <p className="font-display text-base">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{item.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer border border-line px-2 py-1 text-[0.5625rem] uppercase tracking-[0.12em] hover:border-ink">
                      Upload image
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        aria-label={`Upload image for ${item.title}`}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) uploadImage.mutate({ itemId: item.id, file })
                          event.target.value = ''
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted hover:text-ink"
                      onClick={() => removePortfolio.mutate(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Recent orders</h2>
          <Link to="/orders" className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted hover:text-ink">
            All orders
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No orders for this studio yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border border-line bg-paper">
            {orders.slice(0, 6).map((order) => (
              <li key={order.id} className="px-4 py-3">
                <Link to={`/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-2 hover:text-clay">
                  <div>
                    <p className="font-mono text-[0.6875rem] text-ink-muted">{order.reference_code}</p>
                    <p className="font-display text-base">{order.title}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.agreed_amount_cents !== null && (
                      <span className="text-xs text-ink-muted">
                        {formatPrice(order.agreed_amount_cents, order.agreed_currency ?? order.currency)}
                      </span>
                    )}
                    <Badge tone={productionTone(order.production_status)}>
                      {productionLabel(order.production_status)}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={offeringOpen}
        onClose={() => setOfferingOpen(false)}
        title="Add an offering"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOfferingOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createOffering.mutate()}
              loading={createOffering.isPending}
              disabled={offeringForm.name.trim().length < 2}
            >
              Add offering
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Kind"
              value={offeringForm.kind}
              onChange={(event) => setOfferingForm({ ...offeringForm, kind: event.target.value })}
              options={[
                { value: 'service', label: 'Service' },
                { value: 'product', label: 'Product' },
              ]}
            />
            <Input
              label="Name"
              value={offeringForm.name}
              onChange={(event) => setOfferingForm({ ...offeringForm, name: event.target.value })}
              maxLength={160}
            />
            <Select
              label="Pricing"
              value={offeringForm.pricing_mode}
              onChange={(event) => setOfferingForm({ ...offeringForm, pricing_mode: event.target.value })}
              options={[
                { value: 'fixed', label: 'Fixed price' },
                { value: 'from', label: 'From' },
                { value: 'per_unit', label: 'Per unit' },
                { value: 'quote', label: 'Quote on request' },
              ]}
            />
            <Input
              label="Price"
              type="number"
              min="0"
              suffix={selected.currency}
              value={offeringForm.price}
              onChange={(event) => setOfferingForm({ ...offeringForm, price: event.target.value })}
            />
            <Input
              label="Unit"
              value={offeringForm.unit}
              onChange={(event) => setOfferingForm({ ...offeringForm, unit: event.target.value })}
            />
            <Input
              label="Minimum quantity"
              type="number"
              min="1"
              value={offeringForm.min_quantity}
              onChange={(event) => setOfferingForm({ ...offeringForm, min_quantity: event.target.value })}
            />
            <Input
              label="Lead time (days)"
              type="number"
              min="1"
              value={offeringForm.lead_time_days}
              onChange={(event) => setOfferingForm({ ...offeringForm, lead_time_days: event.target.value })}
            />
            <Input
              label="Category"
              value={offeringForm.category}
              onChange={(event) => setOfferingForm({ ...offeringForm, category: event.target.value })}
            />
          </div>
          <Textarea
            label="Description"
            value={offeringForm.description}
            onChange={(event) => setOfferingForm({ ...offeringForm, description: event.target.value })}
            maxLength={2000}
          />
        </div>
      </Modal>

      <Modal
        open={areaOpen}
        onClose={() => setAreaOpen(false)}
        title="Add a service area"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAreaOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createArea.mutate()} loading={createArea.isPending} disabled={areaForm.label.trim().length < 2}>
              Add area
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Label"
            value={areaForm.label}
            onChange={(event) => setAreaForm({ ...areaForm, label: event.target.value })}
            placeholder="Karachi metro"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="City" value={areaForm.city} onChange={(event) => setAreaForm({ ...areaForm, city: event.target.value })} />
            <Input label="Country" value={areaForm.country} onChange={(event) => setAreaForm({ ...areaForm, country: event.target.value })} />
            <Input
              label="Radius (km)"
              type="number"
              min="0"
              value={areaForm.radius_km}
              onChange={(event) => setAreaForm({ ...areaForm, radius_km: event.target.value })}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-xs">
              <input
                type="checkbox"
                checked={areaForm.remote}
                onChange={(event) => setAreaForm({ ...areaForm, remote: event.target.checked })}
              />
              Works remotely
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={portfolioOpen}
        onClose={() => setPortfolioOpen(false)}
        title="Add portfolio work"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPortfolioOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createPortfolio.mutate()}
              loading={createPortfolio.isPending}
              disabled={portfolioForm.title.trim().length < 2}
            >
              Add item
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={portfolioForm.title}
            onChange={(event) => setPortfolioForm({ ...portfolioForm, title: event.target.value })}
            maxLength={160}
          />
          <Textarea
            label="Description"
            value={portfolioForm.description}
            onChange={(event) => setPortfolioForm({ ...portfolioForm, description: event.target.value })}
            maxLength={2000}
          />
        </div>
      </Modal>
    </div>
  )
}

function ProfileFormFields({
  form,
  setForm,
}: {
  form: ProfileForm
  setForm: (form: ProfileForm) => void
}) {
  return (
    <div className="mt-4 space-y-4 border border-line bg-paper p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Studio name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={160} />
        <Select
          label="Type"
          value={form.type}
          onChange={(event) => setForm({ ...form, type: event.target.value as BusinessType })}
          options={businessTypes.map((item) => ({ value: item.value, label: item.label }))}
        />
      </div>
      <Input
        label="Tagline"
        value={form.tagline}
        onChange={(event) => setForm({ ...form, tagline: event.target.value })}
        maxLength={200}
      />
      <Textarea
        label="Description"
        value={form.description}
        onChange={(event) => setForm({ ...form, description: event.target.value })}
        maxLength={4000}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        <Input label="Country" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} />
        <Input label="Postal code" value={form.postal_code} onChange={(event) => setForm({ ...form, postal_code: event.target.value })} />
        <Input label="Address" value={form.address_line} onChange={(event) => setForm({ ...form, address_line: event.target.value })} />
        <Input label="Contact email" type="email" value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} />
        <Input label="Phone" value={form.contact_phone} onChange={(event) => setForm({ ...form, contact_phone: event.target.value })} />
        <Input label="Website" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
        <Input
          label="Services"
          hint="Comma separated"
          value={form.services}
          onChange={(event) => setForm({ ...form, services: event.target.value })}
        />
        <Input label="Starting price" type="number" min="0" value={form.price_from} onChange={(event) => setForm({ ...form, price_from: event.target.value })} />
        <Input label="Response time (hours)" type="number" min="1" value={form.response_time_hours} onChange={(event) => setForm({ ...form, response_time_hours: event.target.value })} />
        <Input label="Minimum order" type="number" min="0" value={form.min_order} onChange={(event) => setForm({ ...form, min_order: event.target.value })} />
        <Input label="Lead time (days)" type="number" min="1" value={form.lead_time_days} onChange={(event) => setForm({ ...form, lead_time_days: event.target.value })} />
      </div>
    </div>
  )
}
