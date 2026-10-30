import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { LinkButton } from '@/components/ui/Button'
import {
  Badge,
  EmptyState,
  PageHeader,
  Progress,
  Skeleton,
  StatTile,
} from '@/components/ui/Primitives'
import { formatBytes, formatDate, formatPrice, relativeTime, titleCase } from '@/lib/format'
import type { Design, Outfit, QuoteRequest } from '@/lib/types'

const openStatuses = new Set(['submitted', 'quoted', 'confirmed', 'in_production', 'shipped'])

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)

  const profile = useQuery({ queryKey: qk.profile, queryFn: fetchers.profile, enabled: Boolean(user) })
  const designs = useQuery({
    queryKey: qk.designs({ limit: 6 }),
    queryFn: () => fetchers.designs({ limit: 6 }),
    enabled: Boolean(user),
  })
  const outfits = useQuery({ queryKey: qk.outfits, queryFn: fetchers.outfits, enabled: Boolean(user) })
  const avatars = useQuery({ queryKey: qk.avatars, queryFn: fetchers.avatars, enabled: Boolean(user) })
  const requests = useQuery({
    queryKey: qk.requests('outgoing'),
    queryFn: () => fetchers.requests('outgoing'),
    enabled: Boolean(user),
  })
  const notifications = useQuery({
    queryKey: qk.notifications,
    queryFn: fetchers.notifications,
    enabled: Boolean(user),
  })
  const media = useQuery({ queryKey: qk.media, queryFn: fetchers.media, enabled: Boolean(user) })

  const firstName = (user?.full_name ?? 'designer').split(' ')[0]
  const recentDesigns = useMemo(() => designs.data?.items.slice(0, 4) ?? [], [designs.data])
  const savedOutfits = useMemo(() => outfits.data?.items.slice(0, 3) ?? [], [outfits.data])
  const openRequests = useMemo(
    () => (requests.data?.items ?? []).filter((request: QuoteRequest) => openStatuses.has(request.status)),
    [requests.data],
  )

  const measurements = profile.data?.measurements as Record<string, number | null> | undefined
  const measurementCount = measurements
    ? ['bust_cm', 'waist_cm', 'hips_cm', 'inseam_cm'].filter((key) => measurements[key] != null).length
    : 0
  const checklist = [
    {
      label: 'Add your measurements',
      detail: 'Needed for size guidance and to derive avatar proportions.',
      done: measurementCount >= 2,
      to: '/profile',
      cta: 'Add measurements',
    },
    {
      label: 'Create an avatar',
      detail: 'Pick a bundled 3D base model and adjust it with your measurements.',
      done: Boolean(avatars.data?.length),
      to: '/avatar',
      cta: 'Open avatar studio',
    },
    {
      label: 'Save your first design',
      detail: 'Customise colour, fabric and embroidery for each garment component.',
      done: Boolean(designs.data?.items.length),
      to: '/studio/women',
      cta: 'Open the studio',
    },
    {
      label: 'Assemble an outfit',
      detail: 'Combine pieces in the fitting room, then save and compare looks.',
      done: Boolean(outfits.data?.items.length),
      to: '/fitting-room',
      cta: 'Go to fitting room',
    },
  ]
  const completed = checklist.filter((item) => item.done).length

  const recommendation = profile.data?.size_recommendation

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow={`${greeting()}, ${firstName}`}
        title="Your studio at a glance"
        description="Designs, outfits and production requests in one place. Everything here is private to your account."
        actions={
          <>
            <LinkButton to="/studio" size="sm" variant="outline">
              Studio overview
            </LinkButton>
            <LinkButton to="/studio/women" size="sm">
              Start a design
            </LinkButton>
          </>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Saved designs"
          value={designs.isLoading ? '—' : (designs.data?.total ?? 0)}
          hint={`${designs.data?.items.filter((item) => item.status === 'draft').length ?? 0} draft`}
        />
        <StatTile
          label="Outfits"
          value={outfits.isLoading ? '—' : (outfits.data?.total ?? 0)}
          hint="saved looks"
        />
        <StatTile
          label="Open requests"
          value={requests.isLoading ? '—' : openRequests.length}
          hint="with ateliers"
        />
        <StatTile
          label="Size"
          value={recommendation?.size?.label ?? '—'}
          hint={recommendation?.available ? `${recommendation.confidence} confidence` : 'add measurements'}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <section className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="label-xs">Design library</p>
                <p className="font-display text-lg">Recently edited</p>
              </div>
              <Link to="/designs" className="text-[0.625rem] uppercase tracking-[0.12em] hover:text-clay">
                View all
              </Link>
            </div>

            {designs.isLoading && (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-32 w-full" />
                ))}
              </div>
            )}

            {!designs.isLoading && recentDesigns.length === 0 && (
              <div className="p-4">
                <EmptyState
                  title="No designs yet"
                  description="Open a garment from the catalogue and customise its components — the result lands here."
                  action={<LinkButton to="/studio/women">Browse womenswear</LinkButton>}
                />
              </div>
            )}

            {recentDesigns.length > 0 && (
              <ul className="divide-y divide-line">
                {recentDesigns.map((design: Design) => (
                  <li key={design.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex size-14 shrink-0 items-center justify-center border border-line bg-bone">
                      {design.garment ? (
                        <GarmentArt
                          garment={design.garment}
                          components={design.components}
                          className="h-[85%] w-[85%]"
                          showShadow={false}
                        />
                      ) : (
                        <span className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">n/a</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{design.name}</p>
                        <Badge tone={design.status === 'draft' ? 'gold' : design.status === 'archived' ? 'neutral' : 'olive'}>
                          {titleCase(design.status)}
                        </Badge>
                      </div>
                      <p className="text-[0.6875rem] text-ink-muted">
                        {design.garment?.name ?? 'Garment retired'} · updated {formatDate(design.updated_at)}
                      </p>
                    </div>
                    {design.garment && (
                      <Link
                        to={`/garment/${design.garment.slug}?design=${design.id}`}
                        className="shrink-0 border-b border-line text-[0.625rem] uppercase tracking-[0.1em] hover:border-ink"
                      >
                        Edit
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="label-xs">Outfits</p>
                <p className="font-display text-lg">Saved looks</p>
              </div>
              <Link to="/outfits" className="text-[0.625rem] uppercase tracking-[0.12em] hover:text-clay">
                Compare
              </Link>
            </div>
            {savedOutfits.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">
                No outfits saved. Assemble one in the{' '}
                <Link to="/fitting-room" className="border-b border-line hover:border-ink">
                  fitting room
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {savedOutfits.map((outfit: Outfit) => (
                  <li key={outfit.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex gap-1">
                      {outfit.items.slice(0, 3).map((item) =>
                        item.garment ? (
                          <GarmentArt
                            key={item.id}
                            garment={item.garment}
                            components={item.design?.components}
                            className="h-12 w-9 border border-line"
                            showShadow={false}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{outfit.name}</p>
                      <p className="text-[0.6875rem] text-ink-muted">
                        {outfit.items.length} pieces ·{' '}
                        {formatPrice(
                          outfit.items.reduce((sum, item) => sum + (item.garment?.base_price_cents ?? 0), 0),
                        )}
                      </p>
                    </div>
                    <Link
                      to="/outfits"
                      className="shrink-0 text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="border border-line bg-paper p-4">
            <div className="flex items-baseline justify-between">
              <p className="label-xs">Get set up</p>
              <span className="text-xs text-ink-muted">
                {completed}/{checklist.length}
              </span>
            </div>
            <Progress value={completed} max={checklist.length} label="Profile readiness" />
            <ul className="mt-4 space-y-3">
              {checklist.map((item) => (
                <li key={item.label} className="text-xs">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center border text-[0.5rem] ${
                        item.done ? 'border-olive bg-olive text-paper' : 'border-line text-ink-muted'
                      }`}
                      aria-hidden="true"
                    >
                      {item.done ? '✓' : ''}
                    </span>
                    <div className="min-w-0">
                      <p className={item.done ? 'text-ink-muted line-through' : 'font-medium'}>{item.label}</p>
                      {!item.done && (
                        <>
                          <p className="mt-0.5 leading-relaxed text-ink-muted">{item.detail}</p>
                          <Link
                            to={item.to}
                            className="mt-1 inline-block border-b border-line text-[0.5625rem] uppercase tracking-[0.1em] hover:border-ink"
                          >
                            {item.cta}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="label-xs">Notifications</p>
              <Link to="/notifications" className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay">
                Inbox
              </Link>
            </div>
            {notifications.data?.items.length ? (
              <ul className="divide-y divide-line">
                {notifications.data.items.slice(0, 3).map((item) => (
                  <li key={item.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium">{item.title}</p>
                      {!item.read_at && <span className="size-1.5 rounded-full bg-clay" aria-label="Unread" />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[0.6875rem] leading-relaxed text-ink-muted">{item.body}</p>
                    <p className="mt-1 text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                      {relativeTime(item.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-xs text-ink-muted">Nothing new. Quote updates arrive here.</p>
            )}
          </section>

          <section className="border border-line bg-paper p-4">
            <p className="label-xs">Private storage</p>
            <div className="mt-2">
              <Progress
                value={media.data?.storage_used_bytes ?? 0}
                max={media.data?.storage_limit_bytes ?? 1}
                label="Uploads"
                format={formatBytes}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-muted">
              {media.data?.items.length ?? 0} files · photos and print artwork only, never shared
              without a request.
            </p>
            <div className="mt-3 flex gap-2">
              <LinkButton to="/profile" size="sm" variant="outline">
                Media
              </LinkButton>
              <LinkButton to="/settings" size="sm" variant="ghost">
                Settings
              </LinkButton>
            </div>
          </section>

          <section className="border border-line bg-bone/40 p-4">
            <p className="eyebrow">Next</p>
            <p className="mt-1 text-sm leading-relaxed">
              {openRequests.length > 0
                ? `${openRequests.length} production request${openRequests.length === 1 ? '' : 's'} in progress.`
                : 'Ready for production? Send a technical pack to a verified atelier.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton to="/orders" size="sm" variant="outline">
                Requests
              </LinkButton>
              <LinkButton to="/marketplace" size="sm" variant="ghost">
                Find a partner
              </LinkButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
