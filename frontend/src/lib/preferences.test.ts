import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyReducedMotion,
  getPreferredUnits,
  getReducedMotion,
  setPreferredUnits,
  setReducedMotion,
} from '@/lib/preferences'

describe('display preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
    applyReducedMotion(false)
  })

  it('defaults to metric units', () => {
    expect(getPreferredUnits()).toBe('metric')
  })

  it('persists an imperial preference', () => {
    setPreferredUnits('imperial')
    expect(getPreferredUnits()).toBe('imperial')
    setPreferredUnits('metric')
    expect(getPreferredUnits()).toBe('metric')
  })

  it('ignores unknown stored values', () => {
    window.localStorage.setItem('afs.units', 'furlongs')
    expect(getPreferredUnits()).toBe('metric')
  })

  it('mirrors the motion preference onto the document element', () => {
    expect(getReducedMotion()).toBe(false)
    setReducedMotion(true)
    expect(getReducedMotion()).toBe(true)
    expect(document.documentElement.dataset.motion).toBe('reduced')
    setReducedMotion(false)
    expect(document.documentElement.dataset.motion).toBe('full')
  })
})
