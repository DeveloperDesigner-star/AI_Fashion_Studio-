import { useEffect, useState } from 'react'
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
  ProviderTestResult,
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
  const breakdown = usage.data?.by_kind ?? []

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
                  <th className="py-1.5">Task</th>
                  <th className="py-1.5 text-right">Requests</th>
                  <th className="py-1.5 text-right">Est. value</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={row.kind} className="border-b border-line/50">
                    <td className="py-1.5">{titleCase(row.kind.replace(/_/g, ' '))}</td>
                    <td className="py-1.5 text-right">{row.requests}</td>
                    <td className="py-1.5 text-right">{formatUsd(row.estimated_cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[0.625rem] leading-relaxed text-ink-muted">{usage.data?.note}</p>
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

function formatUsd(value: number | null | undefined): string {
  const amount = value ?? 0
  if (amount === 0) return '$0.00'
  if (amount < 0.01) return `$${amount.toFixed(5)}`
  return `$${amount.toFixed(4)}`
}

function providerTone(provider: ProviderSetting): 'olive' | 'gold' | 'neutral' | 'clay' {
  if (provider.usable) return 'olive'
  if (provider.status === 'paid-gate') return 'gold'
  if (!provider.configured) return 'neutral'
  if (!provider.enabled) return 'neutral'
  return 'gold'
}

function providerStatusLabel(provider: ProviderSetting): string {
  if (provider.usable) return 'Routing'
  if (provider.status === 'paid-gate') return 'Paid gate'
  if (!provider.configured) return 'No key'
  if (!provider.enabled) return 'Disabled'
  return 'Configured'
}

function ProviderCard({
  provider,
  position,
  total,
  onMove,
  moving,
}: {
  provider: ProviderSetting
  position: number
  total: number
  onMove: (direction: -1 | 1) => void
  moving: boolean
}) {
  const queryClient = useQueryClient()
  const [textModel, setTextModel] = useState(provider.default_text_model ?? '')
  const [visionModel, setVisionModel] = useState(provider.default_vision_model ?? '')
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null)

  useEffect(() => {
    setTextModel(provider.default_text_model ?? '')
    setVisionModel(provider.default_vision_model ?? '')
  }, [provider.default_text_model, provider.default_vision_model])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.adminProviders })
    queryClient.invalidateQueries({ queryKey: qk.aiErrors })
    queryClient.invalidateQueries({ queryKey: qk.aiFallbacks })
    queryClient.invalidateQueries({ queryKey: qk.aiUsage })
    queryClient.invalidateQueries({ queryKey: qk.capabilities })
    queryClient.invalidateQueries({ queryKey: qk.providers })
  }

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<ProviderSetting>(`/admin/providers/${provider.provider}`, payload),
    onSuccess: () => {
      invalidate()
      toast.success('Provider settings saved')
    },
    onError: (error) =>
      toast.error('Settings not saved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const test = useMutation({
    mutationFn: () => fetchers.testProvider(provider.provider),
    onSuccess: (result) => {
      setTestResult(result)
      invalidate()
      if (result.ok) toast.success(`${provider.label} connection verified`)
      else toast.error('Connection test failed', result.error ?? 'Provider did not respond.')
    },
    onError: (error) =>
      toast.error('Connection test failed', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const reset = useMutation({
    mutationFn: () => api.delete(`/admin/providers/${provider.provider}`),
    onSuccess: () => {
      invalidate()
      setTestResult(null)
      toast.success('Overrides cleared')
    },
    onError: () => toast.error('Could not reset the provider'),
  })

  const dirty =
    (provider.default_text_model ?? '') !== textModel.trim() ||
    (provider.supports_vision && (provider.default_vision_model ?? '') !== visionModel.trim())

  const lastTest = testResult ?? {
    ok: provider.last_test_ok,
    error: provider.last_test_error,
    latency_ms: provider.last_test_latency_ms,
    model: null,
    skipped: false,
  }

  return (
    <section className="flex h-full flex-col border border-line bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-xs">Position {position + 1}</p>
          <h2 className="mt-1 font-display text-xl">{provider.label}</h2>
          <p className="mt-1 text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
            {provider.role}
            {provider.free_tier ? ' · free tier' : ' · billed'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={providerTone(provider)}>{providerStatusLabel(provider)}</Badge>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Move ${provider.provider} up`}
              disabled={position === 0 || moving}
              onClick={() => onMove(-1)}
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Move ${provider.provider} down`}
              disabled={position === total - 1 || moving}
              onClick={() => onMove(1)}
            >
              ↓
            </Button>
          </div>
        </div>
      </div>

      {provider.reason && (
        <p className="mt-3 border-l-2 border-clay/40 pl-2 text-[0.6875rem] leading-relaxed text-clay">
          {provider.reason}
        </p>
      )}

      <dl className="mt-3 space-y-1.5 border-y border-line py-3 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Environment key</dt>
          <dd className="font-mono text-[0.6875rem]">
            {provider.env_key ?? '—'} · {provider.configured ? 'present' : 'missing'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-muted">Capabilities</dt>
          <dd className="text-right">
            {provider.capabilities.length} tasks · {provider.supports_vision ? 'vision' : 'text only'}
          </dd>
        </div>
      </dl>

      <div className="mt-3 space-y-2.5">
        <Input
          label="Text model"
          value={textModel}
          onChange={(event) => setTextModel(event.target.value)}
          maxLength={120}
          placeholder="Provider default"
        />
        {provider.supports_vision ? (
          <Input
            label="Vision model"
            value={visionModel}
            onChange={(event) => setVisionModel(event.target.value)}
            maxLength={120}
            placeholder="Provider default"
          />
        ) : (
          <p className="border border-dashed border-line px-3 py-2.5 text-xs text-ink-muted">
            This provider is text-only here; it is never offered for image analysis.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            loading={update.isPending}
            disabled={!dirty}
            onClick={() =>
              update.mutate({
                default_text_model: textModel.trim(),
                default_vision_model: provider.supports_vision ? visionModel.trim() : null,
              })
            }
          >
            Save models
          </Button>
          <Button size="sm" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
            Test connection
          </Button>
        </div>
      </div>

      <Toggle
        checked={provider.enabled}
        disabled={update.isPending}
        onChange={(enabled) => update.mutate({ enabled })}
        label="Enabled for routing"
        description="Disabling removes this provider from the fallback chain. Credentials stay in the environment."
      />

      {provider.provider === 'openai' && (
        <p className="border border-gold/30 bg-gold/10 px-3 py-2 text-[0.625rem] leading-relaxed text-[#7a5f31]">
          Billed provider. A connection test and live routing both require OPENAI_ENABLED and
          AI_PAID_USAGE_ENABLED on the server. Enabling the toggle alone cannot start billing.
        </p>
      )}

      {(lastTest.ok !== null && lastTest.ok !== undefined) || lastTest.error ? (
        <div className="mt-3 border border-line bg-bone/40 px-3 py-2 text-[0.625rem] leading-relaxed">
          <p className="font-medium">
            {lastTest.ok ? 'Last test passed' : 'Last test failed'}
            {lastTest.latency_ms ? ` · ${Math.round(lastTest.latency_ms)} ms` : ''}
          </p>
          {lastTest.error && <p className="mt-1 break-words text-clay">{lastTest.error}</p>}
          {provider.last_tested_at && (
            <p className="mt-1 text-ink-muted">Checked {formatDateTime(provider.last_tested_at)}</p>
          )}
        </div>
      ) : null}

      <div className="mt-auto pt-3">
        <Button
          size="sm"
          variant="ghost"
          loading={reset.isPending}
          onClick={() => {
            if (window.confirm(`Reset ${provider.provider} overrides to environment defaults?`)) {
              reset.mutate()
            }
          }}
        >
          Reset overrides
        </Button>
      </div>
    </section>
  )
}

function Providers() {
  const queryClient = useQueryClient()
  const providers = useQuery({ queryKey: qk.adminProviders, queryFn: fetchers.adminProviders })
  const usage = useQuery({ queryKey: qk.aiUsage, queryFn: fetchers.aiUsage })
  const errors = useQuery({ queryKey: qk.aiErrors, queryFn: fetchers.aiErrors })
  const fallbacks = useQuery({ queryKey: qk.aiFallbacks, queryFn: fetchers.aiFallbacks })

  const reorder = useMutation({
    mutationFn: (order: string[]) => fetchers.reorderProviders(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminProviders })
      queryClient.invalidateQueries({ queryKey: qk.capabilities })
      queryClient.invalidateQueries({ queryKey: qk.providers })
      toast.success('Fallback order updated')
    },
    onError: (error) =>
      toast.error('Order not saved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  if (providers.isLoading) return <LoadingBlock label="Loading providers" rows={3} />
  if (providers.isError)
    return <ErrorState title="Providers unavailable" onRetry={() => providers.refetch()} />

  const ordered = [...(providers.data ?? [])].sort((a, b) => a.priority - b.priority)

  const move = (index: number, direction: -1 | 1) => {
    const next = [...ordered]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next.map((provider) => provider.provider))
  }

  return (
    <div className="space-y-5">
      <Notice tone="warn" title="Cost guardrails">
        Gemini and Groq run on free tiers. OpenAI is billed and stays inert unless both
        OPENAI_ENABLED and AI_PAID_USAGE_ENABLED are set on the server. There is no automatic
        billing activation and no paid capacity is purchased by the studio.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-3">
        {ordered.map((provider, index) => (
          <ProviderCard
            key={provider.provider}
            provider={provider}
            position={index}
            total={ordered.length}
            moving={reorder.isPending}
            onMove={(direction) => move(index, direction)}
          />
        ))}
      </div>

      <section className="border border-line bg-paper p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Provider telemetry</p>
            <h2 className="font-display text-xl">Usage · last {usage.data?.window_days ?? 7} days</h2>
          </div>
          <div className="flex gap-4 text-right text-xs">
            <div>
              <p className="text-ink-muted">Attempts</p>
              <p className="font-display text-2xl">{usage.data?.totals.attempts ?? '—'}</p>
            </div>
            <div>
              <p className="text-ink-muted">Tokens</p>
              <p className="font-display text-2xl">
                {(usage.data?.totals.tokens ?? 0).toLocaleString('en-US')}
              </p>
            </div>
            <div>
              <p className="text-ink-muted">Est. list value</p>
              <p className="font-display text-2xl">{formatUsd(usage.data?.totals.estimated_cost_usd)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Fallbacks</p>
              <p className="font-display text-2xl">{usage.data?.fallback_events ?? 0}</p>
            </div>
          </div>
        </div>

        {usage.isLoading && <LoadingBlock label="Loading AI usage" rows={2} />}
        {usage.isError && <ErrorState title="Usage unavailable" onRetry={() => usage.refetch()} />}
        {usage.data && (
          <>
            {usage.data.providers.length === 0 ? (
              <EmptyState
                title="No provider attempts yet"
                description="Requests that run on the offline rule engine do not create provider usage."
              />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">AI usage by provider</caption>
                  <thead className="border-b border-line text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                    <tr>
                      <th className="py-2 pr-3">Provider</th>
                      <th className="py-2 pr-3 text-right">Success</th>
                      <th className="py-2 pr-3 text-right">Errors</th>
                      <th className="py-2 pr-3 text-right">Skipped</th>
                      <th className="py-2 pr-3 text-right">Tokens</th>
                      <th className="py-2 pr-3 text-right">Avg latency</th>
                      <th className="py-2 text-right">Est. list value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.data.providers.map((entry) => (
                      <tr key={entry.provider} className="border-b border-line/60">
                        <td className="py-2 pr-3">{titleCase(entry.provider)}</td>
                        <td className="py-2 pr-3 text-right">{entry.successes}</td>
                        <td className="py-2 pr-3 text-right">{entry.errors}</td>
                        <td className="py-2 pr-3 text-right">{entry.skipped}</td>
                        <td className="py-2 pr-3 text-right">{entry.tokens.toLocaleString('en-US')}</td>
                        <td className="py-2 pr-3 text-right">
                          {entry.avg_latency_ms ? `${Math.round(entry.avg_latency_ms)} ms` : '—'}
                        </td>
                        <td className="py-2 text-right">{formatUsd(entry.estimated_cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 grid gap-2 text-[0.6875rem] text-ink-muted sm:grid-cols-2">
              <p>
                Limits: {usage.data.limits.daily_requests_per_user} requests and{' '}
                {usage.data.limits.daily_tokens_per_user.toLocaleString('en-US')} tokens per user/day ·{' '}
                {usage.data.limits.max_provider_attempts} provider attempts max ·{' '}
                {usage.data.limits.request_timeout_seconds}s timeout.
              </p>
              <p>{usage.data.note}</p>
            </div>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-line bg-paper p-5">
          <h2 className="font-display text-xl">Recent provider errors</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Sanitised errors only. Prompts, images and credentials are never stored.
          </p>
          {errors.isLoading && <LoadingBlock label="Loading errors" rows={2} />}
          {errors.isError && <ErrorState title="Errors unavailable" onRetry={() => errors.refetch()} />}
          {errors.data && errors.data.items.length === 0 && (
            <p className="mt-4 border border-dashed border-line px-3 py-6 text-center text-xs text-ink-muted">
              No provider errors in this window.
            </p>
          )}
          {errors.data && errors.data.items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {errors.data.items.slice(0, 12).map((entry) => (
                <li key={entry.id} className="border-b border-line/60 pb-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {titleCase(entry.provider)} · {entry.kind}
                    </span>
                    <Badge tone={entry.retryable ? 'gold' : 'danger'}>
                      {entry.retryable ? 'retryable' : 'terminal'}
                    </Badge>
                  </div>
                  <p className="mt-1 break-words text-[0.625rem] text-clay">{entry.error}</p>
                  <p className="mt-0.5 text-[0.5625rem] text-ink-muted">
                    {entry.error_code ?? 'error'} · {formatDateTime(entry.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-line bg-paper p-5">
          <h2 className="font-display text-xl">Fallback events</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Every provider switch is recorded with the failure reason and HTTP status.
          </p>
          {fallbacks.isLoading && <LoadingBlock label="Loading fallbacks" rows={2} />}
          {fallbacks.isError && (
            <ErrorState title="Fallback events unavailable" onRetry={() => fallbacks.refetch()} />
          )}
          {fallbacks.data && fallbacks.data.items.length === 0 && (
            <p className="mt-4 border border-dashed border-line px-3 py-6 text-center text-xs text-ink-muted">
              No fallback events in this window.
            </p>
          )}
          {fallbacks.data && fallbacks.data.items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {fallbacks.data.items.slice(0, 12).map((entry) => (
                <li key={entry.id} className="border-b border-line/60 pb-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {titleCase(entry.from_provider)} → {titleCase(entry.to_provider)}
                    </span>
                    <span className="text-[0.625rem] text-ink-muted">{entry.kind}</span>
                  </div>
                  <p className="mt-1 break-words text-[0.625rem] text-clay">{entry.reason}</p>
                  <p className="mt-0.5 text-[0.5625rem] text-ink-muted">
                    {entry.status_code ? `HTTP ${entry.status_code} · ` : ''}
                    {entry.retryable ? 'retryable · ' : ''}
                    {formatDateTime(entry.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
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
