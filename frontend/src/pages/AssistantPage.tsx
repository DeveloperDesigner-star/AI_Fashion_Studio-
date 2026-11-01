import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Select, Textarea } from '@/components/ui/Field'
import { Badge, Notice, Progress, Skeleton } from '@/components/ui/Primitives'
import { relativeTime } from '@/lib/format'
import type { AICapabilities, AITaskCapability, AITaskResult, AssistantResponse, ProviderStatus } from '@/lib/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode?: 'model' | 'rule_based'
  provider?: string
  model?: string | null
  disclaimer?: string | null
  looks?: AssistantResponse['looks']
  at: string
}

const SUGGESTIONS = [
  'Build me an office outfit for a client meeting',
  'What should I wear to a summer wedding?',
  'I need a travel capsule in neutral colours',
  'Which fabrics work best for a tailored trouser?',
]

function providerLabel(providers: ProviderStatus[], name?: string): string {
  if (!name) return 'Studio stylist'
  if (name === 'local') return 'Offline rule engine'
  return providers.find((provider) => provider.name === name)?.label ?? name
}

export function AssistantPage() {
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])

  const capabilities = useQuery<AICapabilities>({ queryKey: qk.capabilities, queryFn: fetchers.capabilities })

  useEffect(() => {
    if (!capabilities.data) return
    setMessages((current) =>
      current.length
        ? current
        : [
            {
              id: 'intro',
              role: 'assistant',
              content: capabilities.data.assistant_mode === 'model'
                ? 'I can style from the studio catalogue using your measurements and recommended size. Tell me the occasion, the season or the mood — and I will put a look together.'
                : 'No AI model is connected to this instance, so I am running the studio’s offline styling rules. I can still assemble looks from the catalogue, factor in your size and suggest fabrics. Add a provider key on the server for generative styling.',
              mode: capabilities.data.assistant_mode === 'model' ? 'model' : 'rule_based',
              provider: capabilities.data.assistant_mode === 'model' ? undefined : 'local',
              at: new Date().toISOString(),
            },
          ],
    )
  }, [capabilities.data])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = useMutation({
    mutationFn: (message: string) =>
      fetchers.assistant({
        message,
        history: messages
          .filter((item) => item.id !== 'intro')
          .slice(-6)
          .map((item) => ({ role: item.role, content: item.content })),
      }),
    onSuccess: (response) => {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.text,
          mode: response.mode,
          provider: response.provider,
          model: response.model,
          disclaimer: response.disclaimer,
          looks: response.looks,
          at: new Date().toISOString(),
        },
      ])
      queryClient.invalidateQueries({ queryKey: qk.capabilities })
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError && error.status === 429 ? 'Daily limit reached' : 'The stylist is unavailable',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      )
    },
  })

  const submit = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length < 2 || send.isPending) return
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: trimmed, at: new Date().toISOString() },
    ])
    setInput('')
    send.mutate(trimmed)
  }

  const quota = capabilities.data?.daily_quota
  const providers = capabilities.data?.providers ?? []

  return (
    <div className="shell py-10">
      <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">AI stylist</p>
          <h1 className="display-lg mt-1">Ask the atelier</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            The stylist reads your measurements, recommended size and the live catalogue. When no
            provider is configured it says so and uses deterministic styling rules.
          </p>
        </div>
        <Link
          to="/fitting-room"
          className="border border-ink px-4 py-2.5 text-[0.6875rem] uppercase tracking-[0.12em] hover:bg-ink hover:text-paper"
        >
          Take it to the fitting room
        </Link>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-h-[60vh] flex-col border border-line bg-paper">
          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-5" aria-live="polite">
            {capabilities.isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-20 w-3/4" />
                <Skeleton className="h-16 w-2/3" />
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
                <div className={message.role === 'user' ? 'max-w-[85%]' : 'max-w-[92%]'}>
                  <div className="mb-1 flex items-center gap-2 text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
                    <span>{message.role === 'user' ? 'You' : 'Studio stylist'}</span>
                    {message.role === 'assistant' && message.mode && (
                      <Badge tone={message.mode === 'model' ? 'olive' : 'neutral'}>
                        {message.mode === 'model' ? providerLabel(providers, message.provider) : 'Rule-based'}
                      </Badge>
                    )}
                    <span>{relativeTime(message.at)}</span>
                  </div>
                  <div
                    className={
                      message.role === 'user'
                        ? 'border border-ink bg-ink px-4 py-3 text-sm leading-relaxed text-paper'
                        : 'border border-line bg-bone/40 px-4 py-3 text-sm leading-relaxed'
                    }
                  >
                    {message.content.split('\n').map((line, index) =>
                      line.trim() ? (
                        <p key={index} className={index === 0 ? '' : 'mt-2'}>
                          {line.replace(/\*\*/g, '')}
                        </p>
                      ) : null,
                    )}
                    {message.looks && message.looks.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-line pt-3">
                        {message.looks.map((look) => (
                          <div key={look.name}>
                            <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                              {look.name}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {look.items.map((item) => (
                                <Link
                                  key={item.slug}
                                  to={`/garment/${item.slug}`}
                                  className="border border-line bg-paper px-2 py-1 text-[0.625rem] hover:border-ink"
                                >
                                  {item.name}
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {message.disclaimer && (
                      <p className="mt-3 border-t border-line pt-2 text-[0.625rem] leading-relaxed text-ink-muted">
                        {message.disclaimer}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {send.isPending && (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="size-1.5 animate-pulse rounded-full bg-ink-muted" />
                  <span className="size-1.5 animate-pulse rounded-full bg-ink-muted [animation-delay:120ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-ink-muted [animation-delay:240ms]" />
                </span>
                Composing a look…
              </div>
            )}
          </div>

          <div className="border-t border-line p-4">
            {messages.length <= 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="border border-line px-2.5 py-1.5 text-left text-[0.6875rem] text-ink-muted hover:border-ink hover:text-ink"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit(input)
              }}
              className="space-y-2"
            >
              <Textarea
                label="Your question"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Describe the occasion, season or the piece you have in mind…"
                className="min-h-20"
                maxLength={2000}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit(input)
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[0.625rem] text-ink-muted">
                  {quota ? `${quota.remaining_requests} of ${quota.requests_limit} daily requests left` : '—'}
                </span>
                <Button type="submit" size="sm" disabled={input.trim().length < 2 || send.isPending}>
                  Send
                </Button>
              </div>
            </form>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="border border-line bg-paper p-4">
            <p className="label-xs">Providers</p>
            <ul className="mt-3 space-y-3">
              {providers.map((provider) => (
                <li key={provider.name} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>{provider.label}</span>
                    <Badge tone={provider.usable ? 'olive' : 'neutral'}>
                      {provider.usable ? 'active' : provider.configured ? 'disabled' : 'no key'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-muted">
                    {provider.role} · {provider.free_tier ? 'free tier' : 'paid tier, opt-in'}
                    {provider.reason ? ` · ${provider.reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {quota && (
            <div className="border border-line bg-paper p-4">
              <p className="label-xs">Daily fair use</p>
              <div className="mt-3 space-y-3">
                <Progress
                  value={quota.requests_used}
                  max={quota.requests_limit}
                  label="Requests"
                />
                <Progress
                  value={quota.tokens_used}
                  max={quota.tokens_limit}
                  label="Tokens"
                  format={(input) => input.toLocaleString('en-US')}
                />
              </div>
              <p className="mt-3 text-[0.625rem] leading-relaxed text-ink-muted">
                Limits protect the free infrastructure. Rule-based replies also count toward the
                request quota so everyone gets a turn.
              </p>
            </div>
          )}

          <Notice tone="info" title="What the stylist can see">
            Your measurements, preferred catalogue, size recommendation and up to 24 catalogue
            pieces. It never sees your email, uploads (unless you run design analysis) or password.
          </Notice>
        </aside>
      </div>

      {capabilities.data && <StudioTools capabilities={capabilities.data} />}
    </div>
  )
}

const TOOL_ORDER = [
  'fashion_recommendations',
  'style_recommendations',
  'outfit_combination',
  'design_description',
  'color_suggestions',
  'design_prompt',
  'reference_image_analysis',
  'pattern_identification',
]

function StudioTools({ capabilities }: { capabilities: AICapabilities }) {
  const tasks = TOOL_ORDER.map((key) =>
    capabilities.tasks.find((task) => task.key === key),
  ).filter((task): task is AITaskCapability => Boolean(task))
  const [taskKey, setTaskKey] = useState(tasks[0]?.key ?? 'fashion_recommendations')
  const [prompt, setPrompt] = useState('')
  const [assetId, setAssetId] = useState('')
  const [result, setResult] = useState<AITaskResult | null>(null)
  const selected = tasks.find((task) => task.key === taskKey)
  const isVision = selected?.modality === 'vision'

  const media = useQuery({
    queryKey: qk.media,
    queryFn: fetchers.media,
    enabled: isVision,
  })

  const run = useMutation({
    mutationFn: () =>
      fetchers.aiTask(taskKey, {
        prompt,
        ...(isVision && assetId ? { image_asset_id: assetId } : {}),
      }),
    onSuccess: (response) => {
      setResult(response)
      if (response.mode === 'unavailable') {
        toast.error('No model result', response.notice ?? 'No capable provider is enabled.')
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError && error.status === 429 ? 'Daily limit reached' : 'Tool unavailable',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      )
    },
  })

  if (tasks.length === 0) return null
  const activeProviders = capabilities.providers.filter((provider) => provider.usable)

  return (
    <section className="mt-6 border border-line bg-paper p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Atelier tools</p>
          <h2 className="font-display text-2xl">Design and styling services</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            The same provider chain powers recommendations, design copy, colour studies, prompts,
            reference analysis and pattern identification. Vision tasks only run on providers that
            support images.
          </p>
        </div>
        <Badge tone={activeProviders.length ? 'olive' : 'neutral'}>
          {activeProviders.length
            ? `Chain: ${activeProviders.map((provider) => provider.name).join(' → ')}`
            : 'Rule engine only'}
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <Select
            label="Service"
            value={taskKey}
            onChange={(event) => {
              setTaskKey(event.target.value)
              setResult(null)
              setAssetId('')
            }}
            options={tasks.map((task) => ({
              value: task.key,
              label: `${task.label}${task.available ? '' : ' (unavailable)'}`,
            }))}
          />
          <p className="text-xs leading-relaxed text-ink-muted">{selected?.description}</p>
          <p className="text-[0.625rem] leading-relaxed text-ink-muted">
            {selected?.available
              ? `Eligible providers: ${selected.providers
                  .map((name) => providersLabel(capabilities.providers, name))
                  .join(', ')}`
              : 'No configured provider is eligible. The tool returns an explicit unavailable notice rather than a fabricated answer.'}
          </p>
          <p className="text-[0.625rem] leading-relaxed text-ink-muted">
            {capabilities.retry_policy.max_provider_attempts} provider attempts max ·{' '}
            {capabilities.retry_policy.timeout_seconds}s timeout ·{' '}
            {capabilities.retry_policy.provider_retries} retries per provider.
          </p>
        </div>

        <div className="space-y-3">
          <Textarea
            label={isVision ? 'What should the analysis focus on?' : 'Brief'}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              isVision
                ? 'Identify the pattern family, repeat and likely reproduction method.'
                : 'Describe the occasion, client, palette and any supplied pieces.'
            }
            maxLength={4000}
            className="min-h-24"
          />
          {isVision && (
            <Select
              label="Reference image"
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
              options={[
                { value: '', label: media.isLoading ? 'Loading files…' : 'Choose a private upload' },
                ...(media.data?.items ?? []).map((asset) => ({
                  value: asset.id,
                  label: `${asset.original_filename} · ${asset.kind}`,
                })),
              ]}
              hint="Only your own uploads are listed. Images are sent inline to the selected provider; nothing is stored in the AI log."
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              loading={run.isPending}
              disabled={
                prompt.trim().length < 2 || !selected?.available || (isVision && !assetId)
              }
              onClick={() => run.mutate()}
            >
              Run service
            </Button>
            <span className="text-[0.625rem] text-ink-muted">
              Quota: {capabilities.daily_quota.remaining_requests} of{' '}
              {capabilities.daily_quota.requests_limit} requests left today.
            </span>
          </div>

          {result && (
            <div className="border border-line bg-bone/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={result.mode === 'model' ? 'olive' : 'gold'}>
                  {result.mode === 'model'
                    ? providersLabel(capabilities.providers, result.provider ?? '')
                    : 'No result'}
                </Badge>
                {result.model && <span className="text-[0.625rem] text-ink-muted">{result.model}</span>}
                {result.fallback_used && <Badge tone="gold">fallback</Badge>}
                {result.estimated_cost_usd != null && (
                  <span className="text-[0.625rem] text-ink-muted">
                    ≈ ${result.estimated_cost_usd.toFixed(5)} list value
                  </span>
                )}
                <span className="ml-auto text-[0.5625rem] text-ink-muted">
                  {result.attempts} attempt{result.attempts === 1 ? '' : 's'}
                </span>
              </div>
              {result.mode === 'model' ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{result.text}</p>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{result.notice}</p>
              )}
              {result.notice && result.mode === 'model' && (
                <p className="mt-3 border-t border-line pt-2 text-[0.625rem] text-ink-muted">
                  {result.notice}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function providersLabel(providers: ProviderStatus[], name: string): string {
  return providers.find((provider) => provider.name === name)?.label ?? name
}
