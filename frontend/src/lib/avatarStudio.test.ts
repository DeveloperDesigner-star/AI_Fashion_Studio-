import { describe, expect, it } from 'vitest'
import {
  ADJUSTMENT_RANGES,
  DEFAULT_ADJUSTMENTS,
  adjustmentSummary,
  adjustmentsDiffer,
  clampAdjustments,
  glbNodeMultipliers,
  measurementMultipliers,
  modelAssetUrl,
  photoViewLabel,
} from '@/lib/avatarStudio'
import type { AvatarParameters } from '@/lib/types'

describe('avatar adjustments', () => {
  it('starts from neutral multipliers', () => {
    expect(clampAdjustments()).toEqual(DEFAULT_ADJUSTMENTS)
    expect(adjustmentsDiffer(DEFAULT_ADJUSTMENTS)).toBe(false)
  })

  it('clamps out-of-range and non-numeric values', () => {
    const clamped = clampAdjustments({ height: 2, build: 0.1, torso: Number.NaN, leg: 1.02 })
    expect(clamped.height).toBe(ADJUSTMENT_RANGES.height[1])
    expect(clamped.build).toBe(ADJUSTMENT_RANGES.build[0])
    expect(clamped.torso).toBe(1)
    expect(clamped.leg).toBe(1.02)
  })

  it('summarises only the sliders that moved', () => {
    expect(adjustmentSummary(DEFAULT_ADJUSTMENTS)).toBe('No manual adjustments')
    expect(adjustmentSummary({ ...DEFAULT_ADJUSTMENTS, height: 1.04, build: 0.96 })).toContain('Overall height +4%')
    expect(adjustmentSummary({ ...DEFAULT_ADJUSTMENTS, height: 1.04, build: 0.96 })).toContain('Volume -4%')
  })

  it('derives measurement multipliers within safe limits', () => {
    const tall = { height_m: 2.2, chest_width: 0.9, waist_width: 0.1, hip_width: 0.9 } as AvatarParameters
    const multipliers = measurementMultipliers(tall)
    expect(multipliers.height).toBeLessThanOrEqual(1.12)
    expect(multipliers.build).toBeGreaterThan(0.9)
    expect(measurementMultipliers(null)).toEqual({ height: 1, build: 1, shoulder: 1 })
  })

  it('scales GLB nodes from the combined multipliers', () => {
    const neutral = glbNodeMultipliers(DEFAULT_ADJUSTMENTS)
    expect(neutral.torso).toEqual([1, 1, 1])
    expect(neutral.legOffsetY).toBe(0)

    const adjusted = glbNodeMultipliers({ ...DEFAULT_ADJUSTMENTS, leg: 1.05, shoulder: 1.1 })
    expect(adjusted.legs[1]).toBeCloseTo(1.05, 3)
    expect(adjusted.legOffsetY).toBeGreaterThan(0)
    expect(adjusted.armOffsetX).toBeCloseTo(1.1, 3)
  })

  it('only resolves bundled model assets', () => {
    expect(modelAssetUrl('atlas')).toBe('/models/avatar-atlas.glb')
    expect(modelAssetUrl('../../etc/passwd')).toBe('/models/avatar-willow.glb')
  })

  it('labels photo views with a readable fallback', () => {
    expect(photoViewLabel('full_body')).toBe('Full body')
    expect(photoViewLabel(null)).toBe('Reference')
  })
})
