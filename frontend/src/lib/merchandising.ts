/**
 * Storefront merchandising taxonomy.
 *
 * The API knows about every category value; this module decides how they are
 * presented to a shopper. Keeping it separate means a department can be
 * re-ordered or renamed without touching a backend enum, and the catalogue can
 * show a category with zero products honestly (count 0) instead of hiding it
 * behind invented stock.
 */

export interface DepartmentCategory {
  value: string
  label: string
  /** Some categories drive several API values (e.g. all dress shapes). */
  aliases?: string[]
  note?: string
}

export interface Department {
  id: string
  label: string
  description: string
  categories: DepartmentCategory[]
  /** Announced but not stocked: shown as planned, never as fake products. */
  planned?: boolean
}

export const DEPARTMENTS: Department[] = [
  {
    id: 'clothing',
    label: 'Clothing',
    description: 'Cut-and-sew blanks across womenswear, menswear and childrenswear.',
    categories: [
      { value: 'tshirt', label: 'T-shirts' },
      { value: 'polo', label: 'Polo shirts' },
      { value: 'shirt', label: 'Shirts' },
      { value: 'hoodie', label: 'Hoodies' },
      { value: 'sweatshirt', label: 'Sweatshirts', aliases: ['sweater', 'knitwear'] },
      { value: 'jacket', label: 'Jackets', aliases: ['blazer', 'coat', 'suit', 'waistcoat'] },
      { value: 'top', label: "Women's tops" },
      { value: 'dress', label: "Women's dresses", aliases: ['maxi_dress', 'frock', 'gown'] },
      { value: 'kurti', label: 'Kurtis' },
      { value: 'shalwar_kameez', label: 'Shalwar Kameez' },
      { value: 'kurta_pajama', label: "Men's kurta", aliases: ['sherwani'] },
      { value: 'trousers', label: 'Trousers', aliases: ['jeans'] },
      { value: 'sportswear', label: 'Sportswear' },
      { value: 'kids', label: "Children's clothing", aliases: ['childrenswear'] },
    ],
  },
  {
    id: 'accessories',
    label: 'Accessories',
    description: 'Print-ready accessories where a flat printable panel exists.',
    categories: [
      { value: 'handbag', label: 'Bags', aliases: ['bag'] },
      { value: 'cap', label: 'Caps', aliases: ['headwear'] },
      {
        value: 'sneakers',
        label: 'Shoes',
        aliases: ['heels', 'sandals', 'boots', 'flats', 'formal_shoes', 'sports_shoes', 'traditional_footwear'],
      },
      { value: 'watch', label: 'Watches' },
      { value: 'scarf', label: 'Scarves' },
    ],
  },
  {
    id: 'home',
    label: 'Home & lifestyle',
    description: 'Cushions, aprons, totes and small home textiles.',
    categories: [],
    planned: true,
  },
]

export const ALL_CATEGORY_VALUES = DEPARTMENTS.flatMap((department) =>
  department.categories.flatMap((category) => [category.value, ...(category.aliases ?? [])]),
)

/** Expand a merchandising category into the API values it covers. */
export function categoryValues(category: DepartmentCategory): string[] {
  return [category.value, ...(category.aliases ?? [])]
}

export function findDepartment(id: string | null | undefined): Department | undefined {
  return DEPARTMENTS.find((department) => department.id === id)
}

export function findCategory(value: string | null | undefined): DepartmentCategory | undefined {
  if (!value) return undefined
  for (const department of DEPARTMENTS) {
    const hit = department.categories.find((category) => category.value === value)
    if (hit) return hit
  }
  return undefined
}

/** Count products for a merchandising category from API facet counts. */
export function categoryCount(counts: Record<string, number> | undefined, category: DepartmentCategory): number {
  if (!counts) return 0
  return categoryValues(category).reduce((total, value) => total + (counts[value] ?? 0), 0)
}

export interface CatalogueQuery {
  department: string
  category: string
  q: string
  sort: 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'name'
}

export const DEFAULT_QUERY: CatalogueQuery = {
  department: 'clothing',
  category: '',
  q: '',
  sort: 'featured',
}

export function queryFromParams(params: URLSearchParams): CatalogueQuery {
  const department = findDepartment(params.get('department'))?.id ?? DEFAULT_QUERY.department
  const category = findCategory(params.get('category'))
  return {
    department,
    category: category ? category.value : '',
    q: params.get('q') ?? '',
    sort: (['featured', 'newest', 'price_asc', 'price_desc', 'name'] as const).includes(
      (params.get('sort') ?? 'featured') as CatalogueQuery['sort'],
    )
      ? ((params.get('sort') ?? 'featured') as CatalogueQuery['sort'])
      : 'featured',
  }
}

export function paramsFromQuery(query: CatalogueQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.department !== DEFAULT_QUERY.department) params.set('department', query.department)
  if (query.category) params.set('category', query.category)
  if (query.q.trim()) params.set('q', query.q.trim())
  if (query.sort !== DEFAULT_QUERY.sort) params.set('sort', query.sort)
  return params
}
