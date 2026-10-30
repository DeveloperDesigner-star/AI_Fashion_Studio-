import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { Badge, Notice, Progress, Skeleton } from '@/components/ui/Primitives'
import { relativeTime } from '@/lib/format'
import type { AICapabilities, AssistantResponse, ProviderStatus } from '@/lib/types'

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
                <Progress value={quota.tokens_used} max={quota.tokens_limit} label="Tokens" />
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
    </div>
  )
}
