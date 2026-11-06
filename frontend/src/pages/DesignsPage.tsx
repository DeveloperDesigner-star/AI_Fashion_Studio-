import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useStudioStore, type FittingItem } from '@/stores/studioStore'
import { toast } from '@/stores/toastStore'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { Button, LinkButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { formatDate, titleCase } from '@/lib/format'
import type { Design, DesignStatus } from '@/lib/types'

const statusFilters: { value: '' | DesignStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'saved', label: 'Saved' },
  { value: 'draft', label: 'Drafts' },
  { value: 'archived', label: 'Archived' },
]

export function DesignsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hydrate = useStudioStore((state) => state.hydrate)
  const [status, setStatus] = useState<'' | DesignStatus>('')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const designs = useQuery({
    queryKey: qk.designs({ status: status || undefined, limit: 100 }),
    queryFn: () => fetchers.designs({ status: status || undefined, limit: 100 }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['designs'] })

  const duplicate = useMutation({
    mutationFn: (design: Design) =>
      api.post<Design>('/designs', {
        garment_id: design.garment_id,
        name: `${design.name} copy`.slice(0, 140),
        components: design.components,
        fit: design.fit,
        notes: design.notes,
        status: 'draft',
      }),
    onSuccess: (design) => {
      invalidate()
      toast.success('Design duplicated', `${design.name} saved as a draft.`)
    },
    onError: (error) =>
      toast.error('Could not duplicate', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const setDesignStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: DesignStatus }) =>
      api.patch<Design>(`/designs/${id}`, { status: next }),
    onSuccess: () => {
      invalidate()
      toast.success('Design updated')
    },
    onError: (error) =>
      toast.error('Could not update the design', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/designs/${id}`),
    onSuccess: () => {
      invalidate()
      toast.success('Design deleted')
    },
    onError: (error) =>
      toast.error('Could not delete the design', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const items = useMemo(() => {
    const list = designs.data?.items ?? []
    const needle = search.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (design) =>
        design.name.toLowerCase().includes(needle) ||
        (design.garment?.name.toLowerCase().includes(needle) ?? false) ||
        Object.values(design.components).some((component) =>
          (component.fabric ?? '').toLowerCase().includes(needle),
        ),
    )
  }, [designs.data, search])

  const tryOn = (design: Design) => {
    if (!design.garment) {
      toast.error('The garment is no longer in the catalogue')
      return
    }
    const item: Omit<FittingItem, 'key'> = {
      slot: design.garment.slot,
      garment: design.garment,
      designId: design.id,
      designName: design.name,
      components: design.components,
    }
    hydrate([item])
    navigate('/fitting-room')
  }

  const counts = useMemo(() => {
    const list = designs.data?.items ?? []
    return {
      total: designs.data?.total ?? 0,
      visible: list.length,
      drafts: list.filter((design) => design.status === 'draft').length,
    }
  }, [designs.data])

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Design studio"
        title="Saved designs"
        description="Every colourway and component specification you have saved. Open one to keep editing, duplicate it for a new variant, or send it to the fitting room."
        actions={
          <>
            <LinkButton to="/studio/replicate" size="sm" variant="outline">
              Replicate a reference
            </LinkButton>
            <LinkButton to="/studio/women" size="sm" variant="outline">
              Women
            </LinkButton>
            <LinkButton to="/studio/men" size="sm">
              Men
            </LinkButton>
          </>
        }
      />

      <div className="mt-6 flex flex-col gap-3 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((filter) => (
            <button
              key={filter.value || 'all'}
              type="button"
              onClick={() => setStatus(filter.value)}
              aria-pressed={status === filter.value}
              className={`border px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.12em] ${
                status === filter.value
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line text-ink-muted hover:border-ink'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="w-full md:w-64">
          <Input
            label="Search"
            placeholder="Name, garment or fabric"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {!designs.isLoading && designs.data && (
        <p className="mt-3 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
          {items.length} shown · {counts.total} total · {counts.drafts} draft
          {counts.drafts === 1 ? '' : 's'}
        </p>
      )}

      {designs.isLoading && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-80 w-full" />
          ))}
        </div>
      )}

      {designs.isError && (
        <div className="mt-5">
          <ErrorState title="Designs could not be loaded" onRetry={() => designs.refetch()} />
        </div>
      )}

      {!designs.isLoading && items.length === 0 && (
        <div className="mt-5">
          <EmptyState
            title={search || status ? 'No designs match this filter' : 'Nothing saved yet'}
            description={
              search || status
                ? 'Try a different status or clear the search.'
                : 'Open any garment and adjust its components — saving stores the whole specification here.'
            }
            action={<LinkButton to="/studio/women">Start designing</LinkButton>}
          />
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((design) => (
          <article key={design.id} className="flex flex-col border border-line bg-paper">
            <div className="relative flex aspect-[4/5] items-center justify-center bg-bone p-2">
              {design.garment ? (
                <GarmentArt
                  garment={design.garment}
                  components={design.components}
                  className="h-full w-full"
                />
              ) : (
                <p className="px-4 text-center text-[0.625rem] text-ink-muted">
                  Garment retired from the catalogue
                </p>
              )}
              <Badge
                tone={design.status === 'draft' ? 'gold' : design.status === 'archived' ? 'neutral' : 'olive'}
                className="absolute left-2 top-2"
              >
                {titleCase(design.status)}
              </Badge>
            </div>

            <div className="flex flex-1 flex-col gap-2 border-t border-line p-3">
              <div>
                <h2 className="truncate font-display text-base leading-tight">{design.name}</h2>
                <p className="text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted">
                  {design.garment ? `${titleCase(design.garment.category)} · ` : ''}
                  {formatDate(design.updated_at)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {Object.entries(design.components)
                  .slice(0, 4)
                  .map(([key, component]) => (
                    <span
                      key={key}
                      title={`${titleCase(key.replace(/_/g, ' '))}: ${component.fabric}, ${component.pattern}`}
                      className="size-3 border border-line"
                      style={{ backgroundColor: component.color }}
                    />
                  ))}
                <span className="ml-1 text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                  {Object.keys(design.components).length} parts
                </span>
              </div>

              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {design.garment && (
                  <LinkButton to={`/editor/${design.id}`} size="sm" variant="outline">
                    Studio
                  </LinkButton>
                )}
                {design.garment && (
                  <LinkButton
                    to={`/garment/${design.garment.slug}?design=${design.id}`}
                    size="sm"
                    variant="ghost"
                  >
                    Quick edit
                  </LinkButton>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => tryOn(design)}
                  disabled={!design.garment}
                >
                  Try on
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyId === design.id}
                  onClick={() => {
                    setBusyId(design.id)
                    duplicate.mutate(design, { onSettled: () => setBusyId(null) })
                  }}
                >
                  Copy
                </Button>
              </div>

              <div className="flex items-center justify-between border-t border-line pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setDesignStatus.mutate({
                      id: design.id,
                      next: design.status === 'archived' ? 'saved' : 'archived',
                    })
                  }
                  className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
                >
                  {design.status === 'archived' ? 'Restore' : 'Archive'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete “${design.name}”? This cannot be undone.`)) {
                      remove.mutate(design.id)
                    }
                  }}
                  className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted hover:text-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
