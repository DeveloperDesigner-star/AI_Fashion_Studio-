import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlueprintReview } from '@/components/design/BlueprintReview'
import { ReferenceUploader } from '@/components/design/ReferenceUploader'
import { DesignReplicationPage } from '@/pages/DesignReplicationPage'
import type {
  Blueprint,
  ReplicationCapabilities,
  ReplicationState,
} from '@/lib/designReplication'

const hoisted = vi.hoisted(() => ({
  capabilities: null as unknown,
  templates: null as unknown,
  state: null as unknown,
  upload: null as unknown,
  rotate: null as unknown,
  crop: null as unknown,
  createDesign: null as unknown,
}))

vi.mock('@/lib/api', () => {
  const ApiError = class extends Error {
    status = 400
    code = 'error'
    constructor(message: string) {
      super(message)
      this.name = 'ApiError'
    }
  }
  return {
    ApiError,
    api: {
      get: vi.fn(),
      post: vi.fn((path: string) => {
        if (path === '/designs') return Promise.resolve(hoisted.createDesign)
        return Promise.resolve(null)
      }),
      patch: vi.fn(),
      delete: vi.fn(),
      upload: vi.fn(),
      raw: vi.fn(),
    },
  }
})

vi.mock('@/lib/designReplication', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown> & {
    replication: Record<string, unknown>
  }
  return {
    ...actual,
    replication: {
      ...actual.replication,
      capabilities: vi.fn(() => Promise.resolve(hoisted.capabilities)),
      templates: vi.fn(() => Promise.resolve(hoisted.templates)),
      state: vi.fn(() => Promise.resolve(hoisted.state)),
      upload: vi.fn(() => Promise.resolve(hoisted.upload)),
      rotate: vi.fn(() => Promise.resolve(hoisted.rotate)),
      crop: vi.fn(() => Promise.resolve(hoisted.crop)),
      attachReference: vi.fn(() => Promise.resolve({})),
      setTarget: vi.fn(() => Promise.resolve({})),
      analyse: vi.fn(),
      correct: vi.fn(),
      render: vi.fn(),
    },
  }
})

const CAPABILITIES: ReplicationCapabilities = {
  analysis: { configured: false, reason: 'No vision-capable AI provider is configured.', provider: null, model: null },
  rendering: { configured: false, reason: 'GEMINI_API_KEY is not set on this server.', provider: null, model: null },
  limits: { max_references_per_design: 6, max_render_bytes: 12582912, renders_per_hour: 12, max_instruction_length: 600 },
  disclosure: 'AI-generated design preview.',
  template_count: 109,
}

const CAPABILITIES_READY: ReplicationCapabilities = {
  analysis: { configured: true, reason: '', provider: null, model: null },
  rendering: { configured: true, reason: '', provider: 'Google Gemini (image)', model: 'gemini-2.5-flash-image' },
  limits: CAPABILITIES.limits,
  disclosure: 'AI-generated design preview.',
  template_count: 109,
}

const TEMPLATES = {
  items: [
    {
      garment_id: 'g-1',
      name: 'Shalwar Kameez',
      slug: 'shalwar-kameez',
      gender: 'womenswear',
      category: 'shalwar_kameez',
      slot: 'dress',
      silhouette: 'shalwar_kameez',
      components: [
        { id: 'body', label: 'Body', fabrics: ['cotton'], allows_print: true },
        { id: 'neckline', label: 'Neckline', fabrics: ['cotton'], allows_print: false },
      ],
    },
  ],
  total: 1,
  note: 'These are the studio\'s own garment templates.',
}

const STATE: ReplicationState = {
  design_id: 'd-1',
  name: 'Reference study',
  garment: {
    id: 'g-1',
    name: 'Shalwar Kameez',
    slot: 'dress',
    category: 'shalwar_kameez',
    silhouette: 'shalwar_kameez',
    components: [
      { id: 'body', label: 'Body' },
      { id: 'neckline', label: 'Neckline' },
    ],
  },
  target_gender: 'women',
  reference: {
    asset_id: 'a-1',
    content_url: '/api/v1/media/a-1/content',
    width: 900,
    height: 1200,
    original_filename: 'ref.jpg',
    reference_revision: 1,
    part_references: {},
  },
  blueprint: null,
  blueprint_meta: { provider: null, model: null, analysed_at: null, slots: [], reference_revision: 1 },
  unknown_fields: [],
  renders: [],
  latest_render_by_view: { front: null, back: null },
  analysis_available: false,
  analysis_reason: 'No vision-capable AI provider is configured on this server.',
  rendering_available: false,
  rendering_reason: 'Design generation needs an image model, and GEMINI_API_KEY is not set.',
  disclosure: 'AI-generated design preview, produced from your reference image.',
  try_on: {
    supported: true,
    photo_mode: true,
    garment_id: 'g-1',
    design_id: 'd-1',
    label: 'Try-on is a separate step and requires your consent.',
  },
}

