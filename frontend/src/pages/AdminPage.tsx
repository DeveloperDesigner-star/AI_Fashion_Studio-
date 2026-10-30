import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea, Toggle } from '@/components/ui/Field'
import { Badge, EmptyState, ErrorState, LoadingBlock, Notice, StatTile } from '@/components/ui/Primitives'
import { formatBytes, formatDate, formatDateTime, formatPrice, titleCase } from '@/lib/format'
import type {
  AdminList,
  Garment,
  GarmentList,
  AdminStats,
  AdminUser,
  AuditLogEntry,
  Business,
  ProviderSetting,
  QuoteRequest,
  UserRole,
} from '@/lib/types'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'providers', label: 'AI providers' },
  { id: 'catalog', label: 'Catalogue' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'audit', label: 'Audit trail' },
] as const

type TabId = (typeof tabs)[number]['id']

export function AdminPage() {
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <div className="shell py-10">
      <header className="border-b border-line pb-6">
        <p className="eyebrow">Administration</p>
        <h1 className="display-lg mt-1">Studio operations</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Operational view of accounts, AI provider routing and the production marketplace. Every
          change here is written to the audit trail.
        </p>
      </header>

      <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Admin sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`border px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.12em] ${
              tab === item.id ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted hover:border-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <Users />}
        {tab === 'providers' && <Providers />}
        {tab === 'catalog' && <CatalogAdmin />}
        {tab === 'marketplace' && <MarketplaceAdmin />}
        {tab === 'audit' && <Audit />}
      </div>
    </div>
  )
}

function Overview() {
  const stats = useQuery({ queryKey: qk.adminStats, queryFn: fetchers.adminStats })
  const usage = useQuery({ queryKey: qk.aiUsage, queryFn: fetchers.aiUsage })

  if (stats.isLoading) return <LoadingBlock label="Loading overview" rows={3} />
  if (stats.isError || !stats.data) {
    return <ErrorState title="Stats unavailable" onRetry={() => stats.refetch()} />
  }

  const data: AdminStats = stats.data
  const breakdown = (usage.data?.breakdown as { kind: string; provider: string; status: string; count: number }[]) ?? []

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Accounts" value={data.users_total} hint={`${data.users_new_7d} new this week`} />
        <StatTile label="Designs" value={data.designs_total} hint={`${data.outfits_total} outfits`} />
        <StatTile label="Catalogue" value={data.garments_total} hint="published garments" />
        <StatTile label="Open requests" value={data.orders_open} hint={`${data.businesses_total} studios`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-line bg-paper p-5">
          <h2 className="font-display text-xl">AI traffic · 24 hours</h2>
          <p className="font-display text-4xl">{data.ai_requests_24h}</p>
          <dl className="mt-4 space-y-2 text-sm">
            {Object.entries(data.ai_by_provider).length === 0 && (
              <p className="text-xs text-ink-muted">No provider-backed requests in the last day.</p>
            )}
            {Object.entries(data.ai_by_provider).map(([provider, count]) => (
              <div key={provider} className="flex items-center justify-between border-b border-line/60 pb-1.5">
                <dt>{titleCase(provider)}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            Media storage: {formatBytes(data.media_storage_bytes)}
          </p>
        </section>

        <section className="border border-line bg-paper p-5">
          <h2 className="font-display text-xl">Seven-day routing</h2>
          {breakdown.length === 0 ? (
            <p className="mt-3 text-xs text-ink-muted">No AI requests recorded in the window.</p>
          ) : (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">
                  <th className="py-1.5">Kind</th>
                  <th className="py-1.5">Provider</th>
                  <th className="py-1.5">Status</th>
                  <th className="py-1.5 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={`${row.kind}-${row.provider}-${row.status}`} className="border-b border-line/50">
                    <td className="py-1.5">{titleCase(row.kind)}</td>
                    <td className="py-1.5">{titleCase(row.provider)}</td>
                    <td className="py-1.5">{titleCase(row.status)}</td>
                    <td className="py-1.5 text-right">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[0.625rem] leading-relaxed text-ink-muted">{usage.data?.note as string}</p>
        </section>
      </div>
    </div>
  )
}

function Users() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const users = useQuery({
    queryKey: qk.adminUsers({ q: query, role }),
    queryFn: () => fetchers.adminUsers({ q: query || undefined, role: role || undefined }),
  })

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.patch(`/admin/users/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Account updated')
    },
    onError: (error) =>
      toast.error('Update rejected', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <Input label="Search accounts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Email or name" />
        </div>
        <div className="w-full sm:max-w-[180px]">
          <Select
            label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            options={[
              { value: '', label: 'All roles' },
              { value: 'user', label: 'User' },
              { value: 'designer', label: 'Designer' },
              { value: 'business', label: 'Business' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        </div>
      </div>

      {users.isLoading && <LoadingBlock label="Loading accounts" rows={4} />}
      {users.isError && <ErrorState title="Accounts unavailable" onRetry={() => users.refetch()} />}

      {users.data && (
        <div className="overflow-x-auto border border-line bg-paper">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Accounts</caption>
            <thead>
              <tr className="border-b border-line text-left text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
                <th className="px-4 py-2.5">Account</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Joined</th>
                <th className="px-4 py-2.5">Last login</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users.data as AdminList<AdminUser>).items.map((user) => (
                <tr key={user.id} className="border-b border-line/60">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-xs text-ink-muted">{user.email}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={user.role}
                      onChange={(event) =>
                        update.mutate({ id: user.id, payload: { role: event.target.value as UserRole } })
                      }
                      className="border border-line bg-paper px-2 py-1 text-xs"
                      aria-label={`Role for ${user.email}`}
                    >
                      {['user', 'designer', 'business', 'admin'].map((value) => (
                        <option key={value} value={value}>
                          {titleCase(value)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={user.is_active ? 'olive' : 'danger'}>{user.is_active ? 'Active' : 'Disabled'}</Badge>
                      {user.is_verified && <Badge tone="neutral">Verified</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">{formatDate(user.created_at)}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">
                    {user.last_login_at ? formatDateTime(user.last_login_at) : 'Never'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => update.mutate({ id: user.id, payload: { is_active: !user.is_active } })}
                      className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay"
                    >
                      {user.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.data.items.length === 0 && <EmptyState title="No accounts match" description="Adjust the search or role filter." />}
        </div>
      )}
    </div>
  )
}

function Providers() {
  const queryClient = useQueryClient()
  const providers = useQuery({ queryKey: qk.adminProviders, queryFn: fetchers.adminProviders })

  const update = useMutation({
    mutationFn: ({ provider, payload }: { provider: string; payload: Record<string, unknown> }) =>
      api.put<ProviderSetting>(`/admin/providers/${provider}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminProviders })
      queryClient.invalidateQueries({ queryKey: qk.capabilities })
      queryClient.invalidateQueries({ queryKey: qk.providers })
      toast.success('Provider settings saved')
    },
    onError: (error) =>
      toast.error('Settings not saved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  if (providers.isLoading) return <LoadingBlock label="Loading providers" rows={3} />
  if (providers.isError) return <ErrorState title="Providers unavailable" onRetry={() => providers.refetch()} />

  return (
    <div className="space-y-5">
      <Notice tone="warn" title="Cost guardrails">
        Only free-tier providers are enabled by default. OpenAI is disabled unless an administrator
        explicitly enables it and the server has a key; the platform never purchases capacity.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-3">
        {(providers.data ?? []).map((provider) => (
          <section key={provider.provider} className="border border-line bg-paper p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl">{titleCase(provider.provider)}</h2>
              <Badge tone={provider.usable ? 'olive' : provider.configured ? 'gold' : 'neutral'}>
                {provider.usable ? 'Routing' : provider.configured ? 'Configured, off' : 'No key'}
              </Badge>
            </div>

            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Text model</dt>
                <dd className="text-right">{provider.default_text_model ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Vision model</dt>
                <dd className="text-right">{provider.default_vision_model ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Env key</dt>
                <dd>{provider.configured ? 'present' : 'missing'}</dd>
              </div>
            </dl>

            <label className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
              <span>Enabled for routing</span>
              <input
                type="checkbox"
                checked={provider.enabled}
                onChange={(event) =>
                  update.mutate({ provider: provider.provider, payload: { enabled: event.target.checked } })
                }
                className="size-4"
                aria-label={`Enable ${provider.provider}`}
              />
            </label>

            {provider.provider === 'openai' && provider.enabled && (
              <p className="mt-2 text-[0.625rem] leading-relaxed text-clay">
                OpenAI is a billed service. Enabling it means requests may incur charges on the
                server’s account.
              </p>
            )}

            <div className="mt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(`Reset ${provider.provider} overrides to environment defaults?`)) {
                    api
                      .delete(`/admin/providers/${provider.provider}`)
                      .then(() => {
                        queryClient.invalidateQueries({ queryKey: qk.adminProviders })
                        toast.success('Overrides cleared')
                      })
                      .catch(() => toast.error('Could not reset the provider'))
                  }
                }}
              >
                Reset overrides
              </Button>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

const ADMIN_CATALOG_PAGE_SIZE = 20

function CatalogAdmin() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    slug: '',
    gender: 'womenswear',
    category: 'shalwar_kameez',
    slot: 'dress',
    description: '',
    base_price_cents: 14900,
    default_fabric: 'cotton',
    default_color: '#c9a06a',
    season: 'all-season',
    fit: 'regular',
    silhouette: 'shalwar_kameez',
    styles: ['traditional'] as string[],
    occasions: ['everyday'] as string[],
    sizes: 'XS,S,M,L,XL',
    componentIds: 'body,sleeves,neckline',
    is_featured: false,
    is_active: true,
  })

  const catalog = useQuery({
    queryKey: qk.adminCatalog({ q: query, status, page }),
    queryFn: () =>
      api.get<GarmentList>(
        `/admin/catalog?status=${status}&page=${page}&page_size=${ADMIN_CATALOG_PAGE_SIZE}${
          query ? `&q=${encodeURIComponent(query)}` : ''
        }`,
      ),
  })
  const taxonomy = useQuery({ queryKey: qk.taxonomy, queryFn: fetchers.taxonomy, staleTime: 600_000 })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] })
    queryClient.invalidateQueries({ queryKey: ['garments'] })
    queryClient.invalidateQueries({ queryKey: qk.taxonomy })
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<Garment>('/admin/catalog', {
        name: draft.name,
        slug: draft.slug || undefined,
        gender: draft.gender,
        category: draft.category,
        slot: draft.slot,
        description: draft.description,
        base_price_cents: Number(draft.base_price_cents),
        default_fabric: draft.default_fabric,
        default_color: draft.default_color,
        season: draft.season,
        fit: draft.fit,
        silhouette: draft.silhouette,
        styles: draft.styles,
        occasions: draft.occasions,
        sizes: draft.sizes.split(',').map((value) => value.trim()).filter(Boolean),
        components: draft.componentIds
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
          .map((id) => ({
            id,
            label: titleCase(id),
            description: `${titleCase(id)} of the garment`,
            fabrics: ['cotton', 'silk', 'wool', 'linen'],
            allows_print: id !== 'lining',
          })),
        is_featured: draft.is_featured,
        is_active: draft.is_active,
      }),
    onSuccess: (garment) => {
      invalidate()
      setCreating(false)
      setDraft((current) => ({ ...current, name: '', slug: '' }))
      toast.success('Piece added', `${garment.name} is live in the catalogue.`)
    },
    onError: (error) =>
      toast.error('Could not create the piece', error instanceof ApiError ? error.message : 'Check the fields.'),
  })

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Garment>(`/admin/catalog/${id}`, body),
    onSuccess: () => {
      invalidate()
      toast.success('Catalogue updated')
    },
    onError: (error) =>
      toast.error('Update failed', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete<Garment>(`/admin/catalog/${id}`),
    onSuccess: (garment) => {
      invalidate()
      toast.success('Piece hidden', `${garment.name} is no longer shown in the studio.`)
    },
    onError: () => toast.error('Could not hide the piece'),
  })

  const toggleStyle = (value: string) =>
    setDraft((current) => ({
      ...current,
      styles: current.styles.includes(value)
        ? current.styles.filter((entry) => entry !== value)
        : [...current.styles, value],
    }))

  const toggleOccasion = (value: string) =>
    setDraft((current) => ({
      ...current,
      occasions: current.occasions.includes(value)
        ? current.occasions.filter((entry) => entry !== value)
        : [...current.occasions, value],
    }))

  const totalPages = catalog.data ? Math.max(1, Math.ceil(catalog.data.total / ADMIN_CATALOG_PAGE_SIZE)) : 1
  const activeCount = catalog.data?.facets.active ?? 0
  const inactiveCount = catalog.data?.facets.inactive ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input label="Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or slug" />
          <Select
            label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            options={[
              { value: 'all', label: `All (${activeCount + inactiveCount})` },
              { value: 'active', label: `Active (${activeCount})` },
              { value: 'inactive', label: `Hidden (${inactiveCount})` },
            ]}
          />
        </div>
        <Button size="sm" onClick={() => setCreating((current) => !current)}>
          {creating ? 'Close form' : 'Add a piece'}
        </Button>
      </div>

      {creating && (
        <section className="border border-line bg-paper p-5">
          <h2 className="font-display text-xl">New catalogue piece</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Records are stored in the database and appear immediately in the studio. Silhouette keys map to
            the procedural artwork.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <Input
              label="Slug (optional)"
              value={draft.slug}
              onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              placeholder="derived from the name"
            />
            <Select
              label="Department"
              value={draft.gender}
              onChange={(event) => setDraft({ ...draft, gender: event.target.value })}
              options={[
                { value: 'womenswear', label: 'Womenswear' },
                { value: 'menswear', label: 'Menswear' },
                { value: 'unisex', label: 'Unisex' },
              ]}
            />
            <Select
              label="Category"
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              options={(taxonomy.data?.categories ?? []).map((entry) => ({ value: entry.value, label: entry.label }))}
            />
            <Select
              label="Slot"
              value={draft.slot}
              onChange={(event) => setDraft({ ...draft, slot: event.target.value })}
              options={(taxonomy.data?.slots ?? []).map((slot) => ({ value: slot, label: titleCase(slot) }))}
            />
            <Input
              label="Price (cents)"
              type="number"
              value={draft.base_price_cents}
              onChange={(event) => setDraft({ ...draft, base_price_cents: Number(event.target.value) })}
            />
            <Input
              label="Default fabric"
              value={draft.default_fabric}
              onChange={(event) => setDraft({ ...draft, default_fabric: event.target.value })}
            />
            <Input
              label="Default colour"
              value={draft.default_color}
              onChange={(event) => setDraft({ ...draft, default_color: event.target.value })}
            />
            <Input
              label="Silhouette key"
              value={draft.silhouette}
              onChange={(event) => setDraft({ ...draft, silhouette: event.target.value })}
            />
            <Select
              label="Season"
              value={draft.season}
              onChange={(event) => setDraft({ ...draft, season: event.target.value })}
              options={(taxonomy.data?.seasons ?? []).map((entry) => ({ value: entry.value, label: entry.label }))}
            />
            <Select
              label="Fit"
              value={draft.fit}
              onChange={(event) => setDraft({ ...draft, fit: event.target.value })}
              options={['slim', 'regular', 'loose', 'oversized'].map((value) => ({ value, label: titleCase(value) }))}
            />
            <Input
              label="Sizes (comma separated)"
              value={draft.sizes}
              onChange={(event) => setDraft({ ...draft, sizes: event.target.value })}
            />
          </div>

          <Textarea
            label="Description"
            className="mt-4"
            rows={2}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="label-xs mb-2">Styles</p>
              <div className="flex flex-wrap gap-1.5">
                {(taxonomy.data?.styles ?? []).map((style) => (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => toggleStyle(style.value)}
                    aria-pressed={draft.styles.includes(style.value)}
                    className={`border px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em] ${
                      draft.styles.includes(style.value)
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line text-ink-muted hover:border-ink'
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label-xs mb-2">Occasions</p>
              <div className="flex flex-wrap gap-1.5">
                {(taxonomy.data?.occasions ?? []).map((occasion) => (
                  <button
                    key={occasion.value}
                    type="button"
                    onClick={() => toggleOccasion(occasion.value)}
                    aria-pressed={draft.occasions.includes(occasion.value)}
                    className={`border px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em] ${
                      draft.occasions.includes(occasion.value)
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line text-ink-muted hover:border-ink'
                    }`}
                  >
                    {occasion.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Input
            label="Component ids (comma separated)"
            className="mt-4"
            value={draft.componentIds}
            onChange={(event) => setDraft({ ...draft, componentIds: event.target.value })}
          />

          <div className="mt-4 flex flex-wrap items-center gap-6">
            <Toggle
              checked={draft.is_featured}
              onChange={(value) => setDraft({ ...draft, is_featured: value })}
              label="Feature on the studio landing rail"
            />
            <Toggle
              checked={draft.is_active}
              onChange={(value) => setDraft({ ...draft, is_active: value })}
              label="Publish immediately"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => create.mutate()} loading={create.isPending} disabled={draft.name.trim().length < 2}>
              Create piece
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      {catalog.isLoading && <LoadingBlock label="Loading catalogue" rows={4} />}
      {catalog.isError && <ErrorState title="Catalogue could not be loaded" onRetry={() => catalog.refetch()} />}

      {catalog.data && (
        <>
          <div className="overflow-x-auto border border-line bg-paper">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-normal">Piece</th>
                  <th className="px-3 py-2 font-normal">Category</th>
                  <th className="px-3 py-2 font-normal">Styles</th>
                  <th className="px-3 py-2 font-normal">Price</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {catalog.data.items.map((garment) => (
                  <tr key={garment.id} className={garment.is_active ? '' : 'opacity-60'}>
                    <td className="px-3 py-2">
                      <p className="font-display text-base leading-tight">{garment.name}</p>
                      <p className="text-[0.625rem] text-ink-muted">{garment.slug}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {titleCase(garment.category)}
                      <span className="block text-[0.625rem] text-ink-muted">{titleCase(garment.gender)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{garment.styles.slice(0, 2).join(', ') || '—'}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{formatPrice(garment.base_price_cents)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={garment.is_active ? 'olive' : 'neutral'}>
                        {garment.is_active ? 'Active' : 'Hidden'}
                      </Badge>
                      {garment.is_featured && <Badge tone="ink" className="ml-1">Featured</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            patch.mutate({
                              id: garment.id,
                              body: { is_featured: !garment.is_featured },
                            })
                          }
                          className="border border-line px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em] hover:border-ink"
                        >
                          {garment.is_featured ? 'Unfeature' : 'Feature'}
                        </button>
                        {garment.is_active ? (
                          <button
                            type="button"
                            onClick={() => deactivate.mutate(garment.id)}
                            className="border border-line px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em] text-danger hover:border-danger"
                          >
                            Hide
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => patch.mutate({ id: garment.id, body: { is_active: true } })}
                            className="border border-line px-2 py-1 text-[0.5625rem] uppercase tracking-[0.1em] hover:border-ink"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {catalog.data.total === 0 && (
            <EmptyState title="No pieces match" description="Adjust the search or status filter." />
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </Button>
              <span className="text-xs uppercase tracking-[0.14em] text-ink-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <Notice tone="info" title="Editing model">
        Adding a piece publishes it immediately; hiding keeps every saved design's reference intact.
        Price, feature and visibility changes are written to the audit trail.
      </Notice>
    </div>
  )
}

function MarketplaceAdmin() {
  const queryClient = useQueryClient()
  const businesses = useQuery({ queryKey: qk.adminBusinesses, queryFn: fetchers.adminBusinesses })
  const requests = useQuery({ queryKey: qk.adminRequests, queryFn: fetchers.adminRequests })

  const verify = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      api.patch<Business>(`/admin/businesses/${id}/verify?verified=${verified}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminBusinesses })
      queryClient.invalidateQueries({ queryKey: ['businesses'] })
      toast.success('Listing updated')
    },
  })

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="border border-line bg-paper">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-display text-xl">Studios</h2>
          <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
            {businesses.data?.total ?? 0} listings
          </p>
        </div>
        {businesses.isLoading && <LoadingBlock label="Loading studios" rows={3} />}
        {businesses.data?.items.length === 0 && <EmptyState title="No studios listed" description="Partner applications appear here." />}
        <ul className="divide-y divide-line">
          {(businesses.data?.items ?? []).map((business) => (
            <li key={business.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{business.name}</p>
                <p className="text-xs text-ink-muted">
                  {titleCase(business.type)} · {business.city || 'no city'} ·{' '}
                  {business.price_from_cents ? formatPrice(business.price_from_cents) : 'price on request'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {business.is_verified && <Badge tone="olive">Verified</Badge>}
                <button
                  type="button"
                  onClick={() => verify.mutate({ id: business.id, verified: !business.is_verified })}
                  className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay"
                >
                  {business.is_verified ? 'Unverify' : 'Verify'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-line bg-paper">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-display text-xl">Requests</h2>
          <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
            {requests.data?.total ?? 0} total
          </p>
        </div>
        {requests.isLoading && <LoadingBlock label="Loading requests" rows={3} />}
        <ul className="divide-y divide-line">
          {(requests.data?.items ?? []).map((request: QuoteRequest) => (
            <li key={request.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{request.title}</p>
                <Badge tone="neutral">{titleCase(request.status)}</Badge>
              </div>
              <p className="text-xs text-ink-muted">
                {request.reference_code} · {request.business?.name ?? 'unassigned'} ·{' '}
                {formatDate(request.created_at)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Audit() {
  const logs = useQuery({ queryKey: qk.adminAudit, queryFn: fetchers.adminAudit })

  if (logs.isLoading) return <LoadingBlock label="Loading audit trail" rows={4} />
  if (logs.isError) return <ErrorState title="Audit trail unavailable" onRetry={() => logs.refetch()} />

  return (
    <div className="overflow-x-auto border border-line bg-paper">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Audit trail</caption>
        <thead>
          <tr className="border-b border-line text-left text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
            <th className="px-4 py-2.5">When</th>
            <th className="px-4 py-2.5">Action</th>
            <th className="px-4 py-2.5">Resource</th>
            <th className="px-4 py-2.5">Actor</th>
            <th className="px-4 py-2.5">Detail</th>
          </tr>
        </thead>
        <tbody>
          {(logs.data?.items ?? []).map((entry: AuditLogEntry) => (
            <tr key={entry.id} className="border-b border-line/60 align-top">
              <td className="whitespace-nowrap px-4 py-2 text-xs text-ink-muted">{formatDateTime(entry.created_at)}</td>
              <td className="px-4 py-2 font-mono text-[0.6875rem]">{entry.action}</td>
              <td className="px-4 py-2 text-xs">
                {entry.resource_type ?? '—'}
                {entry.resource_id && <span className="block text-ink-muted">{entry.resource_id.slice(0, 12)}…</span>}
              </td>
              <td className="px-4 py-2 text-xs text-ink-muted">{entry.user_id ? `${entry.user_id.slice(0, 8)}…` : 'system'}</td>
              <td className="max-w-[280px] px-4 py-2 font-mono text-[0.625rem] text-ink-muted">
                <span className="line-clamp-2 break-all">{JSON.stringify(entry.detail)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.data?.items.length === 0 && <EmptyState title="No audit entries yet" description="Administrative actions are recorded here." />}
    </div>
  )
}
