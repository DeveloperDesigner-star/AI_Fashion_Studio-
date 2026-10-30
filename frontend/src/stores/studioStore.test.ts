import { beforeEach, describe, expect, it } from 'vitest'
import { useStudioStore, visibleItems, type FittingItem } from '@/stores/studioStore'
import type { Garment } from '@/lib/types'

const garment = (id: string, slot: string): Garment =>
  ({
    id,
    slug: `${slot}-${id}`,
    name: `${slot} ${id}`,
    slot,
    category: slot,
    gender: 'womenswear',
  }) as unknown as Garment

const item = (id: string, slot: string): Omit<FittingItem, 'key'> => ({
  slot,
  garment: garment(id, slot),
  designId: null,
  designName: null,
  components: {},
})

describe('studio store', () => {
  beforeEach(() => {
    useStudioStore.getState().clear()
    useStudioStore.setState({ walk: false, autoRotate: false, showAccessories: true })
  })

  it('keeps one garment per exclusive slot and replaces the earlier one', () => {
    useStudioStore.getState().addItem(item('a', 'top'))
    useStudioStore.getState().addItem(item('b', 'top'))
    const items = useStudioStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].garment.id).toBe('b')
  })

  it('a dress displaces separate top and bottom pieces', () => {
    useStudioStore.getState().addItem(item('top', 'top'))
    useStudioStore.getState().addItem(item('bottom', 'bottom'))
    useStudioStore.getState().addItem(item('dress', 'dress'))
    expect(useStudioStore.getState().items.map((entry) => entry.slot)).toEqual(['dress'])
  })

  it('adding a top removes the competing dress', () => {
    useStudioStore.getState().addItem(item('dress', 'dress'))
    useStudioStore.getState().addItem(item('top', 'top'))
    expect(useStudioStore.getState().items.map((entry) => entry.slot)).toEqual(['top'])
  })

  it('filters accessories for display without deleting them', () => {
    useStudioStore.getState().addItem(item('bag', 'bag'))
    useStudioStore.getState().addItem(item('top', 'top'))
    const items = useStudioStore.getState().items
    expect(visibleItems(items, false).map((entry) => entry.slot)).toEqual(['top'])
    expect(items).toHaveLength(2)
  })

  it('hydrates a saved outfit with stable keys and clears it', () => {
    useStudioStore.getState().hydrate([item('jacket', 'outerwear'), item('trousers', 'bottom')])
    const items = useStudioStore.getState().items
    expect(items.map((entry) => entry.key)).toEqual(['jacket:base', 'trousers:base'])
    useStudioStore.getState().clear()
    expect(useStudioStore.getState().items).toHaveLength(0)
  })

  it('removes a single item by key and by slot', () => {
    useStudioStore.getState().addItem(item('coat', 'outerwear'))
    useStudioStore.getState().addItem(item('boots', 'footwear'))
    useStudioStore.getState().removeSlot('outerwear')
    expect(useStudioStore.getState().items.map((entry) => entry.slot)).toEqual(['footwear'])
    useStudioStore.getState().removeItem('boots:base')
    expect(useStudioStore.getState().items).toHaveLength(0)
  })
})
