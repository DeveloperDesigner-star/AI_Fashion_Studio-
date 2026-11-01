/**
 * Local, non-sensitive display preferences.
 *
 * Units are a view preference, not profile data: the API always stores metric
 * values and the interface converts on read/write. Persisting the choice keeps
 * the whole studio consistent between visits.
 */
export type UnitSystem = 'metric' | 'imperial'

const UNIT_KEY = 'afs.units'
const MOTION_KEY = 'afs.reducedMotion'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable (private mode, blocked cookies) — the
    // preference simply falls back to the default for this session.
  }
}

export function getPreferredUnits(): UnitSystem {
  return read(UNIT_KEY) === 'imperial' ? 'imperial' : 'metric'
}

export function setPreferredUnits(units: UnitSystem): void {
  write(UNIT_KEY, units)
}

export function getReducedMotion(): boolean {
  return read(MOTION_KEY) === 'on'
}

export function setReducedMotion(reduced: boolean): void {
  write(MOTION_KEY, reduced ? 'on' : 'off')
  applyReducedMotion(reduced)
}

/** Mirror the preference onto <html> so the CSS layer can honour it. */
export function applyReducedMotion(reduced = getReducedMotion()): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'
}
