import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesignEditorPage } from '@/pages/DesignEditorPage'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { Design, User } from '@/lib/types'

const fixture = vi.hoisted(() => {
  const garment = {
    id: 'g1',
    slug: 'noor-shalwar-kameez-ivory-lattice',
    name: 'Ivory Lattice Shalwar Kameez',
    brand: 'AI Fashion Studio',
    gender: 'womenswear',
    category: 'shalwar_kameez',
    slot: 'dress',
    description: 'A straight-cut kameez.',
    story: null,
    base_price_cents: 18900,
    currency: 'USD',
    default_fabric: 'cotton',
    default_color: '#f2ede2',
    season: 'all-season',
    styles: [],
    occasions: [],
    sizes: [],
    fit: 'regular',
    tags: [],
    silhouette: 'shalwar_kameez',
    palette: { primary: '#f2ede2', secondary: '#d9cbb4', accent: '#a8846a' },
    is_featured: true,
    is_active: true,
    is_favorite: false,
    created_at: '2026-10-30T00:00:00',
    components: [
      { id: 'kameez_front', label: 'Kameez front', fabrics: ['silk', 'cotton'], allows_print: true, kind: 'front_panel' },
      { id: 'kameez_back', label: 'Kameez back', fabrics: ['silk'], allows_print: true, kind: 'back_panel' },
      { id: 'sleeves', label: 'Sleeves', fabrics: ['silk'], allows_print: true, kind: 'sleeve' },
      { id: 'neckline', label: 'Neckline', fabrics: ['silk'], allows_print: false, kind: 'neckline' },
      { id: 'collar', label: 'Collar / ban', fabrics: ['silk'], allows_print: false, kind: 'collar' },
      { id: 'borders', label: 'Borders & trim', fabrics: ['silk'], allows_print: false, kind: 'border' },
      { id: 'shalwar', label: 'Shalwar', fabrics: ['cotton'], allows_print: true, kind: 'trouser' },
      { id: 'dupatta', label: 'Dupatta', fabrics: ['chiffon'], allows_print: true, kind: 'dupatta' },
    ],
  }
  const design = {
    id: 'd1',
    garment_id: 'g1',
    name: 'Ivory Lattice Shalwar Kameez study',
    status: 'saved',
    components: {
      kameez_front: {
        color: '#7a1f2b',
        fabric: 'silk',
        pattern: 'floral',
        embroidery: 'gold_work',
        layers: [],
        pattern_scale: 1,
        pattern_rotation: 0,
      },
    },
    fit: {},
    notes: 'Keep the dupatta sheer.',
    revision: 3,
    created_at: '2026-10-30T00:00:00',
    updated_at: '2026-10-30T00:00:00',
    garment,
  }
  const library = {
    patterns: [
      { id: 'solid', family: 'plain', label: 'Plain / solid', description: 'Flat dyed fabric.' },
      { id: 'floral', family: 'floral', label: 'Floral', description: 'Blossoms.' },
      { id: 'custom_print', family: 'custom', label: 'Your artwork', description: 'Uploaded artwork.' },
    ],
    families: ['plain', 'floral', 'custom'],
    fabrics: ['cotton', 'silk', 'chiffon'],
    embroideries: ['none', 'thread', 'gold_work'],
    blend_modes: ['normal', 'multiply', 'screen'],
    component_kinds: ['front_panel', 'dupatta'],
    limits: { layers_per_component: 8, layers_per_design: 40, components_per_design: 12 },
  }
  return { garment, design, library }
})

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    fetchers: Record<string, unknown>
  }
  return {
    ...actual,
    fetchers: {
      ...actual.fetchers,
      design: vi.fn(() => Promise.resolve(fixture.design)),
      designLibrary: vi.fn(() => Promise.resolve(fixture.library)),
      media: vi.fn(() =>
        Promise.resolve({ items: [], total: 0, storage_used_bytes: 0, storage_limit_bytes: 0 }),
      ),
    },
  }
})

vi.mock('@/lib/fabricTexture', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, fabricPatternDataUrl: () => 'data:image/png;base64,AAAA' }
})

const user = {
  id: 'u1',
  email: 'studio@example.com',
  full_name: 'Studio User',
  role: 'user',
  is_active: true,
  is_verified: true,
  marketing_opt_in: false,
  onboarded_at: null,
  created_at: '2026-01-01T00:00:00',
} as User

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/editor/d1']}>
        <Routes>
          <Route path="editor/:designId" element={<DesignEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DesignEditorPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user, status: 'authenticated', error: null })
  })

  it('opens a saved design with all eight pieces and its stored layers', async () => {
    renderPage()
    expect(await screen.findByDisplayValue('Ivory Lattice Shalwar Kameez study')).toBeInTheDocument()
    expect(screen.getByText(/rev 3/)).toBeInTheDocument()
    expect(screen.getByText('Keep the dupatta sheer.')).toBeInTheDocument()

    const pieces = ['Kameez front', 'Kameez back', 'Sleeves', 'Neckline', 'Collar / ban', 'Borders & trim', 'Shalwar', 'Dupatta']
    pieces.forEach((label) => {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: 'Artwork layers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export proof' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('switches the active piece and offers its own controls', async () => {
    const tester = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Ivory Lattice Shalwar Kameez study')

    await tester.click(screen.getByRole('button', { name: /Dupatta/ }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Dupatta' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
  })

  it('saves the full layered document with its revision', async () => {
    const tester = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Ivory Lattice Shalwar Kameez study')

    const patch = vi.spyOn(api, 'patch').mockResolvedValue({
      ...fixture.design,
      revision: 4,
      name: 'Ivory Lattice Shalwar Kameez study',
    } as Design)

    await tester.click(screen.getByRole('button', { name: 'Set Colour to #15130f' }))
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeEnabled()
    await tester.click(save)

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    const [path, body] = patch.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(path).toBe('/designs/d1')
    expect(body.revision).toBe(3)
    const components = body.components as Record<string, { layers: unknown[]; color: string }>
    expect(Object.keys(components)).toHaveLength(8)
    expect(components.kameez_front.color).toBe('#15130f')
    expect(components.kameez_front.layers).toEqual([])
  })

  it('switches to a full preview of the combination', async () => {
    const tester = userEvent.setup()
    renderPage()
    await screen.findByDisplayValue('Ivory Lattice Shalwar Kameez study')

    await tester.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('Preview', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Artwork layers' })).not.toBeInTheDocument()
  })
})
