import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminPage } from '@/pages/AdminPage'
import { useAuthStore } from '@/stores/authStore'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    code: string | undefined
    status: number
    constructor(message: string, status = 400, code?: string) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return { api: apiMock, ApiError, setAccessToken: vi.fn(), refreshSession: vi.fn() }
})

const stats = {
  users_total: 4,
  users_new_7d: 1,
  designs_total: 2,
  outfits_total: 1,
  garments_total: 24,
  businesses_total: 2,
  orders_open: 1,
  ai_requests_24h: 0,
  ai_by_provider: {},
  media_storage_bytes: 2048,
}

const usage = {
  window_days: 7,
  providers: [],
  by_kind: [],
  daily: [],
  fallback_events: 0,
  totals: { attempts: 0, tokens: 0, estimated_cost_usd: 0 },
  limits: {
    daily_requests_per_user: 40,
    daily_tokens_per_user: 120000,
    max_provider_attempts: 3,
    provider_retries: 1,
    request_timeout_seconds: 30,
    paid_usage_enabled: false,
  },
  note: 'estimates',
}

const account = {
  id: 'u2',
  email: 'member@example.com',
  full_name: 'Member Account',
  role: 'user',
  is_active: true,
  is_verified: false,
  created_at: '2026-09-01T10:00:00Z',
  last_login_at: null,
}

const report = {
  id: 'r1',
  reporter_id: 'u1',
  target_type: 'user',
  target_id: 'u2',
  category: 'harassment',
  description: 'Repeated abusive messages in an order thread.',
  status: 'open',
  priority: 'high',
  resolution: null,
  reviewed_by_id: null,
  reviewed_at: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
}

const security = {
  accounts: { total: 4, admins: 1, suspended: 0, active_sessions: 3 },
  media: { private_assets: 7, non_private_assets: 0, total_bytes: 4096 },
  queue: { open_reports: 1, open_disputes: 0, pending_deletions: 1, audit_events_24h: 6 },
  policy: {
    password_min_length: 10,
    access_token_expire_minutes: 30,
    refresh_token_expire_days: 14,
    refresh_tokens: 'hashed at rest, rotated on refresh, revoked on password change',
    rate_limit_requests_per_minute: 90,
    auth_rate_limit_per_minute: 12,
    upload_rate_limit_per_minute: 20,
    max_upload_mb: 8,
    max_image_pixels: 24000000,
    cookie_secure: false,
    cookie_samesite: 'lax',
    jwt_algorithm: 'HS256',
    uploads_private_by_default: true,
    media_retention_days: 90,
    paid_ai_enabled: false,
  },
  note: 'Personal photographs are private.',
}

const consent = {
  users_total: 4,
  photo_consent_given: 2,
  photo_consent_missing: 2,
  analysis_opt_in: 1,
  measurement_sharing: 1,
  current_version: '2026-10',
  versions: { '2026-10': 2 },
  recent: [
    {
      id: 'c1',
      user_id: 'u2',
      kind: 'photo_analysis',
      granted: true,
      version: '2026-10',
      actor_id: 'u2',
      note: null,
      detail: {},
      created_at: '2026-10-01T10:00:00Z',
    },
  ],
}

const deletion = {
  id: 'd1',
  user_id: 'u2',
  reason: 'I no longer need the account.',
  status: 'pending',
  admin_note: null,
  decided_by_id: null,
  decided_at: null,
  created_at: '2026-10-02T10:00:00Z',
  user_email: 'member@example.com',
}

