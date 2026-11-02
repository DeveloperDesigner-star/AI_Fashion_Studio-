import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { DashboardPage } from '@/pages/DashboardPage'
import { useAuthStore } from '@/stores/authStore'
import type { Design, Garment, QuoteRequest } from '@/lib/types'

const fixtures = vi.hoisted(() => {
  const garment: Garment = {
    id: 'g1',
    slug: 'heavyweight-tee',
    name: 'Heavyweight Cotton Tee',
    brand: 'AI Fashion Studio',
    gender: 'menswear',
    category: 'tshirt',
    slot: 'top',
    description: 'A 240 gsm cotton tee with a ribbed neck.',
    story: null,
    base_price_cents: 2400,
    currency: 'USD',
    default_fabric: 'cotton',
    default_color: '#1f1d1a',
    season: 'all-season',
    styles: ['modern'],
    occasions: ['everyday'],
    sizes: ['S', 'M', 'L'],
    fit: 'regular',
    tags: ['tshirt'],
    components: [],
    silhouette: 'tshirt',
    palette: { primary: '#1f1d1a', secondary: '#e7dfd2', accent: '#8f4f27' },
    is_featured: true,
    is_active: true,
    is_favorite: false,
    created_at: '2026-10-01T10:00:00Z',
  }

  const design: Design = {
    id: 'd1',
    garment_id: 'g1',
    name: 'Studio mark tee',
    status: 'saved',
    components: {},
    fit: {},
    notes: null,
    revision: 1,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-04T10:00:00Z',
    garment,
  }

  const draft: Design = { ...design, id: 'd2', name: 'Half-finished hoodie', status: 'draft' }

  const order: QuoteRequest = {
    id: 'o1',
    user_id: 'u1',
    reference_code: 'AFS-4821',
    title: 'Twenty printed tees',
    description: 'Front print on cotton.',
    service_type: 'printing',
    quantity: 20,
    target_date: null,
    budget_cents: 48000,
    currency: 'USD',
    status: 'confirmed',
    production_status: 'printing_in_progress',
    agreed_amount_cents: 45000,
    agreed_currency: 'USD',
    design_approved_at: '2026-10-02T10:00:00Z',
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    print_package_id: null,
    print_package: null,
    specs: {},
    business: null,
    quotes: [],
    messages: [],
    events: [],
    review: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-09T10:00:00Z',
  }

  return { garment, design, draft, order }
})

/** Mutable per-test overrides, read lazily by the mocked fetchers. */
const overrides = vi.hoisted(() => ({
  designs: null as unknown,
  drafts: null as unknown,
  orders: null as unknown,
  featured: null as unknown,
}))

function settle<T>(value: unknown, fallback: T): Promise<T> {
  if (value instanceof Error) return Promise.reject(value)
  return Promise.resolve((value ?? fallback) as T)
}

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    fetchers: Record<string, unknown>
  }
  return {
    ...actual,
    fetchers: {
      ...actual.fetchers,
      profile: vi.fn(() =>
        Promise.resolve({ display_name: 'Amina Studio', measurements: {}, size_recommendation: { available: false } }),
      ),
      designs: vi.fn((params: { status?: string } = {}) =>
        params.status === 'draft'
          ? settle(overrides.drafts, { items: [fixtures.draft], total: 1 })
          : settle(overrides.designs, { items: [fixtures.design, fixtures.draft], total: 2 }),
      ),
      outfits: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
      requests: vi.fn(() => settle(overrides.orders, { items: [fixtures.order], total: 1 })),
      media: vi.fn(() =>
        Promise.resolve({ items: [], total: 0, storage_used_bytes: 0, storage_limit_bytes: 1 }),
      ),
      notifications: vi.fn(() => Promise.resolve({ items: [], unread: 0 })),
      garments: vi.fn(() => settle(overrides.featured, { items: [fixtures.garment], total: 1 })),
    },
  }
})

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree: ReactNode = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(tree)
}

beforeEach(() => {
  overrides.designs = null
  overrides.drafts = null
  overrides.orders = null
  overrides.featured = null
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'amina@example.com',
      full_name: 'Amina Studio',
      role: 'user',
      is_active: true,
      is_verified: true,
      marketing_opt_in: false,
      onboarded_at: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    status: 'authenticated',
  } as never)
})

describe('DashboardPage', () => {
  it('welcomes the member and shows the four workspace metrics', async () => {
    renderDashboard()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Amina')
    expect(screen.getByText('Designed products')).toBeInTheDocument()
    expect(screen.getByText('Saved designs')).toBeInTheDocument()
    expect(screen.getByText('Open orders')).toBeInTheDocument()
    expect(screen.getByText('In production')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('1 saved · 1 draft')).toBeInTheDocument())
  })

  it('lists recent projects and recent orders from the API', async () => {
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Studio mark tee')).toBeInTheDocument())
    expect(screen.getByText('Half-finished hoodie')).toBeInTheDocument()
    expect(screen.getByText('Twenty printed tees')).toBeInTheDocument()
    expect(screen.getByText(/AFS-4821/)).toBeInTheDocument()
  })

  it('renders the quick-start workflow with real completion state', async () => {
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Choose a product')).toBeInTheDocument())
    expect(screen.getByText('Add your artwork')).toBeInTheDocument()
    expect(screen.getByText('Preview the mockup')).toBeInTheDocument()
    expect(screen.getByText('Save your project')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('4 of 4 complete')).toBeInTheDocument())
  })

  it('shows the catalogue shortcut with live products', async () => {
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Heavyweight Cotton Tee')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Product catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Design studio' })).toBeInTheDocument()
  })

  it('falls back to real empty states for a brand new account', async () => {
    overrides.designs = { items: [], total: 0 }
    overrides.drafts = { items: [], total: 0 }
    overrides.orders = { items: [], total: 0 }
    overrides.featured = { items: [], total: 0 }
    renderDashboard()

    await waitFor(() => expect(screen.getByText('No projects yet')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('No orders yet')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('The catalogue is empty right now.')).toBeInTheDocument())
  })

  it('surfaces a retryable error when the design library fails', async () => {
    overrides.designs = new Error('boom')
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Could not load your projects')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
