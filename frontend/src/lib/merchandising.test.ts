import { describe, expect, it } from 'vitest'
import {
  ALL_CATEGORY_VALUES,
  DEFAULT_QUERY,
  DEPARTMENTS,
  categoryCount,
  categoryValues,
  findCategory,
  findDepartment,
  paramsFromQuery,
  queryFromParams,
} from '@/lib/merchandising'

describe('merchandising taxonomy', () => {
  it('covers every department asked for in the brief', () => {
    const labels = DEPARTMENTS.map((department) => department.label)
    expect(labels).toEqual(['Clothing', 'Accessories', 'Home & lifestyle'])

    const clothing = DEPARTMENTS[0].categories.map((category) => category.label)
    expect(clothing).toEqual(
      expect.arrayContaining([
        'T-shirts',
        'Polo shirts',
        'Shirts',
        'Hoodies',
        'Sweatshirts',
        'Jackets',
        "Women's tops",
        "Women's dresses",
        'Kurtis',
        'Shalwar Kameez',
        "Men's kurta",
        'Trousers',
        'Sportswear',
        "Children's clothing",
      ]),
    )

    const accessories = DEPARTMENTS[1].categories.map((category) => category.label)
    expect(accessories).toEqual(['Bags', 'Caps', 'Shoes', 'Watches', 'Scarves'])
  })

  it('marks home and lifestyle as planned with no products', () => {
    const home = findDepartment('home')
    expect(home?.planned).toBe(true)
    expect(home?.categories).toHaveLength(0)
  })

  it('never lists a category value twice across the taxonomy', () => {
    expect(new Set(ALL_CATEGORY_VALUES).size).toBe(ALL_CATEGORY_VALUES.length)
  })

  it('expands aliases so a merchandising category covers all its API values', () => {
    const shoes = findCategory('sneakers')
    expect(shoes).toBeDefined()
    expect(categoryValues(shoes!)).toEqual(
      expect.arrayContaining(['sneakers', 'boots', 'heels', 'traditional_footwear']),
    )
  })

  it('sums facet counts across a category and its aliases', () => {
    const dresses = findCategory('dress')!
    expect(categoryCount({ maxi_dress: 3, frock: 2, gown: 1, tshirt: 9 }, dresses)).toBe(6)
    expect(categoryCount(undefined, dresses)).toBe(0)
  })
})

describe('catalogue query round-trip', () => {
  it('defaults to clothing with no filter', () => {
    expect(queryFromParams(new URLSearchParams())).toEqual(DEFAULT_QUERY)
    expect(paramsFromQuery(DEFAULT_QUERY).toString()).toBe('')
  })

  it('restores department, category, search and sort', () => {
    const params = new URLSearchParams('department=accessories&category=cap&q=canvas&sort=price_asc')
    const query = queryFromParams(params)
    expect(query).toEqual({ department: 'accessories', category: 'cap', q: 'canvas', sort: 'price_asc' })
    expect(paramsFromQuery(query).toString()).toBe(
      'department=accessories&category=cap&q=canvas&sort=price_asc',
    )
  })

  it('ignores unknown departments, categories and sort keys', () => {
    const query = queryFromParams(
      new URLSearchParams('department=nonsense&category=teleporter&sort=chaos'),
    )
    expect(query.department).toBe('clothing')
    expect(query.category).toBe('')
    expect(query.sort).toBe('featured')
  })
})
