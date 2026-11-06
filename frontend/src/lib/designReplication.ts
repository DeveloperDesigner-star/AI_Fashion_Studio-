/**
 * Design replication client.
 *
 * Two rules are encoded in the types rather than trusted to each component:
 *
 * - A blueprint slot's `value` is `string | null`, and `null` means "not
 *   visible in the reference". There is no default to fall back to, so a
 *   component that forgets to handle `null` has to handle `undefined` instead
 *   and TypeScript flags it.
 * - Every blueprint slot carries `source`, so the UI can always show whether a
 *   value came from the model or from the person correcting it.
 */

import { api } from '@/lib/api'
import type { DerivedAsset, MediaAsset } from '@/lib/types'

export const BLUEPRINT_SLOTS = [
  'garment_shape',
  'fabric_appearance',
  'neckline',
  'sleeve_design',
  'collar',
  'embroidered_details',
  'printed_pattern',
  'borders_trims',
  'buttons_and_decoration',
] as const

export type BlueprintSlot = (typeof BLUEPRINT_SLOTS)[number]

export const SLOT_LABELS: Record<BlueprintSlot, string> = {
  garment_shape: 'Garment shape',
  fabric_appearance: 'Fabric appearance',
  neckline: 'Neckline',
  sleeve_design: 'Sleeve design',
  collar: 'Collar',
  embroidered_details: 'Embroidery style',
  printed_pattern: 'Printed pattern',
  borders_trims: 'Borders and trims',
  buttons_and_decoration: 'Buttons and decoration',
}

export interface Observation {
  value: string | null
  confidence: number
  note: string | null
  source: 'ai' | 'user'
}

export interface BlueprintColor {
  hex: string
  name: string | null
  role: 'primary' | 'secondary' | 'accent'
  confidence: number
  coverage?: number | null
}

export interface BlueprintPlacement {
  area: string
  detail: string
  confidence: number
  source: 'ai' | 'user'
}

export interface Blueprint {
  summary: string | null
  is_garment_reference: boolean
  rejection_reason: string | null
  observations: Record<BlueprintSlot, Observation>
  colors: BlueprintColor[]
  placements: BlueprintPlacement[]
}

export interface CapabilityBlock {
  configured: boolean
  reason: string
  provider: string | null
  model: string | null
}

export interface ReplicationCapabilities {
  analysis: CapabilityBlock
  rendering: CapabilityBlock
  limits: {
    max_references_per_design: number
    max_render_bytes: number
    renders_per_hour: number
    max_instruction_length: number
  }
  disclosure: string
  template_count: number
}

export interface GarmentTemplate {
  garment_id: string
  name: string
  slug: string
  gender: string
  category: string
  slot: string
  silhouette: string | null
  components: { id: string; label: string; fabrics: string[]; allows_print: boolean }[]
}

export interface RenderJob {
  id: string
  design_id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unavailable'
  kind: 'full' | 'parts'
  view: 'front' | 'back'
  parts: string[]
  instruction: string | null
  provider: string | null
  model: string | null
  result_asset_id: string | null
  error_code: string | null
  error: string | null
  duration_ms: number | null
  reference_revision: number
  stalled: boolean
  created_at: string | null
  finished_at: string | null
}

export interface ReferenceState {
  asset_id: string | null
  content_url: string | null
  width: number | null
  height: number | null
  original_filename: string | null
  reference_revision: number
  part_references: Record<string, string>
}

export interface ReplicationState {
  design_id: string
  name: string
  garment: {
    id: string
    name: string
    slot: string
    category: string
    silhouette: string | null
    components: { id: string; label: string; geometry?: string }[]
  }
  target_gender: string | null
  reference: ReferenceState
  blueprint: Blueprint | null
  blueprint_meta: {
    provider: string | null
    model: string | null
    analysed_at: string | null
    slots: string[]
    reference_revision: number
  }
  unknown_fields: string[]
  renders: RenderJob[]
  latest_render_by_view: { front: string | null; back: string | null }
  analysis_available: boolean
  analysis_reason: string
  rendering_available: boolean
  rendering_reason: string
  disclosure: string
  try_on: {
    supported: boolean
    photo_mode: boolean
    garment_id: string
    design_id: string
    label: string
  }
}

