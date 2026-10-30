import { create } from 'zustand'
import type { ComponentCustomisation, Garment } from '@/lib/types'

export interface FittingItem {
  /** Stable key: garment id + design id (a garment may be worn in two colourways). */
  key: string
  slot: string
  garment: Garment
  designId: string | null
  designName: string | null
  components: Record<string, ComponentCustomisation>
}

interface StudioState {
  items: FittingItem[]
  walk: boolean
  autoRotate: boolean
  showAccessories: boolean
  activeSlot: string | null
  addItem: (item: Omit<FittingItem, 'key'>) => void
  removeItem: (key: string) => void
  removeSlot: (slot: string) => void
  clear: () => void
  setWalk: (value: boolean) => void
  setAutoRotate: (value: boolean) => void
  setShowAccessories: (value: boolean) => void
  setActiveSlot: (slot: string | null) => void
  hydrate: (items: Omit<FittingItem, 'key'>[]) => void
}

const accessorySlots = new Set(['bag', 'watch', 'accessory', 'headwear'])

export const useStudioStore = create<StudioState>((set, get) => ({
  items: [],
  walk: false,
  autoRotate: false,
  showAccessories: true,
  activeSlot: null,

  addItem: (item) => {
    const key = `${item.garment.id}:${item.designId ?? 'base'}`
    const items = get().items.filter((existing) => {
      if (existing.key === key) return false
      // A dress replaces a separate top and bottom, and vice versa.
      if (item.slot === 'dress' && ['top', 'bottom'].includes(existing.slot)) return false
      if (['top', 'bottom'].includes(item.slot) && existing.slot === 'dress') return false
      // One item per occupied slot unless it is a stacked accessory slot.
      if (existing.slot === item.slot && !accessorySlots.has(item.slot)) return false
      if (existing.slot === item.slot && accessorySlots.has(item.slot)) return false
      return true
    })
    set({ items: [...items, { ...item, key }], activeSlot: item.slot })
  },

  removeItem: (key) => set({ items: get().items.filter((item) => item.key !== key) }),
  removeSlot: (slot) => set({ items: get().items.filter((item) => item.slot !== slot) }),
  clear: () => set({ items: [], activeSlot: null }),
  setWalk: (walk) => set({ walk }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  setShowAccessories: (showAccessories) => set({ showAccessories }),
  setActiveSlot: (activeSlot) => set({ activeSlot }),
  hydrate: (items) =>
    set({
      items: items.map((item) => ({ ...item, key: `${item.garment.id}:${item.designId ?? 'base'}` })),
    }),
}))

export function visibleItems(
  items: FittingItem[],
  showAccessories: boolean,
): FittingItem[] {
  return showAccessories ? items : items.filter((item) => !accessorySlots.has(item.slot))
}
