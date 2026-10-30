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
  AdminAsset,
  AdminCatalogTerm,
  AdminDeletionRequest,
  AdminDispute,
  AdminList,
  AdminOffering,
  AdminQuotaEvent,
  AdminReport,
  AdminSpendingPolicy,
  AdminStats,
  AdminTemplate,
  AdminUser,
  AuditLogEntry,
  Business,
  Garment,
  GarmentList,
  ProviderSetting,
  ProviderTestResult,
  QuoteRequest,
  UserRole,
} from '@/lib/types'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'reports', label: 'Reports' },
  { id: 'providers', label: 'AI providers' },
  { id: 'catalog', label: 'Catalogue' },
  { id: 'assets', label: 'Assets' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'security', label: 'Security' },
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
          Accounts, reports, catalogue vocabulary, AI spend, marketplace production and privacy
          requests. Every privileged change is written to the audit trail; personal photographs stay
          private and are never browsable here.
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
        {tab === 'reports' && <Reports />}
        {tab === 'providers' && <Providers />}
        {tab === 'catalog' && <CatalogAdmin />}
        {tab === 'assets' && <Assets />}
        {tab === 'marketplace' && <MarketplaceAdmin />}
        {tab === 'security' && <Security />}
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
  const [accessId, setAccessId] = useState<string | null>(null)
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
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setAccessId(user.id)}
                        className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay"
                      >
                        Access
                      </button>
                      <button
                        type="button"
                        onClick={() => update.mutate({ id: user.id, payload: { is_active: !user.is_active } })}
                        className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay"
                      >
                        {user.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.data.items.length === 0 && <EmptyState title="No accounts match" description="Adjust the search or role filter." />}
        </div>
      )}

      {accessId && <AccessPanel userId={accessId} onClose={() => setAccessId(null)} />}
    </div>
  )
}

function AccessPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('policy')
  const [note, setNote] = useState('')
  const [days, setDays] = useState('7')
  const access = useQuery({ queryKey: qk.adminUserAccess(userId), queryFn: () => fetchers.adminUserAccess(userId) })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'user-access', userId] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  const suspend = useMutation({
    mutationFn: () =>
      api.post(`/admin/users/${userId}/suspend`, {
        reason,
        note,
        duration_days: days ? Number(days) : null,
      }),
    onSuccess: () => {
      refresh()
      toast.success('Account suspended')
    },
    onError: (error) => toast.error('Suspension rejected', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const reinstate = useMutation({
    mutationFn: () => api.post(`/admin/users/${userId}/reinstate`, { note }),
    onSuccess: () => {
      refresh()
      toast.success('Account reinstated')
    },
    onError: (error) => toast.error('Reinstatement rejected', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const revoke = useMutation({
    mutationFn: () => api.delete(`/admin/users/${userId}/sessions`),
    onSuccess: () => {
      refresh()
      toast.success('Sessions revoked')
    },
  })

  return (
    <section className="border border-line bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Access review</p>
          <h2 className="font-display text-xl">Suspension, sessions & consent</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {access.isLoading && <LoadingBlock label="Loading access record" rows={2} />}
      {access.isError && <ErrorState title="Access record unavailable" onRetry={() => access.refetch()} />}

      {access.data && (
        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          <div className="space-y-2 text-xs">
            <p className="font-medium uppercase tracking-[0.12em] text-ink-muted">Status</p>
            <p>
              Role: <span className="font-medium">{titleCase(access.data.role)}</span>
            </p>
            <div className="flex flex-wrap gap-1">
              <Badge tone={access.data.is_active ? 'olive' : 'danger'}>
                {access.data.is_active ? 'Active' : 'Suspended / disabled'}
              </Badge>
              <Badge tone={access.data.is_verified ? 'neutral' : 'gold'}>
                {access.data.is_verified ? 'Verified' : 'Unverified'}
              </Badge>
              <Badge tone="neutral">{access.data.active_sessions} sessions</Badge>
            </div>
            {access.data.suspension && (
              <div className="border border-clay/40 bg-clay/5 p-3">
                <p className="font-medium text-clay">{titleCase(access.data.suspension.reason)}</p>
                <p className="mt-1">{access.data.suspension.note || 'No note recorded.'}</p>
                <p className="mt-1 text-ink-muted">
                  Since {formatDateTime(access.data.suspension.created_at)}
                  {access.data.suspension.expires_at
                    ? ` · expires ${formatDateTime(access.data.suspension.expires_at)}`
                    : ' · no expiry'}
                </p>
              </div>
            )}
            <p className="pt-1">
              Photo consent: {access.data.consent.photo_consent_at ? formatDate(access.data.consent.photo_consent_at) : 'not given'}
              {access.data.consent.photo_consent_version ? ` · v${access.data.consent.photo_consent_version}` : ''}
            </p>
            <p>
              Photo analysis: {access.data.consent.allow_photo_analysis ? 'enabled' : 'off'} · Measurements
              shared: {access.data.consent.share_measurements ? 'yes' : 'no'}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
              {access.data.suspension ? 'Reinstate account' : 'Suspend account'}
            </p>
            {!access.data.suspension && (
              <>
                <Select
                  label="Reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  options={[
                    { value: 'policy', label: 'Policy violation' },
                    { value: 'abuse', label: 'Abuse or harassment' },
                    { value: 'fraud', label: 'Fraud / payment' },
                    { value: 'spam', label: 'Spam' },
                    { value: 'security', label: 'Security review' },
                  ]}
                />
                <Input
                  label="Duration (days)"
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  placeholder="blank for indefinite"
                />
              </>
            )}
            <Textarea
              label="Note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Recorded in the audit trail."
            />
            <div className="flex flex-wrap gap-2">
              {access.data.suspension ? (
                <Button size="sm" loading={reinstate.isPending} onClick={() => reinstate.mutate()}>
                  Reinstate
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  loading={suspend.isPending}
                  disabled={!note.trim()}
                  onClick={() => suspend.mutate()}
                >
                  Suspend
                </Button>
              )}
              <Button size="sm" variant="ghost" loading={revoke.isPending} onClick={() => revoke.mutate()}>
                Revoke sessions
              </Button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">Active sessions</p>
            <ul className="mt-2 space-y-2 text-xs">
              {access.data.sessions.map((session) => (
                <li key={session.id} className="border-b border-line/60 pb-2">
                  <p className="font-medium">{session.user_agent ? session.user_agent.slice(0, 48) : 'Unknown client'}</p>
                  <p className="text-ink-muted">
                    {session.ip_address ?? 'no address'} · started {formatDateTime(session.created_at)}
                  </p>
                  <p className="text-ink-muted">expires {formatDate(session.expires_at)}</p>
                </li>
              ))}
              {access.data.sessions.length === 0 && (
                <li className="text-ink-muted">No active refresh sessions.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </section>
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

      <SpendingPanel />

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

      <TaxonomyPanel />
      <TemplatesPanel />
    </div>
  )
}

function TaxonomyPanel() {
  const queryClient = useQueryClient()
  const taxonomy = useQuery({ queryKey: qk.adminTaxonomy, queryFn: fetchers.adminTaxonomy })
  const [draft, setDraft] = useState({ kind: 'category', value: '', label: '', description: '' })
  const [termQuery, setTermQuery] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.adminTaxonomy })
    queryClient.invalidateQueries({ queryKey: qk.taxonomy })
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<AdminCatalogTerm>('/admin/taxonomy', {
        kind: draft.kind,
        value: draft.value.trim().toLowerCase().replace(/\s+/g, '_'),
        label: draft.label.trim(),
        description: draft.description.trim(),
      }),
    onSuccess: () => {
      setDraft({ kind: draft.kind, value: '', label: '', description: '' })
      invalidate()
      toast.success('Vocabulary term added')
    },
    onError: (error) => toast.error('Term not added', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch<AdminCatalogTerm>(`/admin/taxonomy/${id}`, { is_active }),
    onSuccess: () => {
      invalidate()
      toast.success('Visibility updated')
    },
    onError: (error) => toast.error('Visibility not saved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <section className="border border-line bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Discovery vocabulary</p>
          <h2 className="font-display text-xl">Categories, styles and accessories</h2>
          <p className="mt-1 max-w-2xl text-xs text-ink-muted">
            These rows drive catalogue filters and the studio picker. Built-in terms can be renamed or
            hidden; custom terms appear under “More categories”. Hiding a term never rewrites an
            existing garment.
          </p>
        </div>
        <div className="flex gap-2 text-right text-xs">
          <div>
            <p className="text-ink-muted">Categories</p>
            <p className="font-display text-2xl">{taxonomy.data?.categories ?? '—'}</p>
          </div>
          <div>
            <p className="text-ink-muted">Catalogue styles</p>
            <p className="font-display text-2xl">{taxonomy.data?.styles ?? '—'}</p>
          </div>
          <div>
            <p className="text-ink-muted">Profile styles</p>
            <p className="font-display text-2xl">{taxonomy.data?.profile_styles ?? '—'}</p>
          </div>
        </div>
      </div>

      {taxonomy.isLoading && <LoadingBlock label="Loading vocabulary" rows={3} />}
      {taxonomy.isError && <ErrorState title="Vocabulary unavailable" onRetry={() => taxonomy.refetch()} />}

      <div className="mt-4 grid gap-3 border border-line/70 bg-bone/30 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Select
          label="Vocabulary"
          value={draft.kind}
          onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
          options={[
            { value: 'category', label: 'Clothing / footwear category' },
            { value: 'style', label: 'Catalogue style' },
            { value: 'profile_style', label: 'Profile style' },
          ]}
        />
        <Input
          label="Value"
          value={draft.value}
          onChange={(event) => setDraft({ ...draft, value: event.target.value })}
          placeholder="modest_activewear"
        />
        <Input
          label="Label"
          value={draft.label}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder="Modest activewear"
        />
        <Input
          label="Description"
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          placeholder="Optional"
        />
        <Button
          size="sm"
          loading={create.isPending}
          disabled={draft.value.trim().length < 2 || draft.label.trim().length < 2}
          onClick={() => create.mutate()}
        >
          Add term
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:max-w-[260px]">
          <Input
            label="Filter terms"
            value={termQuery}
            onChange={(event) => setTermQuery(event.target.value)}
            placeholder="footwear, accessories, dramatic…"
          />
        </div>
        <p className="text-xs text-ink-muted">
          Shoes and accessories are categories in the same vocabulary and use the same hide/rename controls.
        </p>
      </div>

      <div className="mt-2 max-h-[420px] overflow-auto border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Catalogue vocabulary</caption>
          <thead className="sticky top-0 bg-paper">
            <tr className="border-b border-line text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">In use</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2 text-right">Visible</th>
            </tr>
          </thead>
          <tbody>
            {(taxonomy.data?.items ?? [])
              .filter((term) => {
                const needle = termQuery.trim().toLowerCase()
                if (!needle) return true
                return `${term.label} ${term.value} ${term.group ?? ''}`.toLowerCase().includes(needle)
              })
              .map((term) => (
              <tr key={term.id} className="border-b border-line/60">
                <td className="px-3 py-2">
                  <p className="font-medium">{term.label}</p>
                  <p className="font-mono text-[0.625rem] text-ink-muted">{term.value}</p>
                </td>
                <td className="px-3 py-2 text-xs">{term.group ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{titleCase(term.kind)}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{term.usage_count}</td>
                <td className="px-3 py-2 text-xs text-ink-muted">{term.is_builtin ? 'Built-in' : 'Custom'}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    aria-pressed={term.is_active}
                    aria-label={`${term.is_active ? 'Hide' : 'Show'} ${term.label}`}
                    onClick={() => toggle.mutate({ id: term.id, is_active: !term.is_active })}
                    className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay"
                  >
                    <Badge tone={term.is_active ? 'olive' : 'danger'}>
                      {term.is_active ? 'Visible' : 'Hidden'}
                    </Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TemplatesPanel() {
  const queryClient = useQueryClient()
  const templates = useQuery({ queryKey: qk.adminTemplates, queryFn: fetchers.adminTemplates })
  const garments = useQuery({
    queryKey: ['admin', 'catalog', 'template-targets'],
    queryFn: () => api.get<GarmentList>('/admin/catalog?status=active&page=1&page_size=100'),
  })
  const [templateKey, setTemplateKey] = useState('')
  const [garmentId, setGarmentId] = useState('')

  const apply = useMutation({
    mutationFn: () =>
      api.post<Garment>(`/admin/catalog/${garmentId}/template`, { template_key: templateKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] })
      queryClient.invalidateQueries({ queryKey: ['garments'] })
      toast.success('Garment components replaced')
    },
    onError: (error) => toast.error('Template not applied', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <section className="border border-line bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Garment templates</p>
          <h2 className="font-display text-xl">Pattern-piece library</h2>
          <p className="mt-1 max-w-2xl text-xs text-ink-muted">
            Templates define the cut pieces a garment exposes to the design studio. Applying one
            replaces the component list while keeping saved designs untouched.
          </p>
        </div>
        <Badge tone="neutral">{templates.data?.total ?? 0} templates</Badge>
      </div>

      {templates.isLoading && <LoadingBlock label="Loading templates" rows={2} />}
      {templates.isError && <ErrorState title="Templates unavailable" onRetry={() => templates.refetch()} />}

      <div className="mt-4 grid gap-3 border border-line/70 bg-bone/30 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Select
          label="Template"
          value={templateKey}
          onChange={(event) => setTemplateKey(event.target.value)}
          options={[
            { value: '', label: 'Choose a template' },
            ...(templates.data?.items ?? []).map((template: AdminTemplate) => ({
              value: template.key,
              label: `${template.name} · ${template.component_count} pieces (${template.source})`,
            })),
          ]}
        />
        <Select
          label="Garment"
          value={garmentId}
          onChange={(event) => setGarmentId(event.target.value)}
          options={[
            { value: '', label: 'Choose a garment' },
            ...(garments.data?.items ?? []).map((garment) => ({
              value: garment.id,
              label: `${garment.name} · ${garment.category}`,
            })),
          ]}
        />
        <Button
          size="sm"
          loading={apply.isPending}
          disabled={!templateKey || !garmentId}
          onClick={() => apply.mutate()}
        >
          Apply template
        </Button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(templates.data?.items ?? []).slice(0, 12).map((template: AdminTemplate) => (
          <div key={template.key} className="border border-line/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{template.name}</p>
              <Badge tone="neutral">{template.component_count}</Badge>
            </div>
            <p className="mt-1 text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted">
              {template.source} · {template.garments_using} garments
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
              {template.components.map((component) => component.label).join(' · ')}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function MarketplaceAdmin() {
  const queryClient = useQueryClient()
  const businesses = useQuery({ queryKey: qk.adminBusinesses, queryFn: fetchers.adminBusinesses })
  const requests = useQuery({ queryKey: qk.adminRequests, queryFn: fetchers.adminRequests })

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'verify' | 'unverify' | 'suspend' | 'restore' }) =>
      api.post<Business>(`/admin/businesses/${id}/review`, { decision, note: `Admin ${decision}` }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminBusinesses })
      queryClient.invalidateQueries({ queryKey: ['businesses'] })
      toast.success('Listing updated')
    },
    onError: (error) => toast.error('Listing not updated', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <div className="space-y-6">
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
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {business.is_verified && <Badge tone="olive">Verified</Badge>}
                {!business.is_active && <Badge tone="danger">Suspended</Badge>}
                <button
                  type="button"
                  onClick={() =>
                    review.mutate({ id: business.id, decision: business.is_verified ? 'unverify' : 'verify' })
                  }
                  className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay"
                >
                  {business.is_verified ? 'Unverify' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    review.mutate({ id: business.id, decision: business.is_active ? 'suspend' : 'restore' })
                  }
                  className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay"
                >
                  {business.is_active ? 'Suspend' : 'Restore'}
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

      <OffersPanel />
      <ProductionPanel />
      <DisputesPanel />
    </div>
  )
}

function OffersPanel() {
  const queryClient = useQueryClient()
  const offers = useQuery({ queryKey: qk.adminOffers, queryFn: fetchers.adminOffers })
  const moderate = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/admin/offerings/${id}`, { is_active, note: 'Admin listing review' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminOffers })
      toast.success('Service listing updated')
    },
    onError: (error) => toast.error('Listing not updated', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <section className="border border-line bg-paper">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-display text-xl">Service listings</h2>
        <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
          {offers.data?.total ?? 0} offerings · hiding removes it from public business pages
        </p>
      </div>
      {offers.isLoading && <LoadingBlock label="Loading offerings" rows={3} />}
      {offers.data?.items.length === 0 && (
        <EmptyState title="No service listings" description="Studios publish offerings from their dashboard." />
      )}
      <ul className="divide-y divide-line">
        {(offers.data?.items ?? []).map((offer: AdminOffering) => (
          <li key={offer.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{offer.name}</p>
              <p className="text-xs text-ink-muted">
                {offer.business_name} · {titleCase(offer.kind)} ·{' '}
                {offer.price_cents != null ? formatPrice(offer.price_cents) : titleCase(offer.pricing_mode)}
                {offer.lead_time_days ? ` · ${offer.lead_time_days}d lead` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={offer.is_active ? 'olive' : 'danger'}>{offer.is_active ? 'Live' : 'Hidden'}</Badge>
              <button
                type="button"
                onClick={() => moderate.mutate({ id: offer.id, is_active: !offer.is_active })}
                className="text-[0.625rem] uppercase tracking-[0.1em] hover:text-clay"
              >
                {offer.is_active ? 'Hide' : 'Publish'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ProductionPanel() {
  const production = useQuery({ queryKey: qk.adminProduction, queryFn: fetchers.adminProduction })
  const [status, setStatus] = useState('all')

  const rows = (production.data?.items ?? []).filter(
    (row) => status === 'all' || row.production_status === status,
  )

  return (
    <section className="border border-line bg-paper">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display text-xl">Production status</h2>
          <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
            {production.data?.total ?? 0} orders · {production.data?.stalled ?? 0} stalled ≥ 7 days
          </p>
        </div>
        <div className="w-[220px]">
          <Select
            label="Stage"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: 'all', label: 'All stages' },
              ...Object.entries(production.data?.counts ?? {}).map(([value, count]) => ({
                value,
                label: `${titleCase(value)} (${count})`,
              })),
            ]}
          />
        </div>
      </div>

      {production.isLoading && <LoadingBlock label="Loading production" rows={3} />}
      {production.isError && <ErrorState title="Production unavailable" onRetry={() => production.refetch()} />}
      {production.data && rows.length === 0 && (
        <EmptyState title="No orders at this stage" description="Choose another production stage." />
      )}

      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Production orders</caption>
          <thead className="sticky top-0 bg-paper">
            <tr className="border-b border-line text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Studio</th>
              <th className="px-4 py-2">Print pack</th>
              <th className="px-4 py-2 text-right">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line/60">
                <td className="px-4 py-2">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-[0.625rem] text-ink-muted">
                    {row.reference_code} · {row.customer_email ?? 'deleted member'}
                  </p>
                </td>
                <td className="px-4 py-2">
                  <Badge tone={row.stalled ? 'danger' : 'neutral'}>{titleCase(row.production_status)}</Badge>
                </td>
                <td className="px-4 py-2 text-xs">{row.business_name ?? 'Unassigned'}</td>
                <td className="px-4 py-2 text-xs">{row.print_package_status ? titleCase(row.print_package_status) : '—'}</td>
                <td className="px-4 py-2 text-right text-xs tabular-nums">
                  {row.days_in_status.toFixed(1)}d
                  {row.stalled && <span className="ml-1 text-danger">stalled</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DisputesPanel() {
  const queryClient = useQueryClient()
  const disputes = useQuery({ queryKey: qk.adminDisputes('all'), queryFn: () => fetchers.adminDisputes() })
  const [notes, setNotes] = useState<Record<string, string>>({})

  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'resolved' | 'rejected' }) =>
      api.patch<AdminDispute>(`/admin/disputes/${id}`, { status, resolution: notes[id] ?? '' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] })
      queryClient.invalidateQueries({ queryKey: qk.adminSecurity })
      toast.success('Dispute closed')
    },
    onError: (error) => toast.error('Dispute not updated', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const open = (disputes.data?.items ?? []).filter((row) => row.status === 'open' || row.status === 'reviewing')
  const closed = (disputes.data?.items ?? []).filter((row) => row.status !== 'open' && row.status !== 'reviewing')

  return (
    <section className="border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">Order disputes</h2>
        <Badge tone={open.length ? 'gold' : 'olive'}>{open.length} open</Badge>
      </div>
      {disputes.isLoading && <LoadingBlock label="Loading disputes" rows={2} />}
      {disputes.isError && <ErrorState title="Disputes unavailable" onRetry={() => disputes.refetch()} />}
      {!disputes.isLoading && open.length === 0 && (
        <p className="mt-3 text-xs text-ink-muted">No open disputes. Closed disputes remain below for reference.</p>
      )}
      <div className="mt-3 space-y-3">
        {open.map((dispute) => (
          <article key={dispute.id} className="border border-line/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {titleCase(dispute.reason)} · order {dispute.order_id.slice(0, 8)}…
                </p>
                <p className="mt-1 max-w-2xl text-xs">{dispute.description}</p>
                {dispute.desired_outcome && (
                  <p className="mt-1 text-xs text-ink-muted">Desired: {dispute.desired_outcome}</p>
                )}
              </div>
              <Badge tone="gold">{titleCase(dispute.status)}</Badge>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Textarea
                label="Resolution"
                value={notes[dispute.id] ?? ''}
                onChange={(event) => setNotes({ ...notes, [dispute.id]: event.target.value })}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={resolve.isPending}
                  disabled={!(notes[dispute.id] ?? '').trim()}
                  onClick={() => resolve.mutate({ id: dispute.id, status: 'resolved' })}
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={resolve.isPending}
                  disabled={!(notes[dispute.id] ?? '').trim()}
                  onClick={() => resolve.mutate({ id: dispute.id, status: 'rejected' })}
                >
                  Reject
                </Button>
              </div>
            </div>
          </article>
        ))}
        {closed.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer uppercase tracking-[0.1em] text-ink-muted">
              {closed.length} closed disputes
            </summary>
            <ul className="mt-2 space-y-2">
              {closed.map((dispute) => (
                <li key={dispute.id} className="border-b border-line/60 pb-2">
                  <p className="font-medium">
                    {titleCase(dispute.reason)} · {titleCase(dispute.status)}
                  </p>
                  <p className="text-ink-muted">{dispute.resolution}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
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

// --------------------------------------------------------------------------- //
// Trust & safety
// --------------------------------------------------------------------------- //
function Reports() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')
  const reports = useQuery({
    queryKey: qk.adminReports(status),
    queryFn: () => fetchers.adminReports(status || undefined),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:max-w-[220px]">
          <Select
            label="Queue"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'reviewing', label: 'Reviewing' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'dismissed', label: 'Dismissed' },
              { value: '', label: 'All reports' },
            ]}
          />
        </div>
        <p className="text-xs text-ink-muted">
          Reports mention identifiers only — no private image bytes are exposed to administrators.
        </p>
      </div>

      {reports.isLoading && <LoadingBlock label="Loading reports" rows={3} />}
      {reports.isError && <ErrorState title="Reports unavailable" onRetry={() => reports.refetch()} />}
      {reports.data?.items.length === 0 && (
        <EmptyState title="Queue is clear" description="No reports match this status." />
      )}

      <div className="space-y-3">
        {(reports.data?.items ?? []).map((report) => (
          <ReportRow
            key={report.id}
            report={report}
            onUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
              queryClient.invalidateQueries({ queryKey: qk.adminSecurity })
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ReportRow({ report, onUpdated }: { report: AdminReport; onUpdated: () => void }) {
  const [note, setNote] = useState('')
  const review = useMutation({
    mutationFn: (status: 'resolved' | 'dismissed' | 'reviewing') =>
      api.patch<AdminReport>(`/admin/reports/${report.id}`, {
        status,
        resolution: note || (status === 'reviewing' ? null : report.resolution),
      }),
    onSuccess: () => {
      onUpdated()
      toast.success('Report updated')
    },
    onError: (error) => toast.error('Report not updated', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <article className="border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={report.priority === 'high' ? 'danger' : report.priority === 'low' ? 'neutral' : 'gold'}>
              {report.priority}
            </Badge>
            <Badge tone="neutral">{titleCase(report.target_type)}</Badge>
            <span className="text-xs font-medium">{titleCase(report.category)}</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm">{report.description}</p>
          <p className="mt-1 font-mono text-[0.625rem] text-ink-muted">
            target {report.target_label ?? report.target_id} · reporter{' '}
            {report.reporter_id?.slice(0, 8) ?? 'deleted'}… · {formatDateTime(report.created_at)}
          </p>
        </div>
        <Badge tone={report.status === 'open' ? 'gold' : report.status === 'resolved' ? 'olive' : 'neutral'}>
          {titleCase(report.status)}
        </Badge>
      </div>

      {report.status === 'open' || report.status === 'reviewing' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Textarea
            label="Resolution note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Required before resolving or dismissing."
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" loading={review.isPending} onClick={() => review.mutate('reviewing')}>
              Start review
            </Button>
            <Button size="sm" loading={review.isPending} disabled={!note.trim()} onClick={() => review.mutate('resolved')}>
              Resolve
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={review.isPending}
              disabled={!note.trim()}
              onClick={() => review.mutate('dismissed')}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-line pt-2 text-xs text-ink-muted">
          Resolution: {report.resolution || '—'} · reviewed {report.reviewed_at ? formatDateTime(report.reviewed_at) : '—'}
        </p>
      )}
    </article>
  )
}

// --------------------------------------------------------------------------- //
// AI spending controls
// --------------------------------------------------------------------------- //
function SpendingPanel() {
  const queryClient = useQueryClient()
  const policy = useQuery({ queryKey: qk.adminSpending, queryFn: fetchers.adminSpending })
  const events = useQuery({ queryKey: qk.adminQuotaEvents, queryFn: fetchers.adminQuotaEvents })
  const [draft, setDraft] = useState<{
    daily_request_limit: string
    daily_token_limit: string
    monthly_budget_usd: string
    is_paused: boolean
    notes: string
  } | null>(null)

  const form = draft ?? {
    daily_request_limit: String(policy.data?.daily_request_limit ?? ''),
    daily_token_limit: String(policy.data?.daily_token_limit ?? ''),
    monthly_budget_usd: policy.data?.monthly_budget_usd != null ? String(policy.data.monthly_budget_usd) : '',
    is_paused: policy.data?.is_paused ?? false,
    notes: policy.data?.notes ?? '',
  }

  const update = useMutation({
    mutationFn: () =>
      api.put<AdminSpendingPolicy>('/admin/ai-spending', {
        daily_request_limit: Number(form.daily_request_limit),
        daily_token_limit: Number(form.daily_token_limit),
        monthly_budget_usd: form.monthly_budget_usd.trim() === '' ? null : Number(form.monthly_budget_usd),
        is_paused: form.is_paused,
        notes: form.notes,
      }),
    onSuccess: () => {
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: qk.adminSpending })
      queryClient.invalidateQueries({ queryKey: qk.aiUsage })
      toast.success('Spending controls saved')
    },
    onError: (error) => toast.error('Controls not saved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <section className="border border-line bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Spending controls</p>
          <h2 className="font-display text-xl">Fair-use limits & pause switch</h2>
          <p className="mt-1 max-w-2xl text-xs text-ink-muted">
            Limits are stored server-side and enforced before any provider call. Paid AI remains
            disabled at the deployment level; this switch cannot enable it.
          </p>
        </div>
        <Badge tone={form.is_paused ? 'danger' : 'olive'}>{form.is_paused ? 'Paused' : 'Active'}</Badge>
      </div>

      {policy.isLoading && <LoadingBlock label="Loading spending policy" rows={2} />}
      {policy.isError && <ErrorState title="Spending policy unavailable" onRetry={() => policy.refetch()} />}

      {policy.data && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Daily requests per member"
              value={form.daily_request_limit}
              onChange={(event) => setDraft({ ...form, daily_request_limit: event.target.value })}
              inputMode="numeric"
            />
            <Input
              label="Daily tokens per member"
              value={form.daily_token_limit}
              onChange={(event) => setDraft({ ...form, daily_token_limit: event.target.value })}
              inputMode="numeric"
            />
            <Input
              label="Monthly budget (USD, optional)"
              value={form.monthly_budget_usd}
              onChange={(event) => setDraft({ ...form, monthly_budget_usd: event.target.value })}
              inputMode="decimal"
              placeholder="no cap"
            />
            <div className="flex items-end">
              <Toggle
                label="Pause all AI requests"
                checked={form.is_paused}
                onChange={(checked) => setDraft({ ...form, is_paused: checked })}
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Internal note"
                value={form.notes}
                onChange={(event) => setDraft({ ...form, notes: event.target.value })}
                rows={2}
              />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <Button size="sm" loading={update.isPending} onClick={() => update.mutate()}>
                Save controls
              </Button>
              <span className="text-xs text-ink-muted">
                Paid usage: {policy.data.paid_usage_enabled ? 'enabled' : 'disabled'} · updated{' '}
                {formatDateTime(policy.data.updated_at)}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">Quota events</p>
            <p className="mt-1 text-xs text-ink-muted">
              Denied or unavailable requests are recorded so repeated quota errors are visible.
            </p>
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">
              {(events.data?.items ?? []).map((event: AdminQuotaEvent) => (
                <li key={event.id} className="border-b border-line/60 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {event.kind} · {event.provider}
                    </span>
                    <Badge tone={event.status === 'quota_exceeded' ? 'danger' : 'neutral'}>{event.status}</Badge>
                  </div>
                  <p className="text-ink-muted">{event.error ?? 'No detail'}</p>
                  <p className="text-[0.5625rem] text-ink-muted">
                    {event.user_id ? `member ${event.user_id.slice(0, 8)}… · ` : ''}
                    {event.created_at ? formatDateTime(event.created_at) : 'unknown time'}
                  </p>
                </li>
              ))}
              {events.data?.items.length === 0 && <li className="text-ink-muted">No quota events recorded.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

// --------------------------------------------------------------------------- //
// Asset moderation (metadata only)
function Assets() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const assets = useQuery({
    queryKey: qk.adminAssets({ q, kind }),
    queryFn: () => fetchers.adminAssets({ q: q || undefined, kind: kind || undefined }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] })
      queryClient.invalidateQueries({ queryKey: qk.adminSecurity })
      toast.success('Asset deleted')
    },
    onError: (error) => toast.error('Asset not deleted', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Private by default">
        Administrators see file metadata, never image bytes. Deleting an asset removes the stored file
        and thumbnail immediately; a report can be filed against an asset without exposing it.
      </Notice>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <Input label="Filename search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="portrait" />
        </div>
        <div className="w-full sm:max-w-[200px]">
          <Select
            label="Kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            options={[
              { value: '', label: 'All kinds' },
              { value: 'photo', label: 'Profile photos' },
              { value: 'reference', label: 'References' },
              { value: 'print', label: 'Print files' },
              { value: 'try_on', label: 'Try-on results' },
            ]}
          />
        </div>
        <p className="text-xs text-ink-muted">
          {assets.data?.total ?? 0} assets · {formatBytes(assets.data?.total_bytes ?? 0)}
        </p>
      </div>

      {assets.isLoading && <LoadingBlock label="Loading assets" rows={4} />}
      {assets.isError && <ErrorState title="Assets unavailable" onRetry={() => assets.refetch()} />}
      {assets.data?.items.length === 0 && (
        <EmptyState title="No assets match" description="Adjust the filename or kind filter." />
      )}

      {assets.data && assets.data.items.length > 0 && (
        <div className="overflow-x-auto border border-line bg-paper">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Stored assets</caption>
            <thead>
              <tr className="border-b border-line text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5">Kind</th>
                <th className="px-4 py-2.5">Owner</th>
                <th className="px-4 py-2.5">Size</th>
                <th className="px-4 py-2.5">Privacy</th>
                <th className="px-4 py-2.5">Uploaded</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {assets.data.items.map((asset: AdminAsset) => (
                <tr key={asset.id} className="border-b border-line/60">
                  <td className="px-4 py-2">
                    <p className="max-w-[260px] truncate font-medium">{asset.original_filename}</p>
                    <p className="text-[0.625rem] text-ink-muted">
                      {asset.mime_type} · {asset.width}×{asset.height}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-xs">{titleCase(asset.kind)}</td>
                  <td className="px-4 py-2 font-mono text-[0.625rem] text-ink-muted">{asset.user_id.slice(0, 12)}…</td>
                  <td className="px-4 py-2 text-xs tabular-nums">{formatBytes(asset.byte_size)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={asset.is_private ? 'olive' : 'danger'}>
                      {asset.is_private ? 'Private' : 'Public'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-muted">{formatDate(asset.created_at)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(asset.id)}
                      className="text-[0.625rem] uppercase tracking-[0.1em] text-clay hover:underline disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Security, consent and deletion requests
// --------------------------------------------------------------------------- //
function Security() {
  const queryClient = useQueryClient()
  const security = useQuery({ queryKey: qk.adminSecurity, queryFn: fetchers.adminSecurity })
  const consent = useQuery({ queryKey: qk.adminConsent, queryFn: fetchers.adminConsent })
  const [deletionStatus, setDeletionStatus] = useState('pending')
  const deletions = useQuery({
    queryKey: qk.adminDeletionRequests(deletionStatus),
    queryFn: () => fetchers.adminDeletionRequests(deletionStatus || undefined),
  })

  return (
    <div className="space-y-6">
      {security.isLoading && <LoadingBlock label="Loading security posture" rows={3} />}
      {security.isError && <ErrorState title="Security overview unavailable" onRetry={() => security.refetch()} />}

      {security.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Accounts" value={security.data.accounts.total} hint={`${security.data.accounts.admins} admins`} />
            <StatTile
              label="Suspended"
              value={security.data.accounts.suspended}
              hint={`${security.data.accounts.active_sessions} active sessions`}
            />
            <StatTile
              label="Private assets"
              value={security.data.media.private_assets}
              hint={`${formatBytes(security.data.media.total_bytes)} stored`}
            />
            <StatTile
              label="Open queue"
              value={
                security.data.queue.open_reports +
                security.data.queue.open_disputes +
                security.data.queue.pending_deletions
              }
              hint={`${security.data.queue.audit_events_24h} audit events / 24h`}
            />
          </div>

          <section className="border border-line bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Security posture</p>
                <h2 className="font-display text-xl">Authentication, storage and rate limits</h2>
              </div>
              <Badge tone={security.data.policy.uploads_private_by_default ? 'olive' : 'danger'}>
                Uploads {security.data.policy.uploads_private_by_default ? 'private' : 'public'}
              </Badge>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Password minimum', `${security.data.policy.password_min_length} characters`],
                ['Access token', `${security.data.policy.access_token_expire_minutes} minutes`],
                ['Refresh token', `${security.data.policy.refresh_token_expire_days} days`],
                ['Refresh storage', security.data.policy.refresh_tokens],
                ['JWT algorithm', security.data.policy.jwt_algorithm],
                ['Cookie security', `secure=${String(security.data.policy.cookie_secure)} · samesite=${security.data.policy.cookie_samesite}`],
                ['General rate limit', `${security.data.policy.rate_limit_requests_per_minute}/min`],
                ['Auth rate limit', `${security.data.policy.auth_rate_limit_per_minute}/min`],
                ['Upload rate limit', `${security.data.policy.upload_rate_limit_per_minute}/min`],
                ['Max upload', `${security.data.policy.max_upload_mb} MB`],
                ['Max pixels', security.data.policy.max_image_pixels.toLocaleString()],
                ['Media retention', `${security.data.policy.media_retention_days} days`],
                ['Paid AI', security.data.policy.paid_ai_enabled ? 'enabled' : 'disabled'],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-line/60 pb-1">
                  <dt className="text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">{label}</dt>
                  <dd className="mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-muted">{security.data.note}</p>
          </section>
        </>
      )}

      <section className="border border-line bg-paper p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Consent management</p>
            <h2 className="font-display text-xl">Photo analysis & measurement sharing</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Consent is opt-in, versioned and recorded as an append-only history. Withdrawing consent
              stops analysis; it never exposes a photograph.
            </p>
          </div>
          <div className="w-[180px]">
            <Select
              label="History"
              value="recent"
              onChange={() => undefined}
              options={[{ value: 'recent', label: 'Recent events' }]}
            />
          </div>
        </div>

        {consent.isLoading && <LoadingBlock label="Loading consent summary" rows={2} />}
        {consent.isError && <ErrorState title="Consent summary unavailable" onRetry={() => consent.refetch()} />}

        {consent.data && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Photo consent" value={consent.data.photo_consent_given} hint={`of ${consent.data.users_total} accounts`} />
              <StatTile label="No photo consent" value={consent.data.photo_consent_missing} hint="least-sharing default" />
              <StatTile label="Analysis opt-in" value={consent.data.analysis_opt_in} hint="explicitly allowed" />
              <StatTile label="Measurements shared" value={consent.data.measurement_sharing} hint={`consent v${consent.data.current_version}`} />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <caption className="sr-only">Recent consent events</caption>
                <thead>
                  <tr className="border-b border-line text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2">Scope</th>
                    <th className="px-3 py-2">Decision</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {consent.data.recent.map((record) => (
                    <tr key={record.id} className="border-b border-line/60">
                      <td className="px-3 py-2 text-ink-muted">{formatDateTime(record.created_at)}</td>
                      <td className="px-3 py-2 font-mono text-[0.625rem]">{record.user_id.slice(0, 8)}…</td>
                      <td className="px-3 py-2">{titleCase(record.kind)}</td>
                      <td className="px-3 py-2">
                        <Badge tone={record.granted ? 'olive' : 'danger'}>{record.granted ? 'Granted' : 'Withdrawn'}</Badge>
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {record.note ?? '—'}
                        {record.version ? ` · v${record.version}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="border border-line bg-paper p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Erasure workflow</p>
            <h2 className="font-display text-xl">Account deletion requests</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Approval removes the account, its photographs and every private file, then leaves an
              audit record. Rejection keeps the account and records the note.
            </p>
          </div>
          <div className="w-[180px]">
            <Select
              label="Status"
              value={deletionStatus}
              onChange={(event) => setDeletionStatus(event.target.value)}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'withdrawn', label: 'Withdrawn' },
                { value: '', label: 'All requests' },
              ]}
            />
          </div>
        </div>

        {deletions.isLoading && <LoadingBlock label="Loading deletion requests" rows={2} />}
        {deletions.isError && <ErrorState title="Deletion requests unavailable" onRetry={() => deletions.refetch()} />}
        {deletions.data?.length === 0 && (
          <p className="mt-3 text-xs text-ink-muted">No deletion requests with this status.</p>
        )}
        <div className="mt-3 space-y-3">
          {(deletions.data ?? []).map((request) => (
            <DeletionRow
              key={request.id}
              request={request}
              onDecided={() => {
                queryClient.invalidateQueries({ queryKey: ['admin', 'deletions'] })
                queryClient.invalidateQueries({ queryKey: qk.adminSecurity })
                queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
              }}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function DeletionRow({ request, onDecided }: { request: AdminDeletionRequest; onDecided: () => void }) {
  const [note, setNote] = useState('')
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      api.patch(`/admin/deletion-requests/${request.id}`, { decision, note }),
    onSuccess: () => {
      onDecided()
      toast.success('Deletion request decided')
    },
    onError: (error) => toast.error('Decision not saved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  return (
    <article className="border border-line/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{request.user_email ?? request.user_id}</p>
          <p className="mt-1 text-xs text-ink-muted">{request.reason || 'No reason supplied.'}</p>
          <p className="mt-1 text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted">
            requested {formatDateTime(request.created_at)}
          </p>
        </div>
        <Badge tone={request.status === 'pending' ? 'gold' : request.status === 'approved' ? 'olive' : 'neutral'}>
          {titleCase(request.status)}
        </Badge>
      </div>
      {request.status === 'pending' ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input label="Decision note" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={decide.isPending} onClick={() => decide.mutate('approve')}>
              Approve erasure
            </Button>
            <Button size="sm" variant="ghost" loading={decide.isPending} onClick={() => decide.mutate('reject')}>
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          {request.admin_note || 'No note.'} · {request.decided_at ? formatDateTime(request.decided_at) : '—'}
        </p>
      )}
    </article>
  )
}
