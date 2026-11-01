import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketplacePage } from '@/pages/MarketplacePage'
import { BusinessPage } from '@/pages/BusinessPage'
import { BusinessDashboardPage } from '@/pages/BusinessDashboardPage'
import { OrdersPage } from '@/pages/OrdersPage'
import { OrderDetailPage } from '@/pages/OrderDetailPage'
import { PrintPackagePage } from '@/pages/PrintPackagePage'
import { useAuthStore } from '@/stores/authStore'
import type {
  Business,
  BusinessDetail,
  BusinessReview,
  PrintPackage,
  QuoteRequest,
} from '@/lib/types'

const fixture = vi.hoisted(() => {
  const business: Business = {
    id: 'b1',
    name: 'Northline Print Works',
    slug: 'northline-print-works',
    type: 'printing',
    tagline: 'Reactive and pigment printing, checked at 300 DPI.',
    description: 'Short-run fabric printing for independent studios.',
    city: 'Faisalabad',
    country: 'Pakistan',
    address_line: 'Plot 9, Sargodha Road',
    postal_code: '38000',
    services: ['digital printing', 'screen printing'],
    contact_email: 'studio@northline.example',
    contact_phone: '+92 41 000 0000',
    website: null,
    price_from_cents: 90000,
    currency: 'USD',
    response_time_hours: 12,
    min_order_cents: 500000,
    lead_time_days: 10,
    rating: 4.5,
    review_count: 2,
    is_verified: true,
    is_active: true,
  }

  const review: BusinessReview = {
    id: 'r1',
    business_id: 'b1',
    order_id: 'o1',
    user_id: 'u1',
    rating: 5,
    title: 'Crisp panels',
    body: 'Colour matched the proof exactly.',
    business_reply: 'Thank you — screens stay set up for a reprint.',
    created_at: '2026-10-01T10:00:00Z',
    reviewer_name: 'Amina Studio',
  }

  const detail: BusinessDetail = {
    ...business,
    offerings: [
      {
        id: 'of1',
        business_id: 'b1',
        kind: 'service',
        name: 'Pigment print run',
        description: 'Per-metre pigment printing.',
        category: 'printing',
        pricing_mode: 'per_unit',
        price_cents: 900,
        currency: 'USD',
        unit: 'metre',
        min_quantity: 5,
        lead_time_days: 10,
        is_active: true,
        sort_order: 0,
      },
    ],
    service_areas: [
      {
        id: 'sa1',
        label: 'Faisalabad and Lahore',
        city: 'Faisalabad',
        country: 'Pakistan',
        radius_km: 150,
        remote: false,
        notes: null,
      },
    ],
    portfolio: [
      {
        id: 'p1',
        business_id: 'b1',
        title: 'Indigo yardage',
        description: 'Reactive indigo on khaddar.',
        media_asset_id: 'm1',
        project_date: null,
        sort_order: 0,
        image_url: 'data:image/png;base64,preview',
      },
    ],
    reviews: [review],
  }

  const printPackage: PrintPackage = {
    id: 'pkg1',
    user_id: 'u1',
    design_id: 'd1',
    name: 'Front panel',
    status: 'in_review',
    width_cm: 20,
    height_cm: 30,
    bleed_mm: 3,
    dpi: 300,
    color_profile: 'srgb',
    transparent_background: true,
    notes: null,
    approved_at: null,
    rejection_reason: null,
    manifest: { skipped: [] },
    files: [
      {
        id: 'f1',
        component_id: 'kameez_front',
        label: 'Kameez front',
        width_px: 800,
        height_px: 1200,
        target_width_cm: 20,
        target_height_cm: 30,
        effective_dpi: 101,
        dpi_ok: false,
        has_transparency: true,
        color_space: 'RGB',
        color_profile: 'sRGB',
        warnings: ['101 DPI at 20.0 cm wide is below the requested 300 DPI. Artwork was not upscaled.'],
        content_url: '/api/v1/print/packages/pkg1/files/f1',
        preview_url: null,
        source: 'print_artwork',
      },
    ],
    pdf_url: '/api/v1/print/packages/pkg1/download?format=pdf',
    zip_url: '/api/v1/print/packages/pkg1/download?format=zip',
    is_ai_preview: false,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  }

  const order: QuoteRequest = {
    id: 'o1',
    user_id: 'u1',
    reference_code: 'AFS-1234',
    title: 'Printed front panels',
    description: 'Ten panels on cotton poplin.',
    service_type: 'printing',
    quantity: 10,
    target_date: null,
    budget_cents: 5000000,
    currency: 'USD',
    status: 'confirmed',
    production_status: 'printing_in_progress',
    agreed_amount_cents: 4500000,
    agreed_currency: 'USD',
    design_approved_at: '2026-10-02T10:00:00Z',
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    print_package_id: 'pkg1',
    print_package: printPackage,
    specs: {},
    business,
    quotes: [],
    messages: [],
    events: [],
    review: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z',
  }

  return { business, detail, printPackage, order, review }
})

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    fetchers: Record<string, unknown>
  }
  return {
    ...actual,
    fetchers: {
      ...actual.fetchers,
      businesses: vi.fn(() => Promise.resolve({ items: [fixture.business], total: 1 })),
      business: vi.fn(() => Promise.resolve(fixture.detail)),
      myBusinesses: vi.fn(() => Promise.resolve([fixture.detail])),
      requests: vi.fn(() => Promise.resolve({ items: [fixture.order], total: 1 })),
      request: vi.fn(() => Promise.resolve(fixture.order)),
      printPackages: vi.fn(() =>
        Promise.resolve({
          items: [{ ...fixture.printPackage, id: 'pkg2', name: 'Approved panel', status: 'approved' }, fixture.printPackage],
          total: 2,
        }),
      ),
      printPackage: vi.fn(() => Promise.resolve(fixture.printPackage)),
      printCapabilities: vi.fn(() =>
        Promise.resolve({
          dpi: { min: 150, max: 600, recommended: 300 },
          color_profiles: ['srgb', 'source'],
          color_management: 'Local conversion',
          transparent_background: true,
          exports: ['pdf', 'png_zip'],
          pdf: 'Local PDF writer',
          component_files: true,
          printer_connection: false,
          printer_integrations: [],
          integration_mode: 'manual_export_import',
          note: 'Manual hand-off only.',
        }),
      ),
      orderTransitions: vi.fn(() =>
        Promise.resolve({
          production_status: 'printing_in_progress',
          role: 'customer',
          allowed: ['cancelled'],
          all_states: [],
        }),
      ),
      outfits: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
      designs: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
      approvePrintPackage: vi.fn(() => Promise.resolve({ ...fixture.printPackage, status: 'approved' })),
      updateBusiness: vi.fn(() => Promise.resolve(fixture.business)),
      updateOffering: vi.fn(() => Promise.resolve(fixture.detail.offerings[0])),
    },
  }
})

