import { describe, expect, it } from 'vitest'
import {
  MOCKUPS,
  fitInsidePrintArea,
  pointInQuad,
  primaryView,
  printSizeLabel,
  quadBounds,
  resolveMockup,
} from '@/lib/mockups'

describe('mockup registry', () => {
  it('gives every view a complete, in-frame print quad', () => {
    for (const mockup of Object.values(MOCKUPS)) {
      expect(mockup.views.length).toBeGreaterThan(0)
      for (const view of mockup.views) {
        expect(view.src).toMatch(/^\/mockups\/.+\.jpg$/)
        expect(view.width).toBeGreaterThan(0)
        expect(view.height).toBeGreaterThan(0)
        for (const corner of Object.values(view.printArea)) {
          expect(corner.x).toBeGreaterThanOrEqual(0)
          expect(corner.x).toBeLessThanOrEqual(1)
          expect(corner.y).toBeGreaterThanOrEqual(0)
          expect(corner.y).toBeLessThanOrEqual(1)
        }
        const bounds = quadBounds(view.printArea)
        expect(bounds.width).toBeGreaterThan(0.15)
        expect(bounds.height).toBeGreaterThan(0.15)
        // A printable region must sit inside the garment, never on the frame edge.
        expect(bounds.x).toBeGreaterThan(0.15)
        expect(bounds.x + bounds.width).toBeLessThan(0.85)
      }
    }
  })

  it('resolves a photographed blank per category and department', () => {
    expect(resolveMockup({ category: 'tshirt', gender: 'menswear' })?.id).toBe('tee')
    expect(resolveMockup({ category: 'tshirt', gender: 'womenswear' })?.id).toBe('womens-tee')
    expect(resolveMockup({ category: 'polo' })?.id).toBe('polo')
    expect(resolveMockup({ category: 'hoodie' })?.id).toBe('hoodie')
    expect(resolveMockup({ category: 'kids' })?.id).toBe('kids-tee')
    expect(resolveMockup({ category: 'kurta_pajama' })?.id).toBe('kurta')
    expect(resolveMockup({ category: 'shalwar_kameez' })?.id).toBe('kurta')
    expect(resolveMockup({ category: 'blazer' })?.id).toBe('jacket')
  })

  it('returns null rather than substituting a different product', () => {
    expect(resolveMockup({ category: 'saree' })).toBeNull()
    expect(resolveMockup({ category: 'watch' })).toBeNull()
    expect(resolveMockup({ category: 'handbag' })).toBeNull()
    expect(resolveMockup({ category: 'dress' })).toBeNull()
    expect(primaryView(null)).toBeNull()
  })

  it('exposes a front view as the default for every mockup', () => {
    for (const mockup of Object.values(MOCKUPS)) {
      expect(primaryView(mockup)?.view).toBe('front')
    }
  })
})

describe('print geometry', () => {
  const view = MOCKUPS.tee.views[0]

  it('computes axis-aligned bounds from a quad', () => {
    const bounds = quadBounds(view.printArea)
    expect(bounds.x).toBeCloseTo(0.335, 5)
    expect(bounds.width).toBeCloseTo(0.33, 5)
    expect(bounds.y).toBeCloseTo(0.285, 5)
  })

  it('fits portrait artwork inside a portrait print area', () => {
    const fitted = fitInsidePrintArea(view.printArea, 0.75)
    const bounds = quadBounds(view.printArea)
    expect(fitted.width).toBeLessThan(bounds.width)
    expect(fitted.height).toBeLessThan(bounds.height)
    expect(fitted.width / fitted.height).toBeCloseTo(0.75, 5)
    expect(fitted.cx).toBeCloseTo(bounds.x + bounds.width / 2, 5)
  })

  it('fits very wide artwork by width and keeps the aspect ratio', () => {
    const fitted = fitInsidePrintArea(view.printArea, 4)
    expect(fitted.width / fitted.height).toBeCloseTo(4, 5)
    const bounds = quadBounds(view.printArea)
    expect(fitted.width).toBeLessThanOrEqual(bounds.width)
  })

  it('detects points inside and outside the printable region', () => {
    const centre = { x: 0.5, y: 0.45 }
    expect(pointInQuad(centre, view.printArea)).toBe(true)
    expect(pointInQuad({ x: 0.05, y: 0.45 }, view.printArea)).toBe(false)
    expect(pointInQuad({ x: 0.5, y: 0.95 }, view.printArea)).toBe(false)
  })

  it('reports the physical print size of a view', () => {
    expect(printSizeLabel(view)).toBe('30 × 40 cm')
  })
})
