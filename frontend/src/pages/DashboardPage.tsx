import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { ProductThumb } from '@/components/garment/ProductThumb'
import { LinkButton } from '@/components/ui/Button'
import { Badge, EmptyState, ErrorState, Notice, Skeleton, StatTile } from '@/components/ui/Primitives'
import {
  IconArrowRight,
  IconBag,
  IconCheck,
  IconChevronRight,
  IconImage,
  IconLayers,
  IconPackage,
  IconPalette,
  IconSettings,
  IconShirt,
  IconUser,
} from '@/components/ui/Icons'
import { formatDate, formatPrice, relativeTime, titleCase } from '@/lib/format'
import type { Design, QuoteRequest } from '@/lib/types'

/** Where a new design starts. The catalogue becomes the canonical entry point. */
const CATALOGUE_HREF = '/studio'
const STUDIO_HREF = '/studio/women'

const CLOSED_STATUSES = new Set(['completed', 'cancelled'])
const PRODUCTION_STATUSES = new Set([
  'order_received',
  'quote_approved',
  'design_approved',
  'production_pending',
  'printing_in_progress',
  'quality_checking',
  'ready_for_delivery',
])

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function orderTone(status: string): 'neutral' | 'gold' | 'clay' | 'olive' | 'danger' {
  if (status === 'cancelled') return 'danger'
  if (status === 'completed' || status === 'shipped') return 'olive'
  if (status === 'in_production' || status === 'confirmed') return 'clay'
  if (status === 'submitted' || status === 'quoted' || status === 'draft') return 'gold'
  return 'neutral'
}