function renderRoute(path: string, element: React.ReactNode, initial = path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="/login" element={<div>Sign in page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
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
    error: null,
  })
})

describe('MarketplacePage', () => {
  it('lists studios with tagline, rating and a link to the studio page', async () => {
    renderRoute('/marketplace', <MarketplacePage />)
    expect(await screen.findByText('Northline Print Works')).toBeInTheDocument()
    expect(screen.getByText('Reactive and pigment printing, checked at 300 DPI.')).toBeInTheDocument()
    expect(screen.getByText(/4\.5★/)).toBeInTheDocument()
    const link = screen.getAllByRole('link', { name: 'View studio' })[0]
    expect(link).toHaveAttribute('href', '/marketplace/northline-print-works')
  })

  it('offers approved print packages when requesting a quote', async () => {
    renderRoute('/marketplace', <MarketplacePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Request a quote' }))
    expect(await screen.findByLabelText('Attach an approved print package')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Approved panel/ })).toBeInTheDocument()
  })
})

describe('BusinessPage', () => {
  it('shows services, areas, portfolio and reviews with the studio reply', async () => {
    renderRoute('/marketplace/:slug', <BusinessPage />, '/marketplace/northline-print-works')
    expect(await screen.findByRole('heading', { name: 'Northline Print Works' })).toBeInTheDocument()
    expect(screen.getByText('Pigment print run')).toBeInTheDocument()
    expect(screen.getByText('$9 / metre')).toBeInTheDocument()
    expect(screen.getByText('Faisalabad and Lahore')).toBeInTheDocument()
    expect(screen.getByAltText('Indigo yardage')).toBeInTheDocument()
    expect(screen.getByText('Crisp panels')).toBeInTheDocument()
    expect(screen.getByText(/screens stay set up/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request a quote' })).toBeInTheDocument()
    expect(screen.getByText(/Within 12 hours/)).toBeInTheDocument()
  })
})

describe('OrdersPage', () => {
  it('shows the production stage and agreed price on each order', async () => {
    renderRoute('/orders', <OrdersPage />)
    expect(await screen.findByText('Printed front panels')).toBeInTheDocument()
    expect(screen.getByText('Printing in progress')).toBeInTheDocument()
    expect(screen.getByText('Print package')).toBeInTheDocument()
    expect(screen.getByText(/\$45,000/)).toBeInTheDocument()
  })
})

describe('OrderDetailPage', () => {
  it('shows the production timeline, audit stage and attached print artwork', async () => {
    renderRoute('/orders/:id', <OrderDetailPage />, '/orders/o1')
    expect(await screen.findByRole('heading', { name: 'Printed front panels' })).toBeInTheDocument()
    expect(screen.getByText('Production progress')).toBeInTheDocument()
    expect(screen.getAllByText('Printing in progress').length).toBeGreaterThan(0)
    expect(screen.getByText('Order received')).toBeInTheDocument()
    expect(screen.getByText('Ready for delivery')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Front panel' })).toHaveAttribute('href', '/print/pkg1')
    expect(screen.getByText(/review form opens once the order is marked completed/)).toBeInTheDocument()
  })
})

describe('PrintPackagePage', () => {
  it('reports below-target DPI honestly and lets the owner approve', async () => {
    renderRoute('/print/:id', <PrintPackagePage />, '/print/pkg1')
    expect(await screen.findByRole('heading', { name: 'Front panel' })).toBeInTheDocument()
    expect(screen.getByText(/below the 300 DPI target/)).toBeInTheDocument()
    expect(screen.getAllByText(/101 DPI/).length).toBeGreaterThan(0)
    expect(screen.getByText('Print artwork')).toBeInTheDocument()
    expect(screen.getByText(/no direct printer or RIP connection/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve artwork' }))
    await waitFor(async () => {
      const { fetchers } = await import('@/lib/queries')
      expect(fetchers.approvePrintPackage).toHaveBeenCalledWith('pkg1')
    })
  })
})

describe('BusinessDashboardPage', () => {
  it('shows the studio profile with its offerings and keeps pricing editable', async () => {
    renderRoute('/business', <BusinessDashboardPage />)
    expect(await screen.findByRole('heading', { name: 'Northline Print Works' })).toBeInTheDocument()
    expect(screen.getByText('Services & products')).toBeInTheDocument()
    expect(screen.getByText(/\$9 \/ metre/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument()
    expect(screen.queryByText('No image')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    await waitFor(async () => {
      const { fetchers } = await import('@/lib/queries')
      expect(fetchers.updateOffering).toHaveBeenCalledWith('of1', { is_active: false })
    })
  })
})
