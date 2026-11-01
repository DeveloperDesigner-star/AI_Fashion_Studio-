import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AssistantPage } from '@/pages/AssistantPage'
import type * as QueriesModule from '@/lib/queries'
import { fetchers } from '@/lib/queries'
import type { AICapabilities, AITaskCapability, AITaskResult, ProviderStatus } from '@/lib/types'

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof QueriesModule>()
  return {
    ...actual,
    fetchers: {
      ...actual.fetchers,
      capabilities: vi.fn(),
      aiTask: vi.fn(),
      media: vi.fn(),
    },
  }
})

const provider = (overrides: Partial<ProviderStatus>): ProviderStatus => ({
  name: 'gemini',
  label: 'Google Gemini',
  role: 'primary',
  configured: true,
  enabled: true,
  usable: true,
  text_model: 'gemini-2.5-flash',
  vision_model: 'gemini-2.5-flash',
  supports_vision: true,
  free_tier: true,
  paid: false,
  priority: 10,
  capabilities: [],
  env_key: 'GEMINI_API_KEY',
  reason: null,
  status: 'routing',
  last_tested_at: null,
  last_test_ok: null,
  last_test_latency_ms: null,
  last_test_error: null,
  ...overrides,
})

const task = (key: string, label: string, modality: 'text' | 'vision', available = true): AITaskCapability => ({
  key,
  label,
  description: `${label} description`,
  modality,
  providers: available ? ['gemini'] : [],
  available,
})

const capabilities: AICapabilities = {
  providers: [provider({}), provider({ name: 'groq', label: 'Groq', priority: 20 }), provider({ name: 'openai', label: 'OpenAI', paid: true, free_tier: false, priority: 30 })],
  assistant_mode: 'model',
  vision_available: true,
  daily_quota: {
    requests_used: 1,
    requests_limit: 40,
    tokens_used: 100,
    tokens_limit: 120000,
    estimated_cost_usd: 0.0001,
    resets_at: '2026-10-31T00:00:00Z',
    remaining_requests: 39,
  },
  notice: 'AI provider active: Google Gemini.',
  tasks: [
    task('fashion_chat', 'Fashion chatbot', 'text'),
    task('fashion_recommendations', 'Fashion recommendations', 'text'),
    task('style_recommendations', 'Fashion style recommendations', 'text'),
    task('outfit_combination', 'Outfit combination assistance', 'text'),
    task('design_description', 'Clothing design description', 'text'),
    task('color_suggestions', 'Colour suggestions', 'text'),
    task('design_prompt', 'Design prompt generation', 'text'),
    task('reference_image_analysis', 'Reference image analysis', 'vision'),
    task('pattern_identification', 'Pattern identification', 'vision'),
  ],
  provider_order: ['gemini', 'groq', 'openai'],
  paid_usage_enabled: false,
  retry_policy: { max_provider_attempts: 3, provider_retries: 0, timeout_seconds: 45 },
}

const result = (overrides: Partial<AITaskResult> = {}): AITaskResult => ({
  task: 'fashion_recommendations',
  label: 'Fashion recommendations',
  mode: 'model',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  text: 'Try the poplin shirt with wide trousers.',
  notice: null,
  fallback_used: false,
  attempts: 1,
  prompt_tokens: 100,
  completion_tokens: 40,
  estimated_cost_usd: 0.00013,
  quota: capabilities.daily_quota,
  ...overrides,
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AssistantPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AssistantPage atelier tools', () => {
  it('runs a text service and shows provider, model and estimated cost', async () => {
    vi.mocked(fetchers.capabilities).mockResolvedValue(capabilities)
    vi.mocked(fetchers.media).mockResolvedValue({ items: [], total: 0, storage_used_bytes: 0, storage_limit_bytes: 0 })
    vi.mocked(fetchers.aiTask).mockResolvedValue(result())

    renderPage()
    expect(await screen.findByText('Design and styling services')).toBeInTheDocument()
    expect(screen.getAllByText(/Chain: gemini → groq → openai/).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'Office edit for a client meeting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run service' }))

    await waitFor(() =>
      expect(fetchers.aiTask).toHaveBeenCalledWith('fashion_recommendations', {
        prompt: 'Office edit for a client meeting',
      }),
    )
    expect(await screen.findByText('Try the poplin shirt with wide trousers.')).toBeInTheDocument()
    expect(screen.getAllByText('Google Gemini').length).toBeGreaterThan(0)
    expect(screen.getByText(/0.00013/)).toBeInTheDocument()
  })

  it('requires a private image for a vision task and sends its asset id', async () => {
    vi.mocked(fetchers.capabilities).mockResolvedValue(capabilities)
    vi.mocked(fetchers.media).mockResolvedValue({
      items: [
        {
          id: 'asset-1',
          kind: 'clothing',
          photo_view: null,
          original_filename: 'pattern.jpg',
          mime_type: 'image/jpeg',
          byte_size: 1000,
          width: 800,
          height: 1000,
          created_at: '2026-10-30T10:00:00Z',
          url: '/api/v1/media/asset-1/content',
          thumbnail_url: null,
        },
      ],
      total: 1,
      storage_used_bytes: 1000,
      storage_limit_bytes: 1000000,
    })
    vi.mocked(fetchers.aiTask).mockResolvedValue(
      result({ task: 'pattern_identification', text: 'Small floral repeat, engineered placement.' }),
    )

    renderPage()
    await screen.findByText('Design and styling services')
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'pattern_identification' } })
    await screen.findByRole('option', { name: /pattern\.jpg/ })
    fireEvent.change(screen.getByLabelText('Reference image'), { target: { value: 'asset-1' } })
    fireEvent.change(screen.getByLabelText('What should the analysis focus on?'), {
      target: { value: 'Identify the repeat and reproduction method' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run service' }))

    await waitFor(() =>
      expect(fetchers.aiTask).toHaveBeenCalledWith('pattern_identification', {
        prompt: 'Identify the repeat and reproduction method',
        image_asset_id: 'asset-1',
      }),
    )
    expect(await screen.findByText(/Small floral repeat/)).toBeInTheDocument()
  })

  it('disables unavailable services and never fabricates output', async () => {
    vi.mocked(fetchers.capabilities).mockResolvedValue({
      ...capabilities,
      tasks: capabilities.tasks.map((item) =>
        item.key === 'fashion_recommendations' ? { ...item, available: false, providers: [] } : item,
      ),
    })
    vi.mocked(fetchers.media).mockResolvedValue({ items: [], total: 0, storage_used_bytes: 0, storage_limit_bytes: 0 })

    renderPage()
    await screen.findByText('Design and styling services')
    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'Wedding guest look' } })
    expect(screen.getByRole('button', { name: 'Run service' })).toBeDisabled()
    expect(screen.getByText(/No configured provider is eligible/)).toBeInTheDocument()
    expect(fetchers.aiTask).not.toHaveBeenCalled()
  })
})
