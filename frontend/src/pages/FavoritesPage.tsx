import { GarmentCard } from '@/components/garment/GarmentCard'
import { LinkButton } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Primitives'
import { useFavorites } from '@/hooks/useFavorites'

export function FavoritesPage() {
  const { favorites } = useFavorites()
  const items = favorites.data?.items ?? []

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Your archive"
        title="Saved pieces"
        description="Everything you have hearted across the women's, men's and accessories departments. Saving is private to your account."
        actions={
          <>
            <LinkButton to="/studio/women" size="sm" variant="outline">
              Womenswear
            </LinkButton>
            <LinkButton to="/studio/men" size="sm" variant="outline">
              Menswear
            </LinkButton>
            <LinkButton to="/studio/accessories" size="sm">
              Accessories
            </LinkButton>
          </>
        }
      />

      {favorites.isError && (
        <div className="mt-8">
          <ErrorState
            title="Saved pieces could not be loaded"
            onRetry={() => favorites.refetch()}
          />
        </div>
      )}

      {favorites.isLoading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border border-line bg-paper">
              <Skeleton className="aspect-[4/5] w-full" />
              <div className="space-y-2 border-t border-line p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!favorites.isLoading && !favorites.isError && items.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="No saved pieces yet"
            description="Tap the heart on any catalogue piece to keep it here. Saved pieces can be opened in the editor or dressed on your avatar."
            action={
              <LinkButton to="/studio/women" size="sm">
                Explore the catalogue
              </LinkButton>
            }
          />
        </div>
      )}

      {items.length > 0 && (
        <>
          <p className="mt-6 text-xs uppercase tracking-[0.14em] text-ink-muted">
            {favorites.data?.total} saved pieces
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((garment) => (
              <GarmentCard key={garment.id} garment={garment} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
