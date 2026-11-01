import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TryOnPage } from '@/pages/TryOnPage'
import type { Avatar, Design, Garment, Profile, TryOnCapabilities, TryOnSession } from '@/lib/types'

const fixture = vi.hoisted(() => {
  const garment = (overrides: Record<string, unknown>) =>
    ({
      id: 'g',
      slug: 'g',
      name: 'Garment',
      brand: 'AI Fashion Studio',
      gender: 'womenswear',
      category: 'dress',
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
      sizes: ['S', 'M', 'L'],
      fit: 'regular',
      tags: [],
      components: [
        { id: 'bodice_front', label: 'Bodice', fabrics: ['silk'], allows_print: true, kind: 'bodice_front' },
      ],
      silhouette: 'straight',
      palette: { primary: '#8d4f43' },
      is_featured: true,
      is_active: true,
      is_favorite: false,
      created_at: '2026-01-01T00:00:00',
      ...overrides,
    }) as Garment

  const garments = [
    garment({ id: 'dress-1', slug: 'bias-slip', name: 'Bias-Cut Silk Slip Dress' }),
    garment({ id: 'top-1', slug: 'poplin', name: 'Poplin Shirt', slot: 'top', category: 'shirt' }),
    garment({
      id: 'shoes-1',
      slug: 'loafer',
      name: 'Leather Loafer',
      slot: 'footwear',
      category: 'formal_shoes',
      sizes: ['39', '40', '41'],
      default_color: '#4b3428',
    }),
    garment({
      id: 'bag-1',
      slug: 'tote',
      name: 'Structured Tote',
      slot: 'bag',
      category: 'bag',
      sizes: ['one-size'],
    }),
    garment({
      id: 'scarf-1',
      slug: 'silk-scarf',
      name: 'Printed Silk Scarf',
      slot: 'accessory',
      category: 'accessory',
      sizes: ['one-size'],
      default_color: '#c1974a',
    }),
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
      adjustments: { height: 1, build: 1, shoulder: 1, torso: 1, leg: 1 },
      source: 'measurements',
      version: 1,
      photo_asset_ids: [],
      parameters,
      measurements_snapshot: {},
      is_primary: true,
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    },
  ] as unknown as Avatar[]

  const capabilities: TryOnCapabilities = {
    available: false,
    status: 'unavailable',
    provider: 'catvton-self-hosted',
    reason: 'No GPU inference worker is configured in this environment.',
    checks: [
      {
        id: 'worker_configured',
        label: 'GPU inference worker configured',
        ok: false,
        detail: 'No CatVTON worker URL is configured.',
      },
      { id: 'gpu_model', label: 'CatVTON GPU requirements', ok: true, detail: '8 GB VRAM.' },
    ],
    model: {
      name: 'CatVTON',
      license: 'CC BY-NC-SA 4.0',
      license_url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      repository: 'https://github.com/Zheng-Chong/CatVTON',
      paper: 'https://arxiv.org/abs/2407.15886',
      attribution: 'CatVTON authors',
      requirements: ['NVIDIA GPU with at least 8 GB VRAM.'],
      limitations: ['Footwear is shown only in 3D.'],
      commercial_use: false,
    },
    worker: {},
    disclaimer: 'AI previews are approximate illustrations, not a fit guarantee.',
    supported_slots: ['top', 'dress', 'bottom', 'outerwear'],
    environment: {
      api_runs_inference: false,
      requires_self_hosted_worker: true,
      worker_configured: false,
      worker_url_exposed: false,
    },
  }

  const session = {
    id: 's1',
    name: 'Saved look',
    mode: 'avatar',
    status: 'unavailable',
    avatar_id: 'a1',
    photo_asset_id: null,
    garment_asset_id: null,
    result_asset_id: null,
    preview_asset_id: null,
    provider: null,
    model_name: null,
    model_license: null,
    model_license_url: null,
    model_revision: null,
    inference_ms: null,
    generated_at: null,
    error: 'No GPU worker.',
    approximate: true,
    consent_version: null,
    consented_at: null,
    training_opt_in: false,
    metadata: {},
    items: [
      {
        id: 'i1',
        garment_id: 'dress-1',
        design_id: null,
        garment_name: 'Bias-Cut Silk Slip Dress',
        garment_slug: 'bias-slip',
        design_name: null,
        slot: 'dress',
        size: 'M',
        fabric: 'cotton',
        color: '#8d4f43',
        sort_order: 0,
      },
    ],
    original_url: null,
    result_url: null,
    preview_url: null,
    result_thumbnail_url: null,
    preview_thumbnail_url: null,
    comparison: {
      available: false,
      original_url: null,
      customised_url: null,
      original_label: 'Base avatar',
      customised_label: 'Customised 3D look',
      note: 'Use the live 3D Before/After toggle.',
      approximate: true,
    },
    disclaimer: 'Approximate.',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  } as TryOnSession

  const scarfDesign = {
    id: 'design-scarf-1',
    garment_id: 'scarf-1',
    name: 'Bandhani Scarf Study',
    components: {
      body: {
        garment_component_id: 'c1',
        color: '#7d1f2e',
        fabric: 'silk',
        layers: [],
      },
    },
  } as unknown as Design

  return { garments, avatars, capabilities, session, scarfDesign }
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
        Promise.resolve({
          items: fixture.garments,
          total: fixture.garments.length,
          page: 1,
          page_size: 60,
          facets: {},
        }),
      ),
      designs: vi.fn(() => Promise.resolve({ items: [fixture.scarfDesign], total: 1 })),
      designLibrary: vi.fn(() =>
        Promise.resolve({
          fabrics: ['cotton', 'silk', 'linen'],
          patterns: [],
          families: [],
          embroideries: [],
          blend_modes: [],
          component_kinds: [],
          limits: { layers_per_component: 8, layers_per_design: 40, components_per_design: 12 },
        }),
      ),
      avatars: vi.fn(() => Promise.resolve(fixture.avatars)),
      profile: vi.fn(() =>
        Promise.resolve({ display_name: 'Demo', style_gender: 'womenswear' } as unknown as Profile),
      ),
      tryOnCapabilities: vi.fn(() => Promise.resolve(fixture.capabilities)),
      tryOnSessions: vi.fn(() => Promise.resolve({ items: [fixture.session], total: 1 })),
      config: vi.fn(() =>
        Promise.resolve({
          app_name: 'AI Fashion Studio',
          version: 'test',
          environment: 'test',
          limits: { max_upload_mb: 4 },
          features: {},
          providers: [],
          privacy: {},
        }),
      ),
    },
  }
})