function routeGet(path: string) {
  if (path.startsWith('/admin/stats')) return stats
  if (path.startsWith('/admin/ai-usage')) return usage
  if (path.startsWith('/admin/users/') && path.endsWith('/access')) {
    return {
      user_id: 'u2',
      role: 'user',
      is_active: true,
      is_verified: false,
      suspension: null,
      active_sessions: 1,
      sessions: [
        {
          id: 's1',
          created_at: '2026-10-01T10:00:00Z',
          expires_at: '2026-10-15T10:00:00Z',
          revoked_at: null,
          user_agent: 'Safari · iPhone',
          ip_address: '203.0.113.10',
        },
      ],
      consent: {
        photo_consent_at: '2026-09-02T10:00:00Z',
        photo_consent_version: '2026-10',
        allow_photo_analysis: false,
        share_measurements: false,
      },
    }
  }
  if (path.startsWith('/admin/users')) return { items: [account], total: 1 }
  if (path.startsWith('/admin/reports')) return { items: [report], total: 1 }
  if (path.startsWith('/admin/security')) return security
  if (path.startsWith('/admin/consent')) return consent
  if (path.startsWith('/admin/deletion-requests')) return [deletion]
  if (path.startsWith('/admin/ai-spending')) {
    return {
      daily_request_limit: 40,
      daily_token_limit: 120000,
      monthly_budget_usd: null,
      is_paused: false,
      notes: null,
      updated_by_id: null,
      updated_at: '2026-10-01T10:00:00Z',
      paid_usage_enabled: false,
      enforcement: 'daily limits',
    }
  }
  if (path.startsWith('/admin/ai-quota-events')) return { items: [], total: 0 }
  if (path.startsWith('/admin/providers')) return []
  if (path.startsWith('/admin/ai-errors')) return { items: [], total: 0 }
  if (path.startsWith('/admin/ai-fallbacks')) return { items: [], total: 0 }
  if (path.startsWith('/admin/audit-logs')) return { items: [], total: 0 }
  if (path.startsWith('/admin/businesses')) return { items: [], total: 0 }
  if (path.startsWith('/admin/requests')) return { items: [], total: 0 }
  if (path.startsWith('/admin/offerings')) return { items: [], total: 0 }
  if (path.startsWith('/admin/production')) {
    return { counts: { order_received: 0 }, stalled: 0, total: 0, items: [] }
  }
  if (path.startsWith('/admin/disputes')) return { items: [], total: 0 }
  if (path.startsWith('/admin/taxonomy')) {
    return {
      items: [
        {
          id: 't1',
          kind: 'category',
          value: 'modest_activewear',
          label: 'Modest activewear',
          description: '',
          is_active: true,
          is_builtin: false,
          sort_order: 900,
          usage_count: 2,
        },
      ],
      total: 1,
      categories: 1,
      styles: 0,
    }
  }
  if (path.startsWith('/admin/templates')) return { items: [], total: 0 }
  if (path.startsWith('/admin/catalog')) {
    return { items: [], total: 0, page: 1, page_size: 20, facets: { active: 0, inactive: 0 } }
  }
  if (path.startsWith('/admin/assets')) return { items: [], total: 0, total_bytes: 0 }
  if (path.startsWith('/catalog/taxonomy')) {
    return {
      genders: ['womenswear'],
      categories: [],
      category_groups: [],
      slots: [],
      styles: [],
      occasions: [],
      seasons: [],
      fits: [],
      fabrics: [],
    }
  }
  return {}
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({
    user: {
      id: 'admin1',
      email: 'admin@example.com',
      full_name: 'Admin Account',
      role: 'admin',
      is_active: true,
      is_verified: true,
      marketing_opt_in: false,
      onboarded_at: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    status: 'authenticated',
    error: null,
  })
  apiMock.get.mockReset().mockImplementation((path: string) => Promise.resolve(routeGet(path)))
  apiMock.post.mockReset().mockResolvedValue({})
  apiMock.patch.mockReset().mockResolvedValue({})
  apiMock.put.mockReset().mockResolvedValue({})
  apiMock.delete.mockReset().mockResolvedValue(undefined)
})

describe('admin dashboard', () => {
  it('reviews a report with a required resolution note', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Reports' }))

    expect(await screen.findByText('Repeated abusive messages in an order thread.')).toBeInTheDocument()
    const resolve = screen.getByRole('button', { name: 'Resolve' })
    expect(resolve).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Resolution note'), {
      target: { value: 'Warning issued and thread locked.' },
    })
    fireEvent.click(resolve)

    await waitFor(() =>
      expect(apiMock.patch).toHaveBeenCalledWith('/admin/reports/r1', {
        status: 'resolved',
        resolution: 'Warning issued and thread locked.',
      }),
    )
  })

  it('opens an access review and suspends with an audit note', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Users' }))

    expect(await screen.findByText('Member Account')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Access' }))

    expect(await screen.findByText('Suspension, sessions & consent')).toBeInTheDocument()
    expect(await screen.findByText('Safari · iPhone')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Confirmed abuse after review.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/admin/users/u2/suspend', {
        reason: 'policy',
        note: 'Confirmed abuse after review.',
        duration_days: 7,
      }),
    )
  })

  it('shows the security posture and approves erasure', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Security' }))

    expect(await screen.findByText('Authentication, storage and rate limits')).toBeInTheDocument()
    expect(screen.getByText('Uploads private')).toBeInTheDocument()
    expect(screen.getByText('member@example.com')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Decision note'), {
      target: { value: 'Verified by support ticket 42.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve erasure' }))

    await waitFor(() =>
      expect(apiMock.patch).toHaveBeenCalledWith('/admin/deletion-requests/d1', {
        decision: 'approve',
        note: 'Verified by support ticket 42.',
      }),
    )
  })

  it('manages catalogue vocabulary visibility', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Catalogue' }))

    expect(await screen.findByText('Categories, styles and accessories')).toBeInTheDocument()
    expect(await screen.findByText('Modest activewear')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide Modest activewear' }))
    await waitFor(() =>
      expect(apiMock.patch).toHaveBeenCalledWith('/admin/taxonomy/t1', { is_active: false }),
    )
  })
})