function PanelHeader({
  title,
  hint,
  to,
  action,
}: {
  title: string
  hint?: string
  to?: string
  action?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold leading-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      </div>
      {to && (
        <Link
          to={to}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-clay"
        >
          {action ?? 'View all'}
          <IconChevronRight size={14} />
        </Link>
      )}
    </div>
  )
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)

  const profile = useQuery({ queryKey: qk.profile, queryFn: fetchers.profile, enabled: Boolean(user) })
  const designs = useQuery({
    queryKey: qk.designs({ limit: 6 }),
    queryFn: () => fetchers.designs({ limit: 6 }),
    enabled: Boolean(user),
  })
  const drafts = useQuery({
    queryKey: qk.designs({ status: 'draft', limit: 1 }),
    queryFn: () => fetchers.designs({ status: 'draft', limit: 1 }),
    enabled: Boolean(user),
  })
  const outfits = useQuery({ queryKey: qk.outfits, queryFn: fetchers.outfits, enabled: Boolean(user) })
  const requests = useQuery({
    queryKey: qk.requests('outgoing'),
    queryFn: () => fetchers.requests('outgoing'),
    enabled: Boolean(user),
  })
  const media = useQuery({ queryKey: qk.media, queryFn: fetchers.media, enabled: Boolean(user) })
  const notifications = useQuery({
    queryKey: qk.notifications,
    queryFn: fetchers.notifications,
    enabled: Boolean(user),
  })
  const featured = useQuery({
    queryKey: qk.garments({ featured: true, page_size: 4, sort: 'featured' }),
    queryFn: () => fetchers.garments({ featured: true, page_size: 4, sort: 'featured' }),
  })

  const firstName = (user?.full_name ?? 'designer').split(' ')[0]
  const recentDesigns = useMemo(() => designs.data?.items.slice(0, 5) ?? [], [designs.data])
  const recentOrders = useMemo(() => (requests.data?.items ?? []).slice(0, 5), [requests.data])

  const openOrders = useMemo(
    () => (requests.data?.items ?? []).filter((request) => !CLOSED_STATUSES.has(request.status)),
    [requests.data],
  )
  const inProduction = useMemo(
    () => openOrders.filter((request) => PRODUCTION_STATUSES.has(request.production_status)),
    [openOrders],
  )

  const totalDesigns = designs.data?.total ?? 0
  const draftCount = drafts.data?.total ?? 0
  const savedCount = Math.max(0, totalDesigns - draftCount)
  const hasDesigns = totalDesigns > 0

  const quickStart = [
    {
      label: 'Choose a product',
      detail: 'Pick a garment from the catalogue and a colourway.',
      to: CATALOGUE_HREF,
      done: hasDesigns,
    },
    {
      label: 'Add your artwork',
      detail: 'Upload a print file, or set type in the editor.',
      to: STUDIO_HREF,
      done: hasDesigns,
    },
    {
      label: 'Preview the mockup',
      detail: 'Check placement inside the printable area.',
      to: hasDesigns ? '/designs' : STUDIO_HREF,
      done: savedCount > 0,
    },
    {
      label: 'Save your project',
      detail: 'Keep it in the library, ready for a quote.',
      to: '/designs',
      done: savedCount > 0,
    },
  ]
  const stepsDone = quickStart.filter((step) => step.done).length

  const unread = notifications.data?.unread ?? 0

  return (
    <div className="shell py-8 sm:py-10">
      {/* ---------------------------------------------------------------- */}
      {/* Welcome                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2.5">
            <p className="eyebrow">{greeting()}</p>
            <h1 className="display-lg">
              {firstName}
              <span className="text-ink-muted"> — let&rsquo;s build something.</span>
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
              Your projects, artwork and production requests in one place. Everything here is private
              to your account.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <LinkButton to={STUDIO_HREF} variant="primary" size="md">
              <IconPalette size={16} />
              Start a design
            </LinkButton>
            <LinkButton to={CATALOGUE_HREF} variant="secondary" size="md">
              Browse catalogue
            </LinkButton>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Key metrics                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Designed products"
          icon={<IconShirt size={18} />}
          value={designs.isLoading ? '—' : totalDesigns}
          hint={hasDesigns ? `${savedCount} saved · ${draftCount} draft` : 'No projects yet'}
        />
        <StatTile
          label="Saved designs"
          icon={<IconLayers size={18} />}
          value={designs.isLoading || drafts.isLoading ? '—' : savedCount}
          hint="Ready to re-open or send for a quote"
        />
        <StatTile
          label="Open orders"
          icon={<IconPackage size={18} />}
          value={requests.isLoading ? '—' : openOrders.length}
          hint={recentOrders.length ? `Last update ${relativeTime(recentOrders[0].updated_at)}` : 'No open orders'}
        />
        <StatTile
          label="In production"
          icon={<IconBag size={18} />}
          value={requests.isLoading ? '—' : inProduction.length}
          hint="With print partners"
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Quick start                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="font-display text-base font-semibold leading-tight">Quick start</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Four steps from a blank product to a print-ready project.
            </p>
          </div>
          <span className="text-xs tabular-nums text-ink-muted">
            {stepsDone} of {quickStart.length} complete
          </span>
        </div>
        <ol className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
          {quickStart.map((step, index) => (
            <li key={step.label} className="border-line sm:border-b lg:border-b-0 lg:border-r lg:last:border-r-0">
              <Link to={step.to} className="group flex h-full items-start gap-3 p-4 transition-colors hover:bg-bone">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                    step.done ? 'bg-success text-white' : 'bg-sand text-ink-soft'
                  }`}
                  aria-hidden="true"
                >
                  {step.done ? <IconCheck size={14} /> : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{step.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{step.detail}</p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Projects / orders / shortcuts                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {/* Recent projects -------------------------------------------- */}
          <section className="panel overflow-hidden">
            <PanelHeader
              title="Recent projects"
              hint="Your most recently edited designs"
              to="/designs"
              action="Design library"
            />

            {designs.isLoading && (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Skeleton className="size-14 shrink-0 rounded-sm" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {designs.isError && (
              <div className="p-4">
                <ErrorState
                  title="Could not load your projects"
                  message="The design library did not respond."
                  onRetry={() => void designs.refetch()}
                />
              </div>
            )}

            {!designs.isLoading && !designs.isError && recentDesigns.length === 0 && (
              <div className="p-4">
                <EmptyState
                  title="No projects yet"
                  description="Pick a product, add artwork and save it — your projects appear here with a live thumbnail."
                  action={<LinkButton to={CATALOGUE_HREF}>Browse the catalogue</LinkButton>}
                />
              </div>
            )}

            {recentDesigns.length > 0 && (
              <ul className="divide-y divide-line">
                {recentDesigns.map((design: Design) => (
                  <li key={design.id}>
                    <div className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
                      <Link
                        to={design.garment ? `/garment/${design.garment.slug}?design=${design.id}` : '/designs'}
                        className="shrink-0"
                        aria-label={`Open ${design.name}`}
                      >
                        {design.garment ? (
                          <ProductThumb
                            garment={design.garment}
                            ratio="1/1"
                            className="size-14 border border-line"
                          />
                        ) : (
                          <div className="flex size-14 items-center justify-center rounded-sm border border-line bg-bone text-ink-muted">
                            <IconImage size={18} />
                          </div>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={design.garment ? `/garment/${design.garment.slug}?design=${design.id}` : '/designs'}
                            className="truncate text-sm font-medium hover:text-clay"
                          >
                            {design.name}
                          </Link>
                          <Badge
                            tone={
                              design.status === 'draft'
                                ? 'gold'
                                : design.status === 'archived'
                                  ? 'neutral'
                                  : 'olive'
                            }
                          >
                            {titleCase(design.status)}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {design.garment?.name ?? 'Product retired'} · edited {formatDate(design.updated_at)}
                        </p>
                      </div>
                      <Link
                        to={design.garment ? `/garment/${design.garment.slug}?design=${design.id}` : '/designs'}
                        className="hidden shrink-0 items-center gap-1 rounded-sm px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-bone sm:flex"
                      >
                        Open
                        <IconArrowRight size={14} />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent orders ---------------------------------------------- */}
          <section className="panel overflow-hidden">
            <PanelHeader
              title="Recent orders"
              hint="Quote requests and production with print partners"
              to="/orders"
              action="All orders"
            />

            {requests.isLoading && (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 w-full" />
                ))}
              </div>
            )}

            {requests.isError && (
              <div className="p-4">
                <ErrorState
                  title="Could not load orders"
                  message="The order service did not respond."
                  onRetry={() => void requests.refetch()}
                />
              </div>
            )}

            {!requests.isLoading && !requests.isError && recentOrders.length === 0 && (
              <div className="p-4">
                <EmptyState
                  title="No orders yet"
                  description="Orders start when you send a saved design to a print partner for a quote. Nothing is manufactured without your approval."
                  action={<LinkButton to="/marketplace" variant="secondary">Find a print partner</LinkButton>}
                />
              </div>
            )}

            {recentOrders.length > 0 && (
              <ul className="divide-y divide-line">
                {recentOrders.map((order: QuoteRequest) => (
                  <li key={order.id}>
                    <Link
                      to={`/orders/${order.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{order.title}</p>
                          <Badge tone={orderTone(order.status)}>{titleCase(order.status)}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {order.reference_code} · {order.business?.name ?? 'No partner assigned'} ·{' '}
                          {formatDate(order.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                        {order.agreed_amount_cents != null
                          ? formatPrice(order.agreed_amount_cents, order.agreed_currency ?? order.currency)
                          : order.budget_cents != null
                            ? formatPrice(order.budget_cents, order.currency)
                            : 'Quote pending'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Shortcuts ------------------------------------------------------ */}
        <div className="space-y-4">
          {/* Catalogue ---------------------------------------------------- */}
          <section className="panel overflow-hidden">
            <PanelHeader title="Product catalogue" hint="Customisable blanks" to={CATALOGUE_HREF} action="Browse" />
            <div className="p-4">
              {featured.isLoading && (
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="aspect-square w-full" />
                  ))}
                </div>
              )}
              {!featured.isLoading && (featured.data?.items.length ?? 0) > 0 && (
                <ul className="grid grid-cols-2 gap-2">
                  {featured.data?.items.slice(0, 4).map((garment) => (
                    <li key={garment.id}>
                      <Link to={`/garment/${garment.slug}`} className="group block">
                        <ProductThumb
                          garment={garment}
                          ratio="1/1"
                          className="border border-line transition-colors group-hover:border-line-strong"
                        />
                        <p className="mt-1.5 truncate text-xs font-medium leading-snug">{garment.name}</p>
                        <p className="text-[0.6875rem] tabular-nums text-ink-muted">
                          {formatPrice(garment.base_price_cents, garment.currency)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {!featured.isLoading && (featured.data?.items.length ?? 0) === 0 && (
                <p className="py-4 text-center text-xs text-ink-muted">The catalogue is empty right now.</p>
              )}
            </div>
          </section>

          {/* Design studio ------------------------------------------------- */}
          <section className="panel p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-ink text-paper">
                <IconLayers size={17} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold leading-tight">Design studio</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Place artwork on the real printable area, across front, back and sleeves.
                </p>
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <LinkButton to={STUDIO_HREF} size="sm" variant="primary">
                New design
              </LinkButton>
              <LinkButton to="/designs" size="sm" variant="secondary">
                Library
              </LinkButton>
            </div>
            <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
              {outfits.isLoading ? 'Loading your looks…' : `${outfits.data?.total ?? 0} saved looks`}
              <span className="mx-1.5 text-line-strong">·</span>
              {totalDesigns} designs
            </p>
          </section>

          {/* Account ------------------------------------------------------- */}
          <section className="panel overflow-hidden">
            <PanelHeader title="Account" hint="Profile and settings" />
            <ul className="divide-y divide-line text-sm">
              {[
                { to: '/profile', label: 'Profile & measurements', icon: <IconUser size={16} /> },
                { to: '/settings', label: 'Settings & privacy', icon: <IconSettings size={16} /> },
                { to: '/business', label: 'Business profile', icon: <IconBag size={16} /> },
              ].map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bone"
                  >
                    <span className="text-ink-muted">{item.icon}</span>
                    <span className="flex-1 text-[0.8125rem]">{item.label}</span>
                    <IconChevronRight size={14} className="text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">
              {signedInAs(user?.email)}
            </div>
          </section>

          {/* Inbox --------------------------------------------------------- */}
          <section className="panel overflow-hidden">
            <PanelHeader
              title="Inbox"
              hint={unread ? `${unread} unread` : 'You are up to date'}
              to="/notifications"
              action="Open"
            />
            {notifications.data?.items.length ? (
              <ul className="divide-y divide-line">
                {notifications.data.items.slice(0, 3).map((item) => (
                  <li key={item.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium">{item.title}</p>
                      {!item.read_at && <span className="size-1.5 rounded-full bg-clay" aria-label="Unread" />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[0.6875rem] leading-relaxed text-ink-muted">
                      {item.body}
                    </p>
                    <p className="mt-1 text-[0.6875rem] text-ink-muted">{relativeTime(item.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-xs text-ink-muted">Nothing new. Order updates arrive here.</p>
            )}
          </section>
        </div>
      </div>

      {/* Storage / privacy footnote --------------------------------------- */}
      <div className="mt-4">
        <Notice tone="info" title="Private by default">
          {media.data?.items.length ?? 0} files stored · {profile.data?.display_name ?? firstName}&rsquo;s artwork,
          photos and measurements are visible only to you. Nothing is shared with a print partner until you open
          an order.
        </Notice>
      </div>
    </div>
  )
}

function signedInAs(email: string | null | undefined): string {
  return email ? `Signed in as ${email}` : 'Signed in'
}