const ASSET = {
  id: 'a-1',
  kind: 'reference',
  photo_view: null,
  original_filename: 'ref.jpg',
  mime_type: 'image/jpeg',
  byte_size: 240_000,
  width: 900,
  height: 1200,
  created_at: '2026-11-06T00:00:00Z',
  url: '/api/v1/media/a-1/content',
  thumbnail_url: null,
}

const BLUEPRINT: Blueprint = {
  summary: 'A straight-cut kameez with a floral yoke.',
  is_garment_reference: true,
  rejection_reason: null,
  observations: {
    garment_shape: { value: 'straight-cut kameez', confidence: 0.86, note: null, source: 'ai' },
    fabric_appearance: { value: null, confidence: 0, note: null, source: 'ai' },
    neckline: { value: 'round neckline', confidence: 0.8, note: null, source: 'ai' },
    sleeve_design: { value: null, confidence: 0, note: null, source: 'ai' },
    collar: { value: null, confidence: 0, note: null, source: 'ai' },
    embroidered_details: { value: 'dense floral embroidery', confidence: 0.72, note: null, source: 'ai' },
    printed_pattern: { value: null, confidence: 0, note: null, source: 'ai' },
    borders_trims: { value: null, confidence: 0, note: null, source: 'ai' },
    buttons_and_decoration: { value: null, confidence: 0, note: null, source: 'ai' },
  },
  colors: [{ hex: '#e8dcc8', name: 'ivory', role: 'primary', confidence: 0.9 }],
  placements: [{ area: 'front yoke', detail: 'floral spray', confidence: 0.7, source: 'ai' }],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/studio/replicate']}>
        <DesignReplicationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  hoisted.capabilities = CAPABILITIES
  hoisted.templates = TEMPLATES
  hoisted.state = STATE
  hoisted.upload = ASSET
  hoisted.rotate = { asset: { ...ASSET, id: 'a-2' }, meta: { degrees: 90 } }
  hoisted.crop = { asset: { ...ASSET, id: 'a-3' }, meta: { left: 0, top: 0, width: 10, height: 10 } }
  hoisted.createDesign = { id: 'd-1', name: 'Reference study' }
})

describe('ReferenceUploader', () => {
  it('rejects a non-image file before it reaches the server', async () => {
    const onChange = vi.fn()
    render(<ReferenceUploader asset={null} onChange={onChange} onRemove={vi.fn()} />)

    const { replication } = await import('@/lib/designReplication')
    const dropZone = screen.getByText(/Drop an image here/i).closest('div') as HTMLElement
    const file = new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    await waitFor(() =>
      expect(screen.getByText('Choose a JPEG, PNG or WebP image.')).toBeInTheDocument(),
    )
    expect(replication.upload).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('offers crop, rotate, replace and remove once an image is present', () => {
    render(<ReferenceUploader asset={ASSET} onChange={vi.fn()} onRemove={vi.fn()} />)

    for (const label of ['Crop', 'Rotate', 'Replace', 'Remove']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText(/original upload is never modified/i)).toBeInTheDocument()
  })

  it('rotates through the server and hands back the derived asset', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { replication } = await import('@/lib/designReplication')
    render(<ReferenceUploader asset={ASSET} onChange={onChange} onRemove={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Rotate' }))
    await waitFor(() => expect(replication.rotate).toHaveBeenCalledWith('a-1', 90))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-2' })))
  })

  it('removes the reference from the design without deleting the file', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<ReferenceUploader asset={ASSET} onChange={vi.fn()} onRemove={onRemove} />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalled()
  })
})

describe('BlueprintReview', () => {
  it('labels what the model could not see instead of guessing', () => {
    render(<BlueprintReview blueprint={BLUEPRINT} onSave={vi.fn()} />)

    const unknownLabels = screen.getAllByText('Not visible')
    expect(unknownLabels.length).toBe(6)
    expect(screen.getByDisplayValue('round neckline')).toBeInTheDocument()
    // garment_shape, neckline and embroidery are visible; the rest are not.
    expect(screen.getByText('3 identified')).toBeInTheDocument()
  })

  it('sends only the fields the user actually changed', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<BlueprintReview blueprint={BLUEPRINT} onSave={onSave} />)

    const collarInput = screen.getByLabelText('Collar') as HTMLInputElement
    await user.type(collarInput, 'mandarin collar')

    await user.click(screen.getByRole('button', { name: 'Save corrections' }))
    expect(onSave).toHaveBeenCalledWith({
      observations: { collar: { value: 'mandarin collar', confidence: 1 } },
    })
  })

  it('can clear a value back to unknown', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<BlueprintReview blueprint={BLUEPRINT} onSave={onSave} />)

    const necklineInput = screen.getByLabelText('Neckline') as HTMLInputElement
    await user.clear(necklineInput)
    await user.click(screen.getByRole('button', { name: 'Save corrections' }))
    expect(onSave).toHaveBeenCalledWith({
      observations: { neckline: { value: null, confidence: 0 } },
    })
  })
})

