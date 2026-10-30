import type { AvatarParameters } from '@/lib/types'

/** Fallback proportions for visitors without an avatar (population averages). */
export const FALLBACK_AVATAR: AvatarParameters = {
  height_m: 1.72,
  head_height: 0.224,
  neck_width: 0.12,
  shoulder_width: 0.42,
  chest_width: 0.29,
  chest_depth: 0.19,
  waist_width: 0.24,
  waist_depth: 0.16,
  hip_width: 0.31,
  hip_depth: 0.21,
  torso_length: 0.46,
  leg_length: 0.79,
  thigh_width: 0.15,
  calf_width: 0.12,
  arm_length: 0.58,
  shoulder_slope: 0.014,
  posture: 'upright',
  preset: 'editorial',
  gender_presentation: 'neutral',
  bmi_estimate: null,
  derived_body_shape: null,
  fabric_drape: 'fluid',
}
