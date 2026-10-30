import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { relativeTime, titleCase } from '@/lib/format'
import type { Notification } from '@/lib/types'

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const notifications = useQuery({ queryKey: qk.notifications, queryFn: fetchers.notifications })

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.notifications }),
  })

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.notifications }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.notifications }),
  })

  const items = notifications.data?.items ?? []

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow={`Signed in as ${user?.email ?? ''}`}
        title="Notifications"
        description="Studio updates, quote activity and account notices. Nothing is sent by email — everything lives here."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || (notifications.data?.unread ?? 0) === 0}
          >
            Mark all as read
          </Button>
        }
      />

      {notifications.isLoading && (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}

      {notifications.isError && (
        <div className="mt-6">
          <ErrorState title="Notifications could not be loaded" onRetry={() => notifications.refetch()} />
        </div>
      )}

      {!notifications.isLoading && items.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="Nothing to read"
            description="When a quote arrives or your studio listing is verified, the notice appears here."
          />
        </div>
      )}

      <ul className="mt-6 divide-y divide-line border border-line bg-paper">
        {items.map((item: Notification) => (
          <li key={item.id} className={`flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between ${item.read_at ? 'opacity-70' : ''}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={item.kind === 'order' ? 'gold' : item.kind === 'system' ? 'neutral' : 'olive'}>
                  {titleCase(item.kind)}
                </Badge>
                {!item.read_at && <span className="size-1.5 rounded-full bg-clay" aria-label="Unread" />}
                <span className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                  {relativeTime(item.created_at)}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{item.body}</p>
              {item.link && (
                <Link
                  to={item.link}
                  className="mt-2 inline-block border-b border-line text-[0.625rem] uppercase tracking-[0.12em] hover:border-ink"
                >
                  Open
                </Link>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {!item.read_at && (
                <button
                  type="button"
                  onClick={() => markRead.mutate(item.id)}
                  className="text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
                >
                  Mark read
                </button>
              )}
              <button
                type="button"
                onClick={() => remove.mutate(item.id)}
                className="text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-danger"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
