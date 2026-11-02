import { Link } from 'react-router-dom'
import type { Garment } from '@/lib/types'
import { MockupImage } from '@/components/mockup/MockupImage'
import { Badge } from '@/components/ui/Primitives'
import { IconArrowRight, IconImage } from '@/components/ui/Icons'
import { resolveMockup, primaryView } from '@/lib/mockups'
import { categoryLabel, styleLabel } from '@/lib/catalog'
import { formatPrice, cn } from '@/lib/format'
import type { GarmentFacets } from '@/lib/types'

/**
 * Catalogue card.
 *
 * Shows the photographed blank when one exists. When a category has no honest
 * photograph, the card says so and shows a labelled design preview rather than
 * substituting a picture of a different product.
 */
export function ProductCard({
  garment,
  facets,
  priority = false,
}: {
  garment: Garment
  facets?: GarmentFacets
  priority?: boolean
}) {
  const mockup = resolveMockup({ category: garment.category, gender: garment.gender })
  const view = primaryView(mockup)
  const style = garment.styles?.[0]

  return (
    <article className="group flex min-w-0 flex-col">
      <Link
        to={`/garment/${garment.slug}`}
        className="block rounded-md focus-visible:outline-offset-4"
        aria-label={`${garment.name} — ${formatPrice(garment.base_price_cents, garment.currency)}`}
      >
        {view ? (
          <MockupImage
            view={view}
            alt={`${garment.name} in ${mockup?.blank.toLowerCase()}`}
            priority={priority}
            className="rounded-md border border-line transition-[border-color,box-shadow] duration-200 group-hover:border-line-strong group-hover:shadow-[0_8px_28px_-18px_rgba(20,19,15,0.35)]"
          >
            {garment.is_featured && (
              <Badge tone="ink" className="absolute left-2.5 top-2.5">
                Featured
              </Badge>
            )}
          </MockupImage>
        ) : (
          <div className="relative flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-bone px-4 text-center">
            <IconImage size={22} className="text-ink-muted" />
            <p className="text-[0.6875rem] font-medium text-ink-soft">Design preview</p>
            <p className="text-[0.625rem] leading-relaxed text-ink-muted">
              No photographed blank yet
            </p>
          </div>
        )}
      </Link>

      <div className="mt-2.5 flex flex-1 flex-col px-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-sm font-medium leading-snug">
            <Link to={`/garment/${garment.slug}`} className="hover:text-clay">
              {garment.name}
            </Link>
          </h3>
          <span className="shrink-0 text-sm tabular-nums text-ink-soft">
            {formatPrice(garment.base_price_cents, garment.currency)}
          </span>
        </div>

        <p className="mt-0.5 text-xs text-ink-muted">
          {categoryLabel(String(garment.category), facets)}
          {style ? ` · ${styleLabel(style, facets)}` : ''}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1" aria-hidden="true">
            {[garment.default_color, garment.palette?.secondary, garment.palette?.accent]
              .filter(Boolean)
              .slice(0, 3)
              .map((colour, index) => (
                <span
                  key={`${colour}-${index}`}
                  className="size-3 rounded-full ring-1 ring-inset ring-ink/10"
                  style={{ backgroundColor: colour as string }}
                />
              ))}
          </span>
          <span
            className={cn(
              'flex items-center gap-1 text-xs font-medium text-ink-muted transition-colors group-hover:text-ink',
            )}
          >
            Customise
            <IconArrowRight size={13} />
          </span>
        </div>
      </div>
    </article>
  )
}
