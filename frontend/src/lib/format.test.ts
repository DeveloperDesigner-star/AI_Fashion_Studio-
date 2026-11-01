import { describe, expect, it } from 'vitest'
import {
  SLOT_LABELS,
  SLOT_ORDER,
  cmToInches,
  formatBytes,
  formatDate,
  formatPrice,
  inchesToCm,
  initials,
  titleCase,
} from '@/lib/format'

describe('format helpers', () => {
  it('formats prices from integer cents', () => {
    expect(formatPrice(12900)).toBe('$129')
    expect(formatPrice(0)).toBe('$0')
    expect(formatPrice(4550, 'EUR')).toContain('45.50')
  })

  it('converts between centimetres and inches with one decimal', () => {
    expect(cmToInches(91.44)).toBeCloseTo(36, 1)
    expect(inchesToCm(36)).toBeCloseTo(91.44, 1)
  })

  it('handles missing dates without crashing', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
  })

  it('humanises slugs and initials', () => {
    expect(titleCase('in_production')).toBe('In Production')
    expect(initials('Ayesha Khan')).toBe('AK')
  })

  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('keeps the slot vocabulary in header-to-toe order', () => {
    expect(SLOT_ORDER.indexOf('outerwear')).toBeLessThan(SLOT_ORDER.indexOf('top'))
    expect(SLOT_ORDER.indexOf('top')).toBeLessThan(SLOT_ORDER.indexOf('bottom'))
    expect(SLOT_ORDER.indexOf('footwear')).toBeGreaterThan(SLOT_ORDER.indexOf('bottom'))
    expect(SLOT_ORDER[SLOT_ORDER.length - 1]).toBe('accessory')
    expect(Object.keys(SLOT_LABELS).sort()).toEqual([...SLOT_ORDER].sort())
  })
})
