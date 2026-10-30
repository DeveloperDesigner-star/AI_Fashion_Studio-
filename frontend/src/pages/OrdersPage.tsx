import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { LinkButton } from '@/components/ui/Button'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { formatDate, formatPrice, titleCase } from '@/lib/format'
import type { QuoteRequest } from '@/lib/types'

const statusTone: Record<string, 'neutral' | 'olive' | 'gold' | 'clay' | 'danger' | 'ink'> = {
  draft: 'neutral',
  submitted: 'gold',
  quoted: 'clay',
  confirmed: 'olive',
  in_production: 'olive',
  shipped: 'ink',
  completed: 'olive',
  cancelled: 'danger',
}

export function OrdersPage() {
  const user = useAuthStore((state) => state.user)
  const canReceive = user?.role === 'business' || user?.role === 'admin'
  const [scope, setScope] = useState<'outgoing' | 'incoming'>('outgoing')

  const requests = useQuery({
    queryKey: qk.requests(canReceive ? scope : 'outgoing'),
    queryFn: () => fetchers.requests(canReceive ? scope : 'outgoing'),
  })

  const items = requests.data?.items ?? []

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Production"
        title="Requests & quotations"
        description="Every request carries its brief, attached outfit and measurements. Quotes arrive in the same thread as the conversation."
        actions={<LinkButton to="/marketplace" size="sm" variant="outline">Find a partner</LinkButton>}
      />

      {canReceive && (
        <div className="mt-5 flex border border-line text-[0.625rem] uppercase tracking-[0.12em]">
          {(['outgoing', 'incoming'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setScope(option)}
              className={`px-4 py-2 ${scope === option ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink'}`}
              aria-pressed={scope === option}
            >
              {option === 'outgoing' ? 'My requests' : 'Incoming for my studio'}
            </button>
          ))}
        </div>
      )}

      {requests.isLoading && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {requests.isError && (
        <div className="mt-6">
          <ErrorState title="Requests could not be loaded" onRetry={() => requests.refetch()} />
        </div>
      )}

      {!requests.isLoading && items.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title={scope === 'incoming' ? 'No incoming requests yet' : 'No production requests yet'}
            description={
              scope === 'incoming'
                ? 'Verified studios appear in the marketplace directory; requests addressed to your studio will land here.'
                : 'Choose a tailor, printer or atelier from the directory, attach a saved outfit and submit a brief.'
            }
            action={<LinkButton to="/marketplace">Browse partners</LinkButton>}
          />
        </div>
      )}

      <div className="mt-6 divide-y divide-line border border-line bg-paper">
        {items.map((request: QuoteRequest) => (
          <Link
            key={request.id}
            to={`/orders/${request.id}`}
            className="flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-bone/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[0.6875rem] text-ink-muted">{request.reference_code}</p>
                <Badge tone={statusTone[request.status] ?? 'neutral'}>{titleCase(request.status)}</Badge>
                <Badge tone="neutral">{titleCase(request.service_type)}</Badge>
              </div>
              <p className="mt-1 truncate font-display text-lg leading-tight">{request.title}</p>
              <p className="text-xs text-ink-muted">
                {request.business ? request.business.name : 'Unassigned — open to the network'} ·{' '}
                {request.quotes.length} quote{request.quotes.length === 1 ? '' : 's'} ·{' '}
                {request.messages.length} message{request.messages.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-ink-muted">
              {request.budget_cents !== null && <span>Budget {formatPrice(request.budget_cents)}</span>}
              <span>{formatDate(request.created_at)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
