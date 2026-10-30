import { Link } from 'react-router-dom'
import type { Garment } from '@/lib/types'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { Badge } from '@/components/ui/Primitives'
import { useFavorites } from '@/hooks/useFavorites'
import { formatPrice, titleCase } from '@/lib/format'
import { styleLabel } from '@/lib/catalog'

export function GarmentCard({ garment, compact = false }: { garment: Garment; compact?: boolean }) {
  const { isFavorite, toggle, signedIn } = useFavorites()
  const saved = isFavorite(garment.slug, garment.is_favorite)
  const primaryStyle = garment.styles?.[0]

  return (
    <article className="group relative flex flex-col border border-line bg-paper transition-colors hover:border-ink/50">
      <Link to={`/garment/${garment.slug}`} className="block focus-visible:outline-offset-4">
        <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-bone">
          <GarmentArt
            garment={garment}
            className={compact ? 'h-[82%] w-[82%]' : 'h-[88%] w-[88%] transition-transform duration-500 group-hover:scale-[1.03]'}
          />
          {garment.is_featured && (
            <Badge tone="ink" className="absolute left-3 top-3">
              Editorial
            </Badge>
          )}
          <span className="absolute right-3 top-3 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
            {titleCase(garment.slot)}
          </span>
        </div>
      </Link>

      {signedIn && (
        <button
          type="button"
          onClick={() => toggle.mutate({ slug: garment.slug, next: !saved })}
          aria-label={saved ? `Remove ${garment.name} from favourites` : `Save ${garment.name} to favourites`}
          aria-pressed={saved}
          className="absolute right-2.5 top-9 flex size-8 items-center justify-center border border-line bg-paper/90 text-sm transition-colors hover:border-ink"
        >
          <span className={saved ? 'text-clay' : 'text-ink-muted'}>{saved ? '♥' : '♡'}</span>
        </button>
      )}

      <div className="flex flex-1 flex-col gap-2 border-t border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/garment/${garment.slug}`} className="block">
              <h3 className="truncate font-display text-lg leading-tight">{garment.name}</h3>
            </Link>
            <p className="mt-0.5 text-[0.6875rem] uppercase tracking-[0.12em] text-ink-muted">
              {primaryStyle ? `${styleLabel(primaryStyle)} · ` : ''}
              {titleCase(garment.category)}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums">{formatPrice(garment.base_price_cents, garment.currency)}</span>
        </div>

        {!compact && (
          <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">{garment.description}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="flex items-center gap-1.5">
            {[garment.default_color, garment.palette.primary, garment.palette.accent]
              .filter(Boolean)
              .slice(0, 3)
              .map((colour, index) => (
                <span
                  key={`${colour}-${index}`}
                  className="size-3 border border-line"
                  style={{ backgroundColor: colour as string }}
                  aria-hidden="true"
                />
              ))}
            <span className="ml-1 text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
              {garment.components.length} parts
            </span>
          </span>
          <Link
            to={`/garment/${garment.slug}`}
            className="text-[0.625rem] uppercase tracking-[0.14em] text-ink-soft underline decoration-line decoration-1 underline-offset-4 transition-colors hover:text-clay"
          >
            Customise
          </Link>
        </div>
      </div>
    </article>
  )
}
