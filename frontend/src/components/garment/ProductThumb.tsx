import { GarmentArt } from '@/components/garment/GarmentArt'
import type { Garment } from '@/lib/types'
import { cn } from '@/lib/format'

/**
 * The single seam for product imagery.
 *
 * Every surface that shows a product — catalogue grid, dashboard project tiles,
 * favourites, outfit builder — renders through this component. Today it draws
 * the catalogue's procedural silhouette; the mockup pipeline replaces this
 * implementation in one place, so no page has to know how a product is
 * pictured.
 */
export function ProductThumb({
  garment,
  className,
  artClassName,
  ratio = '4/5',
}: {
  garment: Pick<Garment, 'silhouette' | 'palette' | 'default_color' | 'slot' | 'name' | 'category'>
  className?: string
  artClassName?: string
  ratio?: '4/5' | '1/1' | '3/4' | '16/10'
}) {
  const ratios: Record<string, string> = {
    '4/5': 'aspect-[4/5]',
    '1/1': 'aspect-square',
    '3/4': 'aspect-[3/4]',
    '16/10': 'aspect-[16/10]',
  }

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-sm bg-bone',
        ratios[ratio],
        className,
      )}
    >
      <GarmentArt garment={garment} className={cn('h-[86%] w-[86%]', artClassName)} />
    </div>
  )
}
