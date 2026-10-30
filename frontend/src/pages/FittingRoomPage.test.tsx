import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FittingRoomPage } from '@/pages/FittingRoomPage'
import type { Avatar, Garment, Profile } from '@/lib/types'
import { useStudioStore } from '@/stores/studioStore'

const fixture = vi.hoisted(() => {
  const garment = (overrides: Record<string, unknown>) =>
    ({
      id: 'g',
      slug: 'g',
      name: 'Garment',
      brand: 'AI Fashion Studio',
      gender: 'womenswear',
      category: 'kameez',
      slot: 'dress',
      description: '',
      story: null,
      base_price_cents: 18500,
      currency: 'USD',
      default_fabric: 'cotton',
      default_color: '#8d4f43',
      season: 'all-season',
      styles: [],
      occasions: [],
      sizes: [],
      fit: 'regular',
      tags: [],
      components: [],
      silhouette: 'straight',
      palette: { primary: '#8d4f43' },
      is_featured: true,
      is_active: true,
      is_favorite: false,
      created_at: '2026-01-01T00:00:00',
      ...overrides,
    }) as Garment

  const garments = [
    garment({
      id: 'dress-1',
      slug: 'bias-slip',
      name: 'Bias-Cut Silk Slip Dress',
      slot: 'dress',
      category: 'dress',
      default_color: '#7a1f2b',
      components: [{ id: 'bodice_front', label: 'Bodice', fabrics: ['silk'], allows_print: true, kind: 'bodice_front' }],
    }),
    garment({ id: 'top-1', slug: 'poplin', name: 'Poplin Shirt', slot: 'top', category: 'shirt' }),
    garment({ id: 'bottom-1', slug: 'trouser', name: 'Wide Leg Trouser', slot: 'bottom', category: 'trousers' }),
    garment({ id: 'shoes-1', slug: 'khussa', name: 'Embroidered Khussa', slot: 'footwear', category: 'khussa' }),
    garment({
      id: 'belt-1',
      slug: 'belt',
      name: 'Leather Belt',
      slot: 'accessory',
      category: 'belt',
      default_color: '#3a2a1c',
    }),
    garment({ id: 'outer-1', slug: 'blazer', name: 'Sculpted Blazer', slot: 'outerwear', category: 'blazer' }),
  ]

  const parameters = {
    height_m: 1.72,
    head_height: 0.23,
    neck_width: 0.11,
    shoulder_width: 0.42,
    chest_width: 0.29,
    chest_depth: 0.22,
    waist_width: 0.24,
    waist_depth: 0.18,
    hip_width: 0.31,
    hip_depth: 0.24,
    torso_length: 0.48,
    leg_length: 0.84,
    thigh_width: 0.17,
    calf_width: 0.11,
    arm_length: 0.6,
    shoulder_slope: 'regular',
    posture: 'neutral',
    preset: 'editorial',
    gender_presentation: 'feminine',
    bmi_estimate: null,
    derived_body_shape: 'hourglass',
    fabric_drape: 'balanced',
  }

  const avatars = [
    {
      id: 'a1',
      name: 'Ayesha',
      preset: 'editorial',
      gender_presentation: 'feminine',
      skin_tone: '#c99a76',
      hair_color: '#241c18',
      hair_style: 'bun',
      base_model: 'willow',
      adjustments: { height: 1.02, build: 1, shoulder: 1, torso: 1, leg: 1 },
      source: 'measurements',
      version: 1,
      photo_asset_ids: [],
      parameters,
      measurements_snapshot: {},
      is_primary: true,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
    {
      id: 'a2',
      name: 'Hamza',
      preset: 'tailoring',
      gender_presentation: 'masculine',
      skin_tone: '#a9714b',
      hair_color: '#1c1612',
      hair_style: 'short',
      base_model: 'atlas',
      adjustments: { height: 1.04, build: 1.02, shoulder: 1.05, torso: 1, leg: 1 },
      source: 'measurements',
      version: 1,
      photo_asset_ids: [],
      parameters: { ...parameters, gender_presentation: 'masculine', height_m: 1.8 },
      measurements_snapshot: {},
      is_primary: false,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ] as unknown as Avatar[]

  return { garments, avatars }
})

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    fetchers: Record<string, unknown>
  }
  return {
    ...actual,
    fetchers: {
      ...actual.fetchers,
      garments: vi.fn(() =>
        Promise.resolve({ items: fixture.garments, total: fixture.garments.length, page: 1, page_size: 60, facets: {} }),
      ),
      designs: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
      avatars: vi.fn(() => Promise.resolve(fixture.avatars)),
      profile: vi.fn(() =>
        Promise.resolve({ display_name: 'Demo', style_gender: 'womenswear' } as unknown as Profile),
      ),
      outfits: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    },
  }
})

vi.mock('@/components/fitting/FittingRoomViewport', () => ({
  FittingRoomViewport: (props: { rig: string; look: { pieceIds: string[] } }) =>
    `rig=${props.rig} pieces=${props.look.pieceIds.join(',') || 'none'}`,
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/fitting-room']}>
        <Routes>
          <Route path="fitting-room" element={<FittingRoomPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('FittingRoomPage', () => {
  beforeEach(() => {
    useStudioStore.getState().clear()
    useStudioStore.setState({ showAccessories: true })
  })

  it('loads the primary saved avatar into the rigged viewport', async () => {
    renderPage()
    await screen.findAllByText('Ayesha')
    await waitFor(() => expect(screen.getByText(/rig=female pieces=none/)).toBeInTheDocument())
    expect(screen.getByText('Virtual fitting room')).toBeInTheDocument()
  })

  it('wears a mapped sample and reports it as rigged 3D', async () => {
    renderPage()
    await screen.findAllByText('Ayesha')
    const card = await screen.findByRole('button', { name: /Bias-Cut Silk Slip Dress/i })
    fireEvent.click(card)
    await waitFor(() => expect(screen.getByText(/rig=female pieces=top/)).toBeInTheDocument())
    expect(screen.getByText('Rigged 3D sample')).toBeInTheDocument()
    expect(screen.getByText('Kameez / kurta sample · colour mapped from your design')).toBeInTheDocument()
  })

  it('keeps unsupported catalogue pieces 2D-only instead of pretending to fit', async () => {
    renderPage()
    await screen.findAllByText('Ayesha')
    fireEvent.click(screen.getByRole('button', { name: 'Accessory' }))
    fireEvent.click(await screen.findByRole('button', { name: /Leather Belt/i }))
    await waitFor(() => expect(screen.getByText('2D only · no 3D sample')).toBeInTheDocument())
    expect(screen.getByText(/No fitted 3D sample for this accessory/)).toBeInTheDocument()
    expect(screen.getByText(/rig=female pieces=none/)).toBeInTheDocument()
  })

  it('switches saved avatars and their base rig', async () => {
    renderPage()
    await screen.findAllByText('Ayesha')
    fireEvent.change(screen.getByLabelText('Saved avatar'), { target: { value: 'a2' } })
    await waitFor(() => expect(screen.getByText(/rig=male/)).toBeInTheDocument())
    expect(screen.getAllByText('Hamza').length).toBeGreaterThan(0)
  })

  it('shows the sample-fidelity explanation and no auto-fit claim', async () => {
    renderPage()
    await screen.findAllByText('Ayesha')
    expect(screen.getByText('3D preview fidelity')).toBeInTheDocument()
    expect(screen.getByText(/Catalogue garments are not auto-fitted or cloth-simulated/i)).toBeInTheDocument()
    expect(screen.getByText(/Rigged sample wardrobe/)).toBeInTheDocument()
  })
})