vi.mock('@/components/fitting/FittingRoomViewport', () => ({
  FittingRoomViewport: (props: {
    look: { pieceIds: string[]; externalFootwear: boolean; shoeStyle: string }
    captureEnabled?: boolean
    onCaptureReady?: (capture: (() => string | null) | null) => void
  }) => {
    props.onCaptureReady?.(() => 'data:image/png;base64,snapshot')
    return (
      <div data-testid="tryon-viewport">
        pieces={props.look.pieceIds.join(',') || 'none'} shoes=
        {props.look.externalFootwear ? `attached:${props.look.shoeStyle}` : 'none'} capture=
        {props.captureEnabled ? 'on' : 'off'}
      </div>
    )
  },
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/try-on']}>
        <Routes>
          <Route path="try-on" element={<TryOnPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TryOnPage', () => {
  it('shows the real unavailable state and never offers a fabricated AI result', async () => {
    renderPage()
    expect(await screen.findByTestId('tryon-unavailable')).toBeInTheDocument()
    expect(screen.getByText('AI preview unavailable')).toBeInTheDocument()
    expect(screen.getByText('No fabricated result')).toBeInTheDocument()
    expect(screen.getByText('No GPU inference worker is configured in this environment.')).toBeInTheDocument()
    expect(screen.getByText('CC BY-NC-SA 4.0 ·', { exact: false })).toBeInTheDocument()
  })

  it('loads the saved avatar, applies styles and attaches shoes to the rig', async () => {
    renderPage()
    expect(await screen.findByTestId('tryon-viewport')).toHaveTextContent('pieces=top')
    fireEvent.click(screen.getByRole('button', { name: 'Footwear' }))
    fireEvent.click(await screen.findByRole('button', { name: /Leather Loafer/ }))
    expect(screen.getByTestId('tryon-viewport')).toHaveTextContent('pieces=top,footwear')
    expect(screen.getByTestId('tryon-viewport')).toHaveTextContent('shoes=attached:classic')
    expect(screen.getByTestId('tryon-viewport')).toHaveTextContent('capture=on')
  })

  it('offers the generic accessory slot so a dupatta/scarf reaches the rig', async () => {
    renderPage()
    await screen.findByTestId('tryon-viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Accessory' }))
    fireEvent.click(await screen.findByRole('button', { name: /Printed Silk Scarf/ }))
    expect(screen.getByTestId('tryon-viewport')).toHaveTextContent('pieces=top,dupatta')
  })

  it('lets a saved dupatta design and its size be chosen for the 3D accessory', async () => {
    renderPage()
    await screen.findByTestId('tryon-viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Accessory' }))
    fireEvent.click(await screen.findByRole('button', { name: /Printed Silk Scarf/ }))
    expect(screen.getByLabelText('Size · Printed Silk Scarf')).toBeInTheDocument()
    const design = screen.getByLabelText('Saved design · Printed Silk Scarf')
    fireEvent.change(design, { target: { value: 'design-scarf-1' } })
    expect(design).toHaveValue('design-scarf-1')
  })

  it('switches to the base look for an honest before/after comparison', async () => {
    renderPage()
    await screen.findByTestId('tryon-viewport')
    const toggle = screen.getByTestId('compare-base-toggle')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Customised' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('explains photo mode, consent and the disabled AI action without a worker', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: /My photo/ }))
    expect(screen.getByText('No photo yet. Choose a portrait image (at least 480 px tall) to begin.')).toBeInTheDocument()
    const generate = screen.getByRole('button', { name: 'Generate AI preview' })
    expect(generate).toBeDisabled()
    expect(generate).toHaveAttribute('title', 'No GPU inference worker is configured in this environment.')
    expect(screen.getByText('No AI preview has been generated. The source photo is shown for reference only; nothing is being presented as a successful try-on.')).toBeInTheDocument()
  })

  it('lists saved try-ons with an explicit status', async () => {
    renderPage()
    expect(await screen.findByText('Saved look')).toBeInTheDocument()
    expect(screen.getByText('AI unavailable')).toBeInTheDocument()
    expect(screen.getByText('No GPU worker.')).toBeInTheDocument()
  })
})
