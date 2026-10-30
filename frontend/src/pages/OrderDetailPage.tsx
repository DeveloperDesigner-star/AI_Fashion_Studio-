import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge, ErrorState, LoadingBlock, Notice } from '@/components/ui/Primitives'
import { formatDate, formatDateTime, formatPrice, titleCase } from '@/lib/format'
import type { Quote, QuoteRequest } from '@/lib/types'

const timeline = ['submitted', 'quoted', 'confirmed', 'in_production', 'shipped', 'completed']

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [message, setMessage] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteForm, setQuoteForm] = useState({ amount: '', lead_time: '', notes: '' })

  const request = useQuery({
    queryKey: qk.request(id),
    queryFn: () => fetchers.request(id),
    enabled: Boolean(id),
  })

  const postMessage = useMutation({
    mutationFn: () => api.post(`/marketplace/requests/${id}/messages`, { body: message.trim() }),
    onSuccess: () => {
      setMessage('')
      queryClient.invalidateQueries({ queryKey: qk.request(id) })
    },
    onError: (error) =>
      toast.error('Message not sent', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const updateQuote = useMutation({
    mutationFn: ({ quoteId, status }: { quoteId: string; status: 'accepted' | 'declined' | 'withdrawn' }) =>
      api.patch<Quote>(`/marketplace/quotes/${quoteId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.request(id) })
      queryClient.invalidateQueries({ queryKey: qk.requests('outgoing') })
      queryClient.invalidateQueries({ queryKey: qk.requests('incoming') })
      queryClient.invalidateQueries({ queryKey: qk.notifications })
    },
    onError: (error) =>
      toast.error('Quote not updated', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const createQuote = useMutation({
    mutationFn: () =>
      api.post(`/marketplace/requests/${id}/quotes`, {
        amount_cents: Math.round(Number(quoteForm.amount) * 100),
        lead_time_days: quoteForm.lead_time ? Number(quoteForm.lead_time) : null,
        notes: quoteForm.notes || null,
      }),
    onSuccess: () => {
      setQuoteOpen(false)
      setQuoteForm({ amount: '', lead_time: '', notes: '' })
      queryClient.invalidateQueries({ queryKey: qk.request(id) })
      toast.success('Quote submitted')
    },
    onError: (error) =>
      toast.error('Quote not submitted', error instanceof ApiError ? error.message : 'Try again.'),
  })

  if (request.isLoading) {
    return (
      <div className="shell py-12">
        <LoadingBlock label="Loading request" rows={4} />
      </div>
    )
  }

  if (request.isError || !request.data) {
    return (
      <div className="shell py-12">
        <ErrorState title="This request could not be loaded" message="It may have been removed or belongs to another account." />
      </div>
    )
  }

  const data: QuoteRequest = request.data
  const isBusinessSide = user?.role === 'business' || user?.role === 'admin'
  const currentIndex = timeline.indexOf(data.status)

  return (
    <div className="shell py-10">
      <nav className="mb-5 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
        <Link to="/orders" className="hover:text-ink">
          Requests
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="font-mono">{data.reference_code}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <header className="border border-line bg-paper p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{titleCase(data.service_type)}</Badge>
              <Badge tone={data.status === 'cancelled' ? 'danger' : 'olive'}>{titleCase(data.status)}</Badge>
              {data.business && <Badge tone="gold">{data.business.name}</Badge>}
            </div>
            <h1 className="display-md mt-3">{data.title}</h1>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {data.description || 'No brief text provided.'}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-xs sm:grid-cols-4">
              <div>
                <dt className="label-xs">Quantity</dt>
                <dd className="mt-1">{data.quantity}</dd>
              </div>
              <div>
                <dt className="label-xs">Target date</dt>
                <dd className="mt-1">{data.target_date ? formatDate(data.target_date) : 'Flexible'}</dd>
              </div>
              <div>
                <dt className="label-xs">Budget</dt>
                <dd className="mt-1">{data.budget_cents ? formatPrice(data.budget_cents) : 'Open'}</dd>
              </div>
              <div>
                <dt className="label-xs">Created</dt>
                <dd className="mt-1">{formatDate(data.created_at)}</dd>
              </div>
            </dl>
          </header>

          <section className="border border-line bg-paper p-5">
            <h2 className="font-display text-xl">Progress</h2>
            <ol className="mt-4 space-y-3">
              {timeline.map((step, index) => {
                const done = currentIndex >= index && data.status !== 'cancelled'
                return (
                  <li key={step} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex size-5 items-center justify-center border text-[0.5625rem] ${
                        done ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted'
                      }`}
                      aria-hidden="true"
                    >
                      {done ? '✓' : index + 1}
                    </span>
                    <span className={done ? '' : 'text-ink-muted'}>{titleCase(step)}</span>
                  </li>
                )
              })}
            </ol>
            {data.status === 'cancelled' && (
              <div className="mt-4">
                <Notice tone="warn">This request was cancelled.</Notice>
              </div>
            )}
          </section>

          <section className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-display text-xl">Quotes</h2>
              {isBusinessSide && (
                <Button size="sm" variant="outline" onClick={() => setQuoteOpen(true)}>
                  Add quote
                </Button>
              )}
            </div>
            {data.quotes.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">
                No quotes yet. {isBusinessSide ? 'Submit one with your price and lead time.' : 'Studios usually reply within a few days.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.quotes.map((quote) => (
                  <li key={quote.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-display text-xl">{formatPrice(quote.amount_cents, quote.currency)}</p>
                      <p className="text-xs text-ink-muted">
                        {quote.lead_time_days ? `${quote.lead_time_days} days lead time` : 'Lead time on request'} ·{' '}
                        {formatDate(quote.created_at)}
                      </p>
                      {quote.notes && <p className="mt-1 text-sm">{quote.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={quote.status === 'accepted' ? 'olive' : quote.status === 'declined' ? 'danger' : 'neutral'}>
                        {titleCase(quote.status)}
                      </Badge>
                      {quote.status === 'offered' && (
                        <>
                          <Button size="sm" onClick={() => updateQuote.mutate({ quoteId: quote.id, status: 'accepted' })}>
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateQuote.mutate({ quoteId: quote.id, status: 'declined' })}
                          >
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border border-line bg-paper">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-display text-xl">Thread</h2>
              <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                {data.messages.length} messages
              </p>
            </div>
            <div className="max-h-80 space-y-3 overflow-y-auto p-4">
              {data.messages.length === 0 && (
                <p className="text-xs text-ink-muted">No messages yet. Clarify the brief or ask about fabric availability.</p>
              )}
              {data.messages.map((entry) => (
                <div key={entry.id} className="border border-line bg-bone/30 px-3 py-2">
                  <p className="text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">
                    {entry.author_id === user?.id ? 'You' : 'Partner'} · {formatDateTime(entry.created_at)}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">{entry.body}</p>
                </div>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (message.trim()) postMessage.mutate()
              }}
              className="space-y-2 border-t border-line p-4"
            >
              <Textarea
                label="Message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-20"
                maxLength={2000}
              />
              <Button type="submit" size="sm" block loading={postMessage.isPending} disabled={!message.trim()}>
                Send message
              </Button>
            </form>
          </section>

          <section className="border border-line bg-paper p-4 text-xs leading-relaxed text-ink-muted">
            <p className="label-xs">Privacy</p>
            <p className="mt-2">
              Measurements are attached to the technical pack you send, not published. Payment and
              shipping are arranged directly with the studio — the platform does not process
              payments.
            </p>
            <p className="mt-2">
              Need a copy of the outfit spec? Export the technical pack from your outfit library.
            </p>
          </section>
        </aside>
      </div>

      <Modal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        title="Submit a quote"
        description="Attach a price and lead time. The client can accept or decline in the thread."
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createQuote.mutate()}
              loading={createQuote.isPending}
              disabled={!quoteForm.amount}
            >
              Send quote
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Amount"
            type="number"
            min="0"
            suffix="USD"
            value={quoteForm.amount}
            onChange={(event) => setQuoteForm({ ...quoteForm, amount: event.target.value })}
          />
          <Input
            label="Lead time (days)"
            type="number"
            min="1"
            value={quoteForm.lead_time}
            onChange={(event) => setQuoteForm({ ...quoteForm, lead_time: event.target.value })}
          />
          <Textarea
            label="Notes"
            value={quoteForm.notes}
            onChange={(event) => setQuoteForm({ ...quoteForm, notes: event.target.value })}
            placeholder="Included fittings, fabric sourcing, shipping assumptions…"
            maxLength={2000}
          />
        </div>
      </Modal>
    </div>
  )
}