export interface AnalysisResponse {
  design_id: string
  blueprint: Blueprint
  unknown_fields: string[]
  known_fields: string[]
  provider: string | null
  model: string | null
  latency_ms: number | null
  analysed_at: string | null
  note: string
}

export interface TemplateList {
  items: GarmentTemplate[]
  total: number
  note: string
}

export interface BlueprintPatch {
  summary?: string
  observations?: Partial<Record<BlueprintSlot, { value: string | null; confidence?: number; note?: string | null }>>
  colors?: { hex: string; name?: string | null; role?: 'primary' | 'secondary' | 'accent' }[]
  placements?: { area: string; detail: string }[]
}

export interface RenderRequest {
  kind?: 'full' | 'parts'
  parts?: string[]
  view?: 'front' | 'back'
  instruction?: string | null
}

const BASE = '/design-replication'

export const replication = {
  capabilities: () => api.get<ReplicationCapabilities>(`${BASE}/capabilities`),
  templates: (gender?: string) =>
    api.get<TemplateList>(`${BASE}/templates${gender ? `?gender=${encodeURIComponent(gender)}` : ''}`),
  state: (designId: string) => api.get<ReplicationState>(`${BASE}/designs/${designId}`),
  setTarget: (designId: string, gender: string) =>
    api.post<ReplicationState>(`${BASE}/designs/${designId}/target`, { gender }),
  attachReference: (designId: string, assetId: string, part?: string) =>
    api.post<ReplicationState>(`${BASE}/designs/${designId}/reference`, {
      asset_id: assetId,
      ...(part ? { part } : {}),
    }),
  removeReference: (designId: string, part?: string) =>
    api.delete<ReplicationState>(
      `${BASE}/designs/${designId}/reference${part ? `?part=${encodeURIComponent(part)}` : ''}`,
    ),
  analyse: (designId: string) => api.post<AnalysisResponse>(`${BASE}/designs/${designId}/analyse`),
  correct: (designId: string, patch: BlueprintPatch) =>
    api.patch<AnalysisResponse>(`${BASE}/designs/${designId}/blueprint`, patch),
  renders: (designId: string) => api.get<RenderJob[]>(`${BASE}/designs/${designId}/renders`),
  render: (designId: string, request: RenderRequest) =>
    api.post<RenderJob>(`${BASE}/designs/${designId}/renders`, request),
  job: (jobId: string) => api.get<RenderJob>(`${BASE}/renders/${jobId}`),
  upload: (file: File, kind = 'reference') => api.upload<MediaAsset>('/media/upload', file, { kind }),
  crop: (assetId: string, rect: { x: number; y: number; width: number; height: number }) =>
    api.post<DerivedAsset>(`/media/${assetId}/crop`, rect),
  rotate: (assetId: string, degrees: 90 | 180 | 270) =>
    api.post<DerivedAsset>(`/media/${assetId}/rotate`, { degrees }),
}

/** The mandated disclosure for any AI try-on preview shown after this flow. */
export const TRY_ON_DISCLOSURE =
  'AI-generated virtual try-on preview. This is a visual simulation and does not guarantee ' +
  'exact garment fit, measurements or fabric behavior.'

export function knownObservations(blueprint: Blueprint | null) {
  if (!blueprint) return []
  return BLUEPRINT_SLOTS.filter((slot) => {
    const observation = blueprint.observations?.[slot]
    return Boolean(observation && observation.value)
  }).map((slot) => ({ slot, observation: blueprint.observations[slot] }))
}

export function unknownObservations(blueprint: Blueprint | null) {
  if (!blueprint) return []
  return BLUEPRINT_SLOTS.filter((slot) => !blueprint.observations?.[slot]?.value)
}
