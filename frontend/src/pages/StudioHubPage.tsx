import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { GarmentCard } from '@/components/garment/GarmentCard'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { LinkButton } from '@/components/ui/Button'
import { PageHeader, Skeleton } from '@/components/ui/Primitives'
import { formatPrice, titleCase } from '@/lib/format'
import type { Garment } from '@/lib/types'

const entries = [
  {
    to: '/studio/women',
    label: 'Womenswear',
    kicker: 'Collection',
    copy: 'Dresses, tailoring and knitwear with component-level customisation.',
    tone: 'bg-bone',
  },
  {
    to: '/studio/men',
    label: 'Menswear',
    kicker: 'Collection',
    copy: 'Suiting, shirting and outerwear cut from the same parametric patterns.',
    tone: 'bg-sand/50',
  },
  {
    to: '/studio/replicate',
    label: 'Replicate a design',
    kicker: 'From reference',
    copy: 'Upload an inspiration image, review what the model can actually see, and apply it to a garment template.',
    tone: 'bg-sand/50',
  },
  {
    to: '/studio/accessories',
    label: 'Shoes & accessories',
    kicker: 'Finishing',
    copy: 'Footwear, bags, watches and headwear that stack onto any look.',
    tone: 'bg-bone',
  },
  {
    to: '/avatar',
    label: 'Avatar studio',
    kicker: 'Identity',
    copy: 'Choose a GLB base figure, adjust the proportions and keep up to five avatars.',
    tone: 'bg-bone',
  },
  {
    to: '/designs',
    label: 'Design studio',
    kicker: 'Library',
    copy: 'Every saved colourway, component spec and draft in one place.',
    tone: 'bg-sand/50',
  },
  {
    to: '/fitting-room',
    label: 'Virtual fitting room',
    kicker: '3D',
    copy: 'Dress your avatar, orbit the figure and check the silhouette walking.',
    tone: 'bg-bone',
  },
  {
    to: '/assistant',
    label: 'AI stylist',
    kicker: 'Guidance',
    copy: 'Occasion-led looks from the live catalogue, with your size in mind.',
    tone: 'bg-sand/50',
  },
] as const

export function StudioHubPage() {
  const user = useAuthStore((state) => state.user)
  const featured = useQuery({
    queryKey: qk.garments({ sort: 'featured', page_size: 4 }),
    queryFn: () => fetchers.garments({ sort: 'featured', page_size: 4 }),
  })
  const looks = useQuery({ queryKey: qk.looks(), queryFn: () => fetchers.looks() })
  const designs = useQuery({
    queryKey: qk.designs({ limit: 3 }),
    queryFn: () => fetchers.designs({ limit: 3 }),
    enabled: Boolean(user),
  })

  const garments: Garment[] = featured.data?.items ?? []
  const look = looks.data?.items[0]

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Fashion studio"
        title="Everything begins with a pattern."
        description="Two collections, one component editor, a 3D fitting room and a production network. Choose where you want to start."
        actions={
          <>
            <LinkButton to="/designs" size="sm" variant="outline">
              {user ? `Design library${designs.data ? ` · ${designs.data.total}` : ''}` : 'Design library'}
            </LinkButton>
            <LinkButton to="/fitting-room" size="sm">
              Enter fitting room
            </LinkButton>
          </>
        }
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry, index) => (
          <Link
            key={entry.to}
            to={entry.to}
            className={`group flex min-h-44 flex-col justify-between border border-line p-5 transition-colors hover:border-ink ${entry.tone}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[0.5625rem] uppercase tracking-[0.18em] text-ink-muted">
                {String(index + 1).padStart(2, '0')} · {entry.kicker}
              </span>
              <span
                className="text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-ink"
                aria-hidden="true"
              >
                →
              </span>
            </div>
            <div>
              <h2 className="font-display text-2xl leading-tight">{entry.label}</h2>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-ink-muted">{entry.copy}</p>
            </div>
          </Link>
        ))}
      </div>

      <section className="mt-12">
        <div className="flex items-end justify-between border-b border-line pb-3">
          <div>
            <p className="eyebrow">Catalogue</p>
            <h2 className="font-display text-2xl">Editorial selection</h2>
          </div>
          <Link to="/studio/women" className="text-[0.625rem] uppercase tracking-[0.12em] hover:text-clay">
            All womenswear
          </Link>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {featured.isLoading &&
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-72 w-full" />)}
          {garments.map((garment) => (
            <GarmentCard key={garment.id} garment={garment} compact />
          ))}
        </div>
      </section>

      {look && (
        <section className="mt-10 grid gap-6 border border-line bg-bone/40 p-5 md:grid-cols-[auto_1fr_auto] md:items-center md:p-7">
          <div className="flex -space-x-8">
            {look.garments.slice(0, 3).map((garment) => (
              <GarmentArt
                key={garment.id}
                garment={garment}
                className="h-32 w-24 border border-line bg-paper"
                showShadow={false}
              />
            ))}
          </div>
          <div>
            <p className="eyebrow">
              Curated look · {titleCase(look.occasion)} · {titleCase(look.gender)}
            </p>
            <h2 className="display-md mt-1">{look.name}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">{look.description}</p>
            <p className="mt-2 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
              {look.garments.length} pieces ·{' '}
              {formatPrice(look.garments.reduce((sum, garment) => sum + garment.base_price_cents, 0))}
            </p>
          </div>
          {look.garments[0] && (
            <LinkButton to={`/garment/${look.garments[0].slug}`} size="sm" variant="secondary">
              Open the look
            </LinkButton>
          )}
        </section>
      )}

      <section className="mt-10 grid gap-4 border border-line bg-paper p-6 md:grid-cols-3">
        <div>
          <p className="eyebrow">How it works</p>
          <h2 className="mt-1 font-display text-xl">Customise · fit · produce</h2>
        </div>
        <ol className="space-y-2 text-xs leading-relaxed text-ink-muted md:col-span-2 md:grid md:grid-cols-3 md:gap-4 md:space-y-0">
          <li>
            <span className="font-display text-base text-ink">01</span>
            <p className="mt-1">Set colour, fabric, pattern and embroidery per garment component.</p>
          </li>
          <li>
            <span className="font-display text-base text-ink">02</span>
            <p className="mt-1">Try the piece on your avatar, then save the outfit for comparison.</p>
          </li>
          <li>
            <span className="font-display text-base text-ink">03</span>
            <p className="mt-1">Export the technical pack and request quotes from verified ateliers.</p>
          </li>
        </ol>
      </section>
    </div>
  )
}