describe('DesignReplicationPage', () => {
  it('says plainly that analysis is unavailable rather than offering a dead button', async () => {
    renderPage()

    await waitFor(() =>
      expect(screen.getByText('Automatic analysis is unavailable on this server')).toBeInTheDocument(),
    )
    expect(screen.getByText(/Add a reference to continue/i)).toBeInTheDocument()
  })

  it('walks from reference to garment to an explicit, unavailable analysis state', async () => {
    const user = userEvent.setup()
    renderPage()

    // Step 1 — upload.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['img'], 'ref.jpg', { type: 'image/jpeg' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to garment' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Continue to garment' }))

    // Step 2 — gender is chosen explicitly, never inferred.
    await waitFor(() => expect(screen.getByText('Who is this for?')).toBeInTheDocument())
    expect(screen.getByText(/never inferred from your photo or reference/i)).toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: /Shalwar Kameez/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Shalwar Kameez/ }))
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    // Step 3 — the honest unavailable state, with a manual path offered.
    await waitFor(() => expect(screen.getByText('Analysis is unavailable')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Analyse reference' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Skip and describe by hand' })).toBeEnabled()
  })

  it('disables rendering when no image model is configured', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['img'], 'ref.jpg', { type: 'image/jpeg' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to garment' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Continue to garment' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Shalwar Kameez/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Shalwar Kameez/ }))
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(screen.getByText('Analysis is unavailable')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Skip and describe by hand' }))

    await waitFor(() => expect(screen.getByText('Rendering is unavailable')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Render front view' })).toBeDisabled()
    expect(screen.getByText(/GEMINI_API_KEY is not set/)).toBeInTheDocument()
  })

  it('keeps the four artefacts distinct on the preview step', async () => {
    hoisted.capabilities = CAPABILITIES_READY
    hoisted.state = {
      ...STATE,
      blueprint: BLUEPRINT,
      analysis_available: true,
      rendering_available: true,
      latest_render_by_view: { front: 'render-1', back: null },
    }
    const user = userEvent.setup()
    renderPage()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['img'], 'ref.jpg', { type: 'image/jpeg' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to garment' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Continue to garment' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Shalwar Kameez/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Shalwar Kameez/ }))
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(screen.getByText('What we could see')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Continue to customise' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go to preview' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Go to preview' }))

    await waitFor(() => expect(screen.getByText('Four different things')).toBeInTheDocument())
    expect(screen.getByText('1 · Original reference')).toBeInTheDocument()
    expect(screen.getByText('2 · AI-analyzed design')).toBeInTheDocument()
    expect(screen.getByText('3 · AI-generated clothing design')).toBeInTheDocument()
    expect(screen.getByText('4 · Final user-edited design')).toBeInTheDocument()
    expect(screen.getByText(/not a photograph of a manufactured garment/i)).toBeInTheDocument()
  })
})
