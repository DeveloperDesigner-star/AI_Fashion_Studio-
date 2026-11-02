/**
 * Fashion inspiration client.
 *
 * Inspiration is reference imagery from a licensed third party. It is
 * deliberately a separate type from `Garment`: nothing here can be added to a
 * cart, quoted, or shown with a verified badge, because none of those concepts
 * exist on these objects.
 */

import { api } from '@/lib/api'

export interface InspirationImage {
  id: number
  preview_url: string
  image_url: string
  width: number
  height: number
  tags: string[]
  contributor: string
  contributor_id: number | null
  source_page: string
  attribution: string
}

export interface InspirationSearch {
  query: string
  page: number
  per_page: number
  total: number
  has_more: boolean
  results: InspirationImage[]
  attribution: string
  source_url: string
  license_note: string
  cached: boolean
}

export interface InspirationSuggestion {
  query: string
  label: string
}

export interface InspirationStatus {
  provider: string
  attribution: string
  configured: boolean
  available: boolean
  cache_ttl_seconds: number
  max_per_page: number
  suggested_searches: InspirationSuggestion[]
  note: string
}

export const inspiration = {
  status: () => api.get<InspirationStatus>('/inspiration/status'),
  search: (params: {
    q: string
    page?: number
    per_page?: number
    orientation?: 'all' | 'horizontal' | 'vertical'
    order?: 'popular' | 'latest'
  }) => {
    const search = new URLSearchParams({ q: params.q })
    if (params.page) search.set('page', String(params.page))
    if (params.per_page) search.set('per_page', String(params.per_page))
    if (params.orientation) search.set('orientation', params.orientation)
    if (params.order) search.set('order', params.order)
    return api.get<InspirationSearch>(`/inspiration/search?${search.toString()}`)
  },
}

export const INSPIRATION_DISCLOSURE =
  'Fashion Inspiration from Pixabay. These images are references, not products for sale, ' +
  'and are never shown with a verified badge.'

/** Aspect ratio used to reserve space before an image loads. */
export function aspectRatio(image: Pick<InspirationImage, 'width' | 'height'>): number {
  if (!image.width || !image.height) return 1
  return image.width / image.height
}
