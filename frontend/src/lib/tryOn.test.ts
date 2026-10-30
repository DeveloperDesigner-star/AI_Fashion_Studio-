import { describe, expect, it } from 'vitest'
import {
  ACCESSORY_SLOTS,
  AI_SUPPORTED_SLOTS,
  baseLookForComparison,
  clothTypeForSlot,
  fabricFinish,
  shoeAttachment,
  shoeDetails,
  shoeStyleFor,
  supportsAi,
} from '@/lib/tryOn'
import { lookFromItems, roleColor, roleFabric, shoeStyleFor as fittingShoeStyle } from '@/lib/fittingRoom'
import type { FittingItem } from '@/stores/studioStore'
import type { Garment } from '@/lib/types'

const garment = (overrides: Partial<Garment> = {}): Garment =>
  ({
    id: 'garment',
    slug: 'garment',
    name: 'Kameez',
    slot: 'top',
    category: 'kameez',
    gender: 'womenswear',
    silhouette: 'straight',
    default_color: '#8d4f43',
    default_fabric: 'cotton',
    palette: { primary: '#8d4f43' },
    components: [],
    sizes: ['S', 'M', 'L'],
    ...overrides,
  }) as unknown as Garment

const item = (overrides: Partial<FittingItem> & { garment?: Garment } = {}): FittingItem => ({
  key: `${overrides.garment?.id ?? 'garment'}:base`,
  slot: overrides.slot ?? 'top',
  garment: overrides.garment ?? garment(),
  designId: null,
  designName: null,
  components: {},
  ...overrides,
})

describe('AI garment mapping', () => {
  it('maps upper, lower and full-body slots only', () => {
    expect(clothTypeForSlot('top')).toBe('upper')
    expect(clothTypeForSlot('outerwear')).toBe('upper')
    expect(clothTypeForSlot('bottom')).toBe('lower')
    expect(clothTypeForSlot('dress')).toBe('overall')
    expect(clothTypeForSlot('footwear')).toBeNull()
    expect(clothTypeForSlot('accessory')).toBeNull()
    for (const slot of AI_SUPPORTED_SLOTS) expect(supportsAi(slot)).toBe(true)
    for (const slot of ACCESSORY_SLOTS) expect(supportsAi(slot)).toBe(false)
  })
})

describe('rig-attached footwear', () => {
  it('parents left and right shoes to the matching foot bones', () => {
    const left = shoeAttachment('L')
    const right = shoeAttachment('R')
    expect(left.bone).toBe('foot_L')
    expect(right.bone).toBe('foot_R')
    expect(left.position).toEqual(right.position)
    expect(Math.abs(left.position[0])).toBeLessThan(0.01)
    expect(left.soleSize[2]).toBeGreaterThan(left.soleSize[0])
    expect(shoeDetails('heel').heel).toBe(true)
    expect(shoeDetails('boot').bootShaft).toBe(true)
    expect(shoeDetails('sandal').straps).toBe(true)
    expect(shoeDetails('sneaker').soleColor).not.toBe(shoeDetails('classic').soleColor)
  })

  it('marks catalogue footwear for an external rig-attached mesh', () => {
    const shoes = item({
      slot: 'footwear',
      garment: garment({ slot: 'footwear', category: 'heels', name: 'Silk pump' }),
    })
    const look = lookFromItems([shoes])
    expect(look.externalFootwear).toBe(true)
    expect(look.shoeStyle).toBe('heel')
    expect(look.pieceIds).toEqual(['footwear'])
  })

  it('keeps style mapping consistent between libs', () => {
    const styles = [
      garment({ category: 'heels' }),
      garment({ category: 'boots' }),
      garment({ category: 'sneakers' }),
      garment({ category: 'sandals' }),
      garment({ category: 'formal_shoes' }),
    ]
    for (const entry of styles) {
      expect(shoeStyleFor(entry)).toBe(fittingShoeStyle(entry))
    }
  })
})

describe('try-on colour and fabric overrides', () => {
  it('applies an explicit colour over a saved design and keeps the design otherwise', () => {
    const designed = item({
      components: {
        kameez_front: { color: '#112233', fabric: 'silk', pattern: 'solid', embroidery: 'none' },
      },
      garment: garment({
        components: [
          { id: 'kameez_front', label: 'Front', fabrics: ['silk'], allows_print: true, kind: 'front_panel' },
        ],
      }),
    })
    expect(roleColor(designed, 'top')).toBe('#112233')
    expect(roleFabric(designed, 'top')).toBe('silk')
    expect(roleColor({ ...designed, colorOverride: '#abcdef' }, 'top')).toBe('#abcdef')
    expect(roleFabric({ ...designed, fabricOverride: 'linen' }, 'top')).toBe('linen')
  })

  it('uses the saved design fabric for sleeves when no override is set', () => {
    const designed = item({
      components: {
        sleeves: { color: '#445566', fabric: 'organza', pattern: 'solid', embroidery: 'none' },
      },
      garment: garment({
        components: [
          { id: 'sleeves', label: 'Sleeves', fabrics: ['organza'], allows_print: true, kind: 'sleeve' },
        ],
      }),
    })
    expect(roleFabric(designed, 'sleeves')).toBe('organza')
  })

  it('returns illustrative material finishes, not physical claims', () => {
    expect(fabricFinish('silk').roughness).toBeLessThan(fabricFinish('denim').roughness)
    expect(fabricFinish('metal').metalness).toBeGreaterThan(fabricFinish('cotton').metalness)
    expect(fabricFinish('unknown').roughness).toBeGreaterThan(0)
  })
})

describe('original vs customised comparison', () => {
  it('strips the design, overrides and accessories from the base look', () => {
    const top = item({
      key: 'top:design',
      designId: 'design-1',
      components: {
        kameez_front: { color: '#112233', fabric: 'silk', pattern: 'solid', embroidery: 'none' },
      },
      colorOverride: '#112233',
      fabricOverride: 'silk',
    })
    const shoes = item({
      key: 'shoes:base',
      slot: 'footwear',
      garment: garment({ id: 'shoes', slot: 'footwear', category: 'heels' }),
    })
    const custom = lookFromItems([top, shoes])
    expect(custom.pieceIds).toContain('footwear')
    const base = baseLookForComparison([top, shoes])
    expect(base.pieceIds).toEqual(['top'])
    expect(base.colors.top).toBe('#8d4f43')
    expect(base.fabrics.top).toBe('cotton')
    expect(base.externalFootwear).toBe(false)
  })
})
