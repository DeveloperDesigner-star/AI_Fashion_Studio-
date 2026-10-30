/**
 * Avatar Studio rules shared by the wizard, the 3D preview and the API client.
 *
 * These helpers deliberately mirror the backend constraints: the server is the
 * source of truth, but clamping locally keeps the sliders honest and lets the
 * preview react without a round trip.
 */
import type { AvatarAdjustments, AvatarParameters } from '@/lib/types'

export const ADJUSTMENT_RANGES = {
  height: [0.94, 1.06],
  build: [0.9, 1.1],
  shoulder: [0.9, 1.1],
  torso: [0.95, 1.05],
  leg: [0.95, 1.05],
} as const satisfies Record<keyof AvatarAdjustments, readonly [number, number]>

export type AdjustmentKey = keyof typeof ADJUSTMENT_RANGES

export const ADJUSTMENT_LABELS: Record<AdjustmentKey, { label: string; hint: string }> = {
  height: { label: 'Overall height', hint: 'Scales the whole figure around the measured height.' },
  build: { label: 'Volume', hint: 'Chest, waist and hip breadth.' },
  shoulder: { label: 'Shoulder line', hint: 'Broader or narrower shoulders.' },
  torso: { label: 'Torso length', hint: 'Distance from waist to shoulder.' },
  leg: { label: 'Leg length', hint: 'Inseam proportion of the figure.' },
}

export const ADJUSTMENT_KEYS: AdjustmentKey[] = ['height', 'build', 'shoulder', 'torso', 'leg']

export const DEFAULT_ADJUSTMENTS: AvatarAdjustments = {
  height: 1,
  build: 1,
  shoulder: 1,
  torso: 1,
  leg: 1,
}

export const BASE_MODEL_IDS = ['willow', 'atlas', 'line', 'curve'] as const
export type BaseModelId = (typeof BASE_MODEL_IDS)[number]

export const PHOTO_VIEWS = [
  {
    value: 'front',
    label: 'Front',
    guidance: 'Full body, facing the camera, arms relaxed at the sides.',
  },
  { value: 'side', label: 'Side', guidance: 'Standing side-on so the posture is visible.' },
  { value: 'back', label: 'Back', guidance: 'Back view, hair moved off the shoulders.' },
  {
    value: 'full_body',
    label: 'Full body',
    guidance: 'Head to feet in one portrait frame, neutral background.',
  },
] as const

export type PhotoView = (typeof PHOTO_VIEWS)[number]['value']

export const MIN_PHOTO_EDGE = 480

export function clampAdjustments(values?: Partial<AvatarAdjustments> | null): AvatarAdjustments {
  const result = { ...DEFAULT_ADJUSTMENTS }
  for (const key of ADJUSTMENT_KEYS) {
    const raw = values?.[key]
    const number = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(number)) continue
    const [low, high] = ADJUSTMENT_RANGES[key]
    result[key] = Math.round(Math.min(high, Math.max(low, number)) * 1000) / 1000
  }
  return result
}

export function adjustmentsDiffer(a: AvatarAdjustments, b: AvatarAdjustments = DEFAULT_ADJUSTMENTS): boolean {
  return ADJUSTMENT_KEYS.some((key) => Math.abs(a[key] - b[key]) > 0.001)
}

export function adjustmentSummary(adjustments: AvatarAdjustments): string {
  const parts = ADJUSTMENT_KEYS.filter((key) => Math.abs(adjustments[key] - 1) > 0.001).map((key) => {
    const delta = Math.round((adjustments[key] - 1) * 100)
    return `${ADJUSTMENT_LABELS[key].label} ${delta > 0 ? '+' : ''}${delta}%`
  })
  return parts.length ? parts.join(' · ') : 'No manual adjustments'
}

/**
 * Convert measured proportions into multipliers for the bundled GLB mannequin.
 * Anchors are the nominal values the base models were authored against; ratios
 * are clamped so a measurement outlier cannot distort the figure.
 */
export function measurementMultipliers(parameters?: AvatarParameters | null): {
  height: number
  build: number
  shoulder: number
} {
  if (!parameters) return { height: 1, build: 1, shoulder: 1 }
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
  const height = clamp((parameters.height_m ?? 1.72) / 1.72, 0.88, 1.12)
  const chestRatio = clamp((parameters.chest_width ?? 0.29) / 0.29, 0.9, 1.12)
  const waistRatio = clamp((parameters.waist_width ?? 0.24) / 0.24, 0.9, 1.12)
  const hipRatio = clamp((parameters.hip_width ?? 0.31) / 0.31, 0.9, 1.12)
  return {
    height,
    build: (chestRatio + waistRatio + hipRatio) / 3,
    shoulder: clamp((parameters.shoulder_width ?? 0.42) / 0.42, 0.9, 1.12),
  }
}

export interface NodeMultipliers {
  torso: [number, number, number]
  arms: [number, number, number]
  legs: [number, number, number]
  head: [number, number, number]
  armOffsetX: number
  legOffsetY: number
}

/** Per-node scale multipliers applied to the GLB mannequin. */
export function glbNodeMultipliers(
  adjustments: AvatarAdjustments,
  measured: { height: number; build: number; shoulder: number } = { height: 1, build: 1, shoulder: 1 },
): NodeMultipliers {
  const build = adjustments.build * measured.build
  const shoulder = adjustments.shoulder * measured.shoulder
  const height = adjustments.height * measured.height
  const torsoY = adjustments.torso * height
  const legY = adjustments.leg * height

  return {
    torso: [0.35 * shoulder + 0.65 * build, torsoY, build],
    arms: [build, height, build],
    legs: [build, legY, build],
    head: [measured.height, measured.height, measured.height],
    armOffsetX: shoulder,
    legOffsetY: (legY - 1) * 0.86,
  }
}

/** Only the bundled models are addressable — no arbitrary URLs from the API. */
export function modelAssetUrl(modelId: string): string {
  const safe = (BASE_MODEL_IDS as readonly string[]).includes(modelId) ? modelId : 'willow'
  return `/models/avatar-${safe}.glb`
}

export function photoViewLabel(view?: string | null): string {
  return PHOTO_VIEWS.find((entry) => entry.value === view)?.label ?? 'Reference'
}

export function photoGuidance(view: string): string {
  return PHOTO_VIEWS.find((entry) => entry.value === view)?.guidance ?? ''
}
