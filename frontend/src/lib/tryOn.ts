/**
 * Virtual try-on rules shared by the page, the rig-attached footwear and tests.
 *
 * The AI model only handles upper/lower/full-body garments. Footwear and
 * accessories are rendered by the interactive 3D preview. Neither path is a
 * physical fit guarantee.
 */
import { lookFromItems, type FittingLook } from '@/lib/fittingRoom'
export { shoeStyleFor } from '@/lib/fittingRoom'
import type { FittingItem } from '@/stores/studioStore'

export const AI_SUPPORTED_SLOTS = ['top', 'dress', 'bottom', 'outerwear'] as const
export const ACCESSORY_SLOTS = ['footwear', 'bag', 'watch', 'headwear', 'accessory'] as const

export type AiSlot = (typeof AI_SUPPORTED_SLOTS)[number]

/** CatVTON's three garment regions. `null` means the AI model cannot help. */
export function clothTypeForSlot(slot: string): 'upper' | 'lower' | 'overall' | null {
  if (slot === 'top' || slot === 'outerwear') return 'upper'
  if (slot === 'bottom') return 'lower'
  if (slot === 'dress') return 'overall'
  return null
}

export function supportsAi(slot: string): boolean {
  return clothTypeForSlot(slot) !== null
}

/** Illustrative material appearance only — not a physical fabric simulation. */
export function fabricFinish(fabric: string): { roughness: number; metalness: number } {
  switch ((fabric || '').toLowerCase()) {
    case 'silk':
    case 'satin':
      return { roughness: 0.28, metalness: 0.08 }
    case 'chiffon':
    case 'organza':
    case 'tulle':
    case 'lace':
      return { roughness: 0.4, metalness: 0.02 }
    case 'leather':
    case 'suede':
      return { roughness: 0.46, metalness: 0.03 }
    case 'denim':
      return { roughness: 0.86, metalness: 0.01 }
    case 'wool':
    case 'tweed':
    case 'cashmere':
      return { roughness: 0.82, metalness: 0 }
    case 'metal':
      return { roughness: 0.3, metalness: 0.75 }
    case 'rubber':
      return { roughness: 0.94, metalness: 0 }
    case 'linen':
    case 'cotton':
    case 'viscose':
      return { roughness: 0.78, metalness: 0 }
    default:
      return { roughness: 0.72, metalness: 0.01 }
  }
}

export type FootSide = 'L' | 'R'

export interface ShoeAttachment {
  side: FootSide
  bone: 'foot_L' | 'foot_R'
  /** Position in the foot bone's local space (metres). */
  position: [number, number, number]
  rotation: [number, number, number]
  soleSize: [number, number, number]
  upperSize: [number, number, number]
  heelSize: [number, number, number] | null
  bootShaft: boolean
  straps: boolean
}

/**
 * Footwear is parented to `foot_L` / `foot_R` rather than being guessed onto a
 * world position, so it follows the walk/idle animation with the skeleton.
 */
export function shoeAttachment(side: FootSide): ShoeAttachment {
  return {
    side,
    bone: side === 'L' ? 'foot_L' : 'foot_R',
    // The foot bone sits at the ankle (~6 cm above the floor); lower the shoe
    // group so the sole meets the ground instead of floating around the ankle.
    position: [0, -0.005, 0.018],
    rotation: [0, 0, 0],
    soleSize: [0.148, 0.026, 0.268],
    upperSize: [0.136, 0.084, 0.228],
    heelSize: null,
    bootShaft: false,
    straps: false,
  }
}

/** Style-specific additions; still authored primitives, no third-party assets. */
export function shoeDetails(style: string): {
  heel: boolean
  bootShaft: boolean
  straps: boolean
  soleColor: string
} {
  const clean = (style || '').toLowerCase()
  if (clean === 'heel') return { heel: true, bootShaft: false, straps: false, soleColor: '#241d18' }
  if (clean === 'boot') return { heel: false, bootShaft: true, straps: false, soleColor: '#2a211b' }
  if (clean === 'sandal' || clean === 'khussa') {
    return { heel: false, bootShaft: false, straps: true, soleColor: '#6d5137' }
  }
  if (clean === 'sneaker') return { heel: false, bootShaft: false, straps: false, soleColor: '#e9e3d7' }
  return { heel: false, bootShaft: false, straps: false, soleColor: '#2a211b' }
}

/**
 * The "before" look: the same main garments with catalogue defaults, no saved
 * design, no colour/fabric override and no accessories. Used by the live
 * Before/After comparison.
 */
export function baseLookForComparison(items: FittingItem[]): FittingLook {
  const mainItems = items
    .filter((item) => !(ACCESSORY_SLOTS as readonly string[]).includes(item.slot))
    .map((item) => ({
      ...item,
      key: `${item.garment.id}:base`,
      designId: null,
      designName: null,
      components: {},
      colorOverride: null,
      fabricOverride: null,
    }))
  return lookFromItems(mainItems)
}

export function accessoryItems(items: FittingItem[]): FittingItem[] {
  return items.filter((item) => (ACCESSORY_SLOTS as readonly string[]).includes(item.slot))
}
