import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  accessoriesCategories,
  categoryLabel,
  departmentCategories,
  filtersFromParams,
  filtersToParams,
  occasionLabel,
  seasonLabel,
  styleLabel,
  toggleValue,
} from '@/lib/catalog'
import type { CatalogTaxonomy } from '@/lib/types'

const taxonomy = {
  genders: ['womenswear', 'menswear', 'unisex'],
  categories: [],
  category_groups: [
    {
      id: 'womenswear',
      label: 'Womenswear',
      description: '',
      categories: [
        { value: 'saree', label: 'Sarees', count: 3 },
        { value: 'lehenga', label: 'Lehengas', count: 3 },
        { value: 'gown', label: 'Gowns', count: 0 },
      ],
    },
    {
      id: 'menswear',
      label: 'Menswear',
      description: '',
      categories: [{ value: 'sherwani', label: 'Sherwanis', count: 3 }],
    },
    {
      id: 'footwear',
      label: 'Footwear',
      description: '',
      categories: [{ value: 'sneakers', label: 'Sneakers', count: 3 }],
    },
    {
      id: 'accessories',
      label: 'Accessories',
      description: '',
      categories: [{ value: 'handbag', label: 'Handbags', count: 2 }],
    },
  ],
  slots: ['dress', 'top', 'bottom', 'footwear', 'bag', 'watch', 'accessory', 'headwear', 'outerwear'],
  styles: [],
  occasions: [],
  seasons: [],
  fits: ['slim', 'regular', 'loose', 'oversized'],
  fabrics: ['cotton'],
} satisfies CatalogTaxonomy

describe('catalog filter urls', () => {
  it('round-trips multi-value filters', () => {
    const filters = {
      q: 'saree',
      category: ['saree', 'lehenga'],
      style: ['traditional'],
      occasion: ['wedding'],
      season: 'festive',
      fit: 'regular',
      sort: 'price_asc',
      favorites: true,
    }
    const params = filtersToParams(filters)
    expect(params.get('category')).toBe('saree,lehenga')
    expect(filtersFromParams(params)).toEqual(filters)
  })

  it('drops defaults from the query string', () => {
    const params = filtersToParams(DEFAULT_FILTERS)
    expect([...params.keys()]).toEqual([])
    expect(filtersFromParams(new URLSearchParams())).toEqual(DEFAULT_FILTERS)
  })

  it('counts only active filters', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, q: 'silk', category: ['saree'], favorites: true }),
    ).toBe(3)
  })

  it('toggles values without duplicates', () => {
    expect(toggleValue([], 'traditional')).toEqual(['traditional'])
    expect(toggleValue(['traditional', 'modern'], 'modern')).toEqual(['traditional'])
  })
})

describe('catalog labels', () => {
  it('prefers API facet labels and falls back to title casing', () => {
    expect(categoryLabel('shalwar_kameez', { category_labels: { shalwar_kameez: 'Shalwar Kameez' } })).toBe(
      'Shalwar Kameez',
    )
    expect(categoryLabel('kurta_pajama')).toBe('Kurta Pajama')
    expect(styleLabel('minimalist')).toBe('Minimalist')
    expect(occasionLabel('wedding', { occasion_labels: { wedding: 'Wedding' } })).toBe('Wedding')
    expect(seasonLabel('autumn-winter')).toBe('autumn winter')
  })
})

describe('department navigation', () => {
  it('hides categories with no pieces', () => {
    expect(departmentCategories(taxonomy, 'womenswear').map((entry) => entry.value)).toEqual(['saree', 'lehenga'])
    expect(departmentCategories(taxonomy, 'menswear').map((entry) => entry.value)).toEqual(['sherwani'])
  })

  it('combines footwear and accessories for the accessories page', () => {
    expect(accessoriesCategories(taxonomy).map((entry) => entry.value)).toEqual(['sneakers', 'handbag'])
  })

  it('returns empty navigation without taxonomy data', () => {
    expect(departmentCategories(undefined, 'womenswear')).toEqual([])
    expect(accessoriesCategories(undefined)).toEqual([])
  })
})
