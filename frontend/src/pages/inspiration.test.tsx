import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InspirationSearch, InspirationStatus } from '@/lib/inspiration'
import { InspirationPage } from '@/pages/InspirationPage'

const overrides = vi.hoisted(() => ({
  status: null as unknown,
  search: null as unknown,
}))

const CONFIGURED: InspirationStatus = {
  provider: 'pixabay',
  attribution: 'Fashion Inspiration from Pixabay',
  configured: true,
  available: true,
  cache_ttl_seconds: 86_400,
  max_per_page: 24,
  suggested_searches: [
    { query: 'mens fashion', label: "Men's fashion" },
    { query: 'embroidery', label: 'Embroidery' },
  ],
  note: 'Inspiration imagery is supplied by Pixabay under its content licence.',
}

const UNCONFIGURED: InspirationStatus = {
  ...CONFIGURED,
  configured: false,
  available: false,
  note: 'Fashion inspiration is not configured on this server. An administrator must set PIXABAY_API_KEY before this section can load.',
}

const RESULTS: InspirationSearch = {
  query: 'mens fashion',
  page: 1,
  per_page: 20,
  total: 240,
  has_more: true,
  results: [
    {
      id: 901,
      preview_url: 'https://cdn.pixabay.com/901-640.jpg',
      image_url: 'https://cdn.pixabay.com/901-1280.jpg',
      width: 4000,
      height: 6000,
      tags: ['fashion', 'suit'],
      contributor: 'studio_contributor',
      contributor_id: 42,
      source_page: 'https://pixabay.com/photos/fashion-901/',
      attribution: 'Fashion Inspiration from Pixabay',
    },
  ],
  attribution: 'Fashion Inspiration from Pixabay',
  source_url: 'https://pixabay.com/',
  license_note: 'Images are served by Pixabay under the Pixabay Content License.',
  cached: false,
}

function settle<T>(value: unknown, fallback: T): Promise<T> {
  if (value instanceof Error) return Promise.reject(value)
  return Promise.resolve((value ?? fallback) as T)
}

vi.mock('@/lib/inspiration', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    inspiration: Record<string, unknown>
  }
  return {
    ...actual,
    inspiration: {
      ...actual.inspiration,
      status: vi.fn(() => settle(overrides.status, CONFIGURED)),
      search: vi.fn(() => settle(overrides.search, RESULTS)),
    },
  }
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/inspiration']}>
        <InspirationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  overrides.status = null
  overrides.search = null
})

describe('InspirationPage', () => {
  it('states plainly that inspiration is unconfigured, and shows no stand-in imagery', async () => {
    overrides.status = UNCONFIGURED
    renderPage()

    await waitFor(() => expect(screen.getByText('Inspiration is not configured')).toBeInTheDocument())
    expect(screen.getByText(/PIXABAY_API_KEY/)).toBeInTheDocument()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('renders attributed results with a link back to the source page', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())

    const image = screen.getByRole('img')
    expect(image).toHaveAttribute('src', 'https://cdn.pixabay.com/901-640.jpg')
    expect(image).toHaveAccessibleName(/fashion/i)

    expect(screen.getByText('by studio_contributor')).toBeInTheDocument()
    const source = screen.getByRole('link', { name: 'Source' })
    expect(source).toHaveAttribute('href', 'https://pixabay.com/photos/fashion-901/')
    expect(source).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('never labels inspiration as a product or verified inventory', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())

    // No verification badge element, and no commerce affordances.
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
    expect(screen.queryByText(/add to cart/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument()
    expect(screen.getByText(/never sold, never quoted and never carries a verified badge/i)).toBeInTheDocument()
  })

  it('runs a new search from a suggestion chip', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())

    const { inspiration } = await import('@/lib/inspiration')
    await user.click(screen.getByRole('button', { name: 'Embroidery' }))

    await waitFor(() =>
      expect(inspiration.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'embroidery' })),
    )
  })

  it('shows the empty state when Pixabay returns nothing', async () => {
    overrides.search = { ...RESULTS, results: [], total: 0, has_more: false }
    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/No inspiration for/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('surfaces a retryable error when the upstream fails', async () => {
    overrides.search = new Error('rate limited')
    renderPage()

    await waitFor(() => expect(screen.getByText('Inspiration could not be loaded')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
