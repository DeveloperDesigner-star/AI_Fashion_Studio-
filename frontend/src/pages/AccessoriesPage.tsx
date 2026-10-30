import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { GarmentCard } from '@/components/garment/GarmentCard'
import { LinkButton } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { titleCase } from '@/lib/format'
import type { Garment } from '@/lib/types'

const slots = ['footwear', 'bag', 'watch', 'headwear', 'accessory'] as const
type Slot = (typeof slots)[number]

const sortOptions = [
  { value: 'featured', label: 'Featured' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name' },
]

export function AccessoriesPage() {
  const [active, setActive] = useState<'all' | Slot>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('featured')

  const results = useQueries({
    queries: slots.map((slot) => ({
      queryKey: qk.garments({ slot, page_size: 36 }),
      queryFn: () => fetchers.garments({ slot, page_size: 36 }),
    })),
  })

  const bySlot = useMemo(() => {
    const map = new Map<Slot, Garment[]>()
    slots.forEach((slot, index) => map.set(slot, results[index]?.data?.items ?? []))
    return map
  }, [results])

  const all = useMemo(() => slots.flatMap((slot) => bySlot.get(slot) ?? []), [bySlot])

  const visible = useMemo(() => {
    const base = active === 'all' ? all : (bySlot.get(active) ?? [])
    const needle = search.trim().toLowerCase()
    const filtered = needle
      ? base.filter(
          (garment) =>
            garment.name.toLowerCase().includes(needle) ||
            garment.default_fabric.toLowerCase().includes(needle) ||
            garment.tags.some((tag) => tag.toLowerCase().includes(needle)),
        )
      : base
    const sorted = [...filtered]
    switch (sort) {
      case 'price_asc':
        sorted.sort((a, b) => a.base_price_cents - b.base_price_cents)
        break
      case 'price_desc':
        sorted.sort((a, b) => b.base_price_cents - a.base_price_cents)
        break
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      default:
        sorted.sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
    }
    return sorted
  }, [active, all, bySlot, search, sort])

  const loading = results.some((result) => result.isLoading)
  const failed = results.every((result) => result.isError)

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Shoes & accessories"
        title="The finishing layer"
        description="Footwear, bags, watches and headwear sit outside the garment editor: pick a piece, then wear it with any saved look in the fitting room. Accessories stack — they never replace each other."
        actions={
          <>
            <LinkButton to="/studio/women" size="sm" variant="outline">
              Womenswear
            </LinkButton>
            <LinkButton to="/studio/men" size="sm" variant="outline">
              Menswear
            </LinkButton>
            <LinkButton to="/fitting-room" size="sm">
              Fitting room
            </LinkButton>
          </>
        }
      />

      <div className="mt-6 flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActive('all')}
            aria-pressed={active === 'all'}
            className={`border px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.12em] ${
              active === 'all' ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted hover:border-ink'
            }`}
          >
            All ({all.length})
          </button>
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setActive(slot)}
              aria-pressed={active === slot}
              className={`border px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.12em] ${
                active === slot ? 'border-ink bg-ink text-paper' : 'border-line text-ink-muted hover:border-ink'
              }`}
            >
              {slot === 'bag' ? 'Bags' : slot === 'footwear' ? 'Shoes' : titleCase(slot)}
              <span className="ml-1.5 text-ink-muted">{bySlot.get(slot)?.length ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-56">
            <Input
              label="Search"
              placeholder="Name, fabric or tag"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              label="Sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              options={sortOptions}
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-80 w-full" />
          ))}
        </div>
      )}

      {!loading && failed && (
        <div className="mt-6">
          <ErrorState
            title="Accessories could not be loaded"
            message="The catalogue API did not respond. Check the connection and retry."
            onRetry={() => results.forEach((result) => result.refetch())}
          />
        </div>
      )}

      {!loading && !failed && visible.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title={search ? 'No accessory matches that search' : 'Nothing in this category yet'}
            description={
              search
                ? 'Try a different term — names, fabrics and tags are searched.'
                : 'New pieces are added to the catalogue regularly. Meanwhile, style the garments.'
            }
            action={<LinkButton to="/studio/women">Browse garments</LinkButton>}
          />
        </div>
      )}

      {!loading && visible.length > 0 && (
        <>
          <p className="mt-3 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
            {visible.length} pieces{active === 'all' ? ' across five accessory slots' : ` · ${titleCase(active)}`}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {visible.map((garment) => (
              <GarmentCard key={garment.id} garment={garment} compact />
            ))}
          </div>
        </>
      )}

      <section className="mt-12 grid gap-6 border border-line bg-bone/40 p-6 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <p className="eyebrow">Styling note</p>
          <h2 className="display-md mt-2">Accessories are never locked to one look.</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
            A watch and a bag can be worn together, and both survive when you swap the dress underneath.
            Hide accessories from the 3D view without removing them from the outfit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <LinkButton to="/outfits" variant="outline">
            Saved outfits
          </LinkButton>
          <LinkButton to="/assistant" variant="ghost">
            Ask the stylist
          </LinkButton>
        </div>
      </section>
    </div>
  )
}
