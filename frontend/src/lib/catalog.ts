import type { CatalogTaxonomy, GarmentFacets } from '@/lib/types'

/** Display labels used when the API has not supplied a facet label yet. */
const CATEGORY_LABELS: Record<string, string> = {
  shalwar_kameez: 'Shalwar Kameez',
  kurta_pajama: 'Kurta Pajama',
  maxi_dress: 'Maxi dresses',
  tshirt: 'T-shirts',
  formal_shoes: 'Formal shoes',
  sports_shoes: 'Sports shoes',
  traditional_footwear: 'Traditional footwear',
}

export function categoryLabel(value: string, facets?: GarmentFacets): string {
  return (
    facets?.category_labels?.[value] ??
    CATEGORY_LABELS[value] ??
    value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  )
}

export function styleLabel(value: string, facets?: GarmentFacets): string {
  return facets?.style_labels?.[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function occasionLabel(value: string, facets?: GarmentFacets): string {
  return facets?.occasion_labels?.[value] ?? value.charAt(0).toUpperCase() + value.slice(1)
}

export function seasonLabel(value: string, facets?: GarmentFacets): string {
  return facets?.season_labels?.[value] ?? value.replace(/-/g, ' ')
}

export interface CatalogFilters {
  q: string
  category: string[]
  style: string[]
  occasion: string[]
  season: string
  fit: string
  sort: string
  favorites: boolean
}

export const DEFAULT_FILTERS: CatalogFilters = {
  q: '',
  category: [],
  style: [],
  occasion: [],
  season: '',
  fit: '',
  sort: 'featured',
  favorites: false,
}

/** URLSearchParams → typed filters (repeated or comma-separated values both work). */
export function filtersFromParams(params: URLSearchParams): CatalogFilters {
  const list = (key: string) =>
    (params.get(key) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  return {
    q: params.get('q') ?? '',
    category: list('category'),
    style: list('style'),
    occasion: list('occasion'),
    season: params.get('season') ?? '',
    fit: params.get('fit') ?? '',
    sort: params.get('sort') ?? 'featured',
    favorites: params.get('favorites') === 'true',
  }
}

/** Typed filters → URLSearchParams, dropping defaults so URLs stay readable. */
export function filtersToParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.category.length) params.set('category', filters.category.join(','))
  if (filters.style.length) params.set('style', filters.style.join(','))
  if (filters.occasion.length) params.set('occasion', filters.occasion.join(','))
  if (filters.season) params.set('season', filters.season)
  if (filters.fit) params.set('fit', filters.fit)
  if (filters.sort && filters.sort !== 'featured') params.set('sort', filters.sort)
  if (filters.favorites) params.set('favorites', 'true')
  return params
}

export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

export function activeFilterCount(filters: CatalogFilters): number {
  return (
    (filters.q.trim() ? 1 : 0) +
    filters.category.length +
    filters.style.length +
    filters.occasion.length +
    (filters.season ? 1 : 0) +
    (filters.fit ? 1 : 0) +
    (filters.favorites ? 1 : 0)
  )
}

/** Categories for the current department, preferring live taxonomy over a static list. */
export function departmentCategories(
  taxonomy: CatalogTaxonomy | undefined,
  department: 'womenswear' | 'menswear',
): { value: string; label: string; count?: number }[] {
  const groupId = department === 'menswear' ? 'menswear' : 'womenswear'
  const group = taxonomy?.category_groups.find((entry) => entry.id === groupId)
  return (group?.categories ?? []).filter((category) => (category.count ?? 0) > 0)
}

export function accessoriesCategories(
  taxonomy: CatalogTaxonomy | undefined,
): { value: string; label: string; count?: number }[] {
  const groups = taxonomy?.category_groups.filter((entry) =>
    ['footwear', 'accessories'].includes(entry.id),
  )
  return (groups ?? []).flatMap((group) => group.categories).filter((category) => (category.count ?? 0) > 0)
}
