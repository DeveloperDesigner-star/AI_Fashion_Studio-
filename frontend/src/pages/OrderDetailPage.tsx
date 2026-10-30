import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge, ErrorState, LoadingBlock, Notice } from '@/components/ui/Primitives'
import { formatDate, formatDateTime, formatPrice, titleCase } from '@/lib/format'
import {
  productionLabel,
  productionStages,
  productionTone,
  stageIndex,
  printStatusLabels,
} from '@/lib/marketplace'
import type { BusinessReview, PrintPackage, Quote, QuoteRequest } from '@/lib/types'

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [message, setMessage] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteForm, setQuoteForm] = useState({ amount: '', lead_time: '', notes: '' })
  const [printOpen, setPrintOpen] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: '5', title: '', body: '' })
  const [reply, setReply] = useState('')
  const [attachId, setAttachId] = useState('')

  const request = useQuery({
    queryKey: qk.request(id),
    queryFn: () => fetchers.request(id),
    enabled: Boolean(id),
  })
  const transitions = useQuery({
    queryKey: ['request-transitions', id],
    queryFn: () => fetchers.orderTransitions(id),
    enabled: Boolean(id),
  })
  const approvedPackages = useQuery({
    queryKey: qk.printPackages('mine'),
    queryFn: () => fetchers.printPackages('mine'),
    enabled: Boolean(user),
  })

  const invalidateOrder = () => {
    queryClient.invalidateQueries({ queryKey: qk.request(id) })
    queryClient.invalidateQueries({ queryKey: ['request-transitions', id] })
    queryClient.invalidateQueries({ queryKey: qk.requests('outgoing') })
    queryClient.invalidateQueries({ queryKey: qk.requests('incoming') })
    queryClient.invalidateQueries({ queryKey: qk.notifications })
  }

  const advance = useMutation({
    mutationFn: ({ status, note }: { status: string; note?: string }) =>
      fetchers.setProductionStatus(id, status, note),
    onSuccess: (updated) => {
      invalidateOrder()
      toast.success('Production stage updated', productionLabel(updated.production_status))
    },
    onError: (error) =>
      toast.error('Stage not updated', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const attachPackage = useMutation({
    mutationFn: (packageId: string) => fetchers.attachPrintPackage(id, packageId),
    onSuccess: () => {
      invalidateOrder()
      setPrintOpen(false)
      toast.success('Print package attached')
    },
    onError: (error) =>
      toast.error('Package not attached', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const submitReview = useMutation({
    mutationFn: () =>
      fetchers.reviewOrder(id, {
        rating: Number(reviewForm.rating),
        title: reviewForm.title.trim(),
        body: reviewForm.body.trim(),
      }),
    onSuccess: () => {
      invalidateOrder()
      toast.success('Review published', 'Thank you — the studio can reply once.')
    },
    onError: (error) =>
      toast.error('Review not published', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const cancelOrder = useMutation({
    mutationFn: () => api.delete(`/marketplace/requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.requests('outgoing') })
      queryClient.invalidateQueries({ queryKey: qk.requests('incoming') })
      toast.success('Order cancelled')
      navigate('/orders')
    },
    onError: (error) =>
      toast.error('Order not cancelled', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const sendReply = useMutation({
    mutationFn: (review: BusinessReview) => fetchers.replyToReview(review.id, reply.trim()),
    onSuccess: () => {
      invalidateOrder()
      setReply('')
      toast.success('Reply published')
    },
    onError: (error) =>
      toast.error('Reply not sent', error instanceof ApiError ? error.message : 'Try again.'),
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
  const currentIndex = stageIndex(data.production_status)
  const canAdvance = transitions.data?.allowed.filter((state) => state !== 'cancelled') ?? []
  const cancelled = data.production_status === 'cancelled'

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
              <Badge tone={productionTone(data.production_status)}>
                {productionLabel(data.production_status)}
              </Badge>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-xl">Production progress</h2>
                <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                  {productionLabel(data.production_status)}
                </p>
              </div>
              <div className="flex items-center gap-2">
              {transitions.data?.role && <Badge tone="neutral">You are the {transitions.data.role}</Badge>}
              {data.user_id === user?.id &&
                data.production_status !== 'completed' &&
                data.production_status !== 'cancelled' && (
                  <Button size="sm" variant="ghost" onClick={() => cancelOrder.mutate()} loading={cancelOrder.isPending}>
                    Cancel order
                  </Button>
                )}
            </div>
            </div>
            <ol className="mt-4 space-y-3">
              {productionStages.map((step, index) => {
                const done = !cancelled && currentIndex >= index
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
                    <span className={done ? '' : 'text-ink-muted'}>{productionLabel(step)}</span>
                  </li>
                )
              })}
            </ol>
            {cancelled && (
              <div className="mt-4">
                <Notice tone="warn">
                  This order was cancelled{data.cancellation_reason ? `: ${data.cancellation_reason}` : '.'}
                </Notice>
              </div>
            )}
            {canAdvance.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {canAdvance.map((state) => (
                  <Button
                    key={state}
                    size="sm"
                    variant={state === 'completed' ? 'primary' : 'outline'}
                    onClick={() => advance.mutate({ status: state })}
                    loading={advance.isPending && advance.variables?.status === state}
                  >
                    Move to {productionLabel(state)}
                  </Button>
                ))}
              </div>
            )}
            {transitions.data && canAdvance.length === 0 && !cancelled && (
              <p className="mt-3 text-xs text-ink-muted">
                No action is available to you at this stage. {transitions.data.role === 'customer'
                  ? 'The studio moves the order through production.'
                  : 'Waiting on the customer to approve the quote or the finished work.'}
              </p>
            )}
            {data.events.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="label-xs">Audit trail</p>
                <ol className="mt-2 space-y-2 text-xs text-ink-muted">
                  {data.events.map((event) => (
                    <li key={event.id}>
                      <span className="text-ink">{productionLabel(event.to_status)}</span> ·{' '}
                      {formatDateTime(event.created_at)}
                      {event.note ? ` — ${event.note}` : ''}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <section className="border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="font-display text-xl">Print package</h2>
                <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                  Production artwork — not an AI preview
                </p>
              </div>
              {!data.print_package && !isBusinessSide && (
                <Button size="sm" variant="outline" onClick={() => setPrintOpen(true)}>
                  Attach package
                </Button>
              )}
            </div>
            {data.print_package ? (
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link to={`/print/${data.print_package.id}`} className="font-display text-lg hover:text-clay">
                      {data.print_package.name}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      <Badge tone={data.print_package.status === 'approved' ? 'olive' : 'gold'}>
                        {printStatusLabels[data.print_package.status] ?? data.print_package.status}
                      </Badge>{' '}
                      {data.print_package.width_cm} × {data.print_package.height_cm} cm ·{' '}
                      {data.print_package.dpi} DPI · {data.print_package.files.length} files
                    </p>
                  </div>
                  <Link to={`/print/${data.print_package.id}`} className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted hover:text-ink">
                    Open & download
                  </Link>
                </div>
                {data.print_package.files.some((file) => !file.dpi_ok) && (
                  <div className="mt-3">
                    <Notice tone="warn">
                      Some component files are below the {data.print_package.dpi} DPI target. They are not upscaled.
                    </Notice>
                  </div>
                )}
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-ink-muted">
                No print package attached. Only approved packages can be sent to production.
              </p>
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
          <section className="border border-line bg-paper">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-display text-xl">Review</h2>
              <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                Reviews open after completion · one per order
              </p>
            </div>
            {data.review ? (
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-lg">{data.review.title}</p>
                  <span className="text-xs text-gold" aria-label={`${data.review.rating} out of 5`}>
                    {'★'.repeat(data.review.rating)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {data.review.reviewer_name ?? 'Customer'} · {formatDate(data.review.created_at)}
                </p>
                <p className="mt-2 text-sm leading-relaxed">{data.review.body}</p>
                {data.review.business_reply ? (
                  <div className="mt-3 border-l-2 border-line pl-3">
                    <p className="text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">Studio reply</p>
                    <p className="text-sm leading-relaxed">{data.review.business_reply}</p>
                  </div>
                ) : (
                  isBusinessSide && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      <Textarea
                        label="Reply as the studio"
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        maxLength={2000}
                      />
                      <Button
                        size="sm"
                        onClick={() => sendReply.mutate(data.review!)}
                        loading={sendReply.isPending}
                        disabled={!reply.trim()}
                      >
                        Publish reply
                      </Button>
                    </div>
                  )
                )}
              </div>
            ) : data.production_status === 'completed' && data.user_id === user?.id ? (
              <div className="space-y-3 p-4">
                <Select
                  label="Rating"
                  value={reviewForm.rating}
                  onChange={(event) => setReviewForm({ ...reviewForm, rating: event.target.value })}
                  options={[5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} star${value === 1 ? '' : 's'}` }))}
                />
                <Input
                  label="Title"
                  value={reviewForm.title}
                  onChange={(event) => setReviewForm({ ...reviewForm, title: event.target.value })}
                  maxLength={140}
                />
                <Textarea
                  label="Your review"
                  value={reviewForm.body}
                  onChange={(event) => setReviewForm({ ...reviewForm, body: event.target.value })}
                  maxLength={2000}
                />
                <Button
                  size="sm"
                  onClick={() => submitReview.mutate()}
                  loading={submitReview.isPending}
                  disabled={reviewForm.title.trim().length < 2}
                >
                  Publish review
                </Button>
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-ink-muted">
                {data.production_status === 'completed'
                  ? 'Only the customer who placed this order can review it.'
                  : 'The review form opens once the order is marked completed.'}
              </p>
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

      <Modal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Attach an approved print package"
        description="Approved production artwork can be sent to the workshop. Unapproved drafts cannot."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPrintOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => attachPackage.mutate(attachId)}
              loading={attachPackage.isPending}
              disabled={!attachId}
            >
              Attach package
            </Button>
          </>
        }
      >
        <Select
          label="Approved package"
          value={attachId}
          onChange={(event) => setAttachId(event.target.value)}
          options={[
            { value: '', label: 'Choose a package' },
            ...(approvedPackages.data?.items ?? [])
              .filter((item: PrintPackage) => item.status === 'approved')
              .map((item) => ({
                value: item.id,
                label: `${item.name} · ${item.width_cm}×${item.height_cm} cm · ${item.dpi} DPI`,
              })),
          ]}
        />
        {(approvedPackages.data?.items ?? []).filter((item) => item.status === 'approved').length === 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            No approved print packages yet. Build and approve one under Print packages.
          </p>
        )}
      </Modal>
    </div>
  )
}
