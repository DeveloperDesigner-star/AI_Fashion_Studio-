import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { toast } from '@/stores/toastStore'
import { useAuthStore } from '@/stores/authStore'

/**
 * Saved catalogue pieces. Favourites live on the server so they survive devices;
 * the mutation refreshes both the saved list and any catalogue pages showing the
 * heart state.
 */
export function useFavorites() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const favorites = useQuery({
    queryKey: qk.favorites,
    queryFn: fetchers.favorites,
    enabled: Boolean(user),
  })

  const toggle = useMutation({
    mutationFn: async ({ slug, next }: { slug: string; next: boolean }) => {
      if (next) await fetchers.addFavorite(slug)
      else await fetchers.removeFavorite(slug)
      return { slug, next }
    },
    onSuccess: ({ next }) => {
      queryClient.invalidateQueries({ queryKey: qk.favorites })
      queryClient.invalidateQueries({ queryKey: ['garments'] })
      toast.success(next ? 'Saved to favourites' : 'Removed from favourites')
    },
    onError: () => toast.error('Could not update favourites', 'Try again in a moment.'),
  })

  const savedSlugs = new Set((favorites.data?.items ?? []).map((garment) => garment.slug))
  const isFavorite = (slug: string, serverValue?: boolean) =>
    savedSlugs.has(slug) || Boolean(serverValue)

  return { favorites, savedSlugs, isFavorite, toggle, signedIn: Boolean(user) }
}
