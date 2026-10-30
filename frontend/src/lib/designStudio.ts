/**
 * Design-studio document helpers.
 *
 * The document is a map of component customisations, each owning its own
 * artwork layers. Everything here is pure and unit-tested: the page only wires
 * it to the API and pointer events.
 */

import type {
  ComponentCustomisation,
  Design,
  Garment,
  GarmentComponent,
  DesignLayer,
  LayerCrop,
  LayerTransform,
  MediaAsset,
} from '@/lib/types'
import { STAGE } from '@/lib/designLayout'

export const MAX_LAYERS_PER_COMPONENT = 8
export const MAX_LAYERS_PER_DESIGN = 40

let layerCounter = 0

export function newLayerId(): string {
  layerCounter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `layer-${Date.now().toString(36)}-${layerCounter}-${random}`.slice(0, 48)
}

export function defaultComponent(
  component: GarmentComponent,
  garment: Pick<Garment, 'default_fabric' | 'default_color' | 'palette'>,
): ComponentCustomisation {
  return {
    color: garment.palette?.primary ?? garment.default_color ?? '#1f1d1a',
    fabric: component.fabrics.includes(garment.default_fabric)
      ? garment.default_fabric
      : component.fabrics[0] ?? 'cotton',
    pattern: 'solid',
    embroidery: 'none',
    layers: [],
    pattern_scale: 1,
    pattern_rotation: 0,
    print_asset_id: null,
    notes: null,
  }
}

/** Merge saved component settings with catalogue defaults, preserving layers. */
export function mergeComponentDefaults(
  garment: Pick<Garment, 'components' | 'default_fabric' | 'default_color' | 'palette'>,
  saved: Record<string, ComponentCustomisation> = {},
): Record<string, ComponentCustomisation> {
  const result: Record<string, ComponentCustomisation> = {}
  garment.components.forEach((component) => {
    const stored = saved[component.id]
    const fallback = defaultComponent(component, garment)
    result[component.id] = {
      ...fallback,
      ...(stored ?? {}),
      layers: (stored?.layers ?? []).map((layer) => normaliseLayer(layer)),
      pattern_scale: stored?.pattern_scale ?? 1,
      pattern_rotation: stored?.pattern_rotation ?? 0,
    }
  })
  return result
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function normaliseTransform(transform: LayerTransform): LayerTransform {
  return {
    x: clampNumber(transform.x, -1, 2),
    y: clampNumber(transform.y, -1, 2),
    width: clampNumber(transform.width, 0.03, 3),
    height: clampNumber(transform.height, 0.03, 3),
    rotation: clampNumber(transform.rotation, -360, 360),
    opacity: clampNumber(transform.opacity, 0, 1),
    flip_x: Boolean(transform.flip_x),
  }
}

export function normaliseCrop(crop: LayerCrop): LayerCrop {
  const width = clampNumber(crop.width, 0.02, 1)
  const height = clampNumber(crop.height, 0.02, 1)
  return {
    x: clampNumber(crop.x, 0, 1 - width),
    y: clampNumber(crop.y, 0, 1 - height),
    width,
    height,
  }
}

export function normaliseLayer(layer: DesignLayer): DesignLayer {
  return {
    ...layer,
    transform: normaliseTransform(layer.transform),
    crop: normaliseCrop(layer.crop),
    adjustments: {
      brightness: clampNumber(layer.adjustments?.brightness ?? 1, 0.2, 2),
      contrast: clampNumber(layer.adjustments?.contrast ?? 1, 0.2, 2),
      saturation: clampNumber(layer.adjustments?.saturation ?? 1, 0, 2),
      hue: clampNumber(layer.adjustments?.hue ?? 0, -180, 180),
    },
    name: (layer.name || 'Artwork').slice(0, 60),
    visible: layer.visible !== false,
    locked: Boolean(layer.locked),
    z_index: Math.round(clampNumber(layer.z_index ?? 0, 0, 60)),
  }
}

export const DEFAULT_TRANSFORM: LayerTransform = {
  x: 0.5,
  y: 0.42,
  width: 0.55,
  height: 0.5,
  rotation: 0,
  opacity: 1,
  flip_x: false,
}

export function layerFromAsset(
  asset: Pick<MediaAsset, 'id' | 'original_filename'>,
  zIndex: number,
  overrides: Partial<DesignLayer> = {},
): DesignLayer {
  return normaliseLayer({
    id: overrides.id ?? newLayerId(),
    name: overrides.name ?? asset.original_filename.replace(/\.[a-z0-9]+$/i, '').slice(0, 60),
    asset_id: asset.id,
    transform: { ...DEFAULT_TRANSFORM, ...(overrides.transform ?? {}) },
    crop: { x: 0, y: 0, width: 1, height: 1, ...(overrides.crop ?? {}) },
    adjustments: {
      brightness: 1,
      contrast: 1,
      saturation: 1,
      hue: 0,
      ...(overrides.adjustments ?? {}),
    },
    blend_mode: overrides.blend_mode ?? 'normal',
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    z_index: clampNumber(overrides.z_index ?? zIndex, 0, 60),
  })
}

export function nextZIndex(component: ComponentCustomisation | undefined): number {
  const layers = component?.layers ?? []
  return layers.reduce((max, layer) => Math.max(max, layer.z_index), -1) + 1
}

export function orderedLayers(component: ComponentCustomisation | undefined): DesignLayer[] {
  return [...(component?.layers ?? [])].sort((a, b) => a.z_index - b.z_index)
}

export function layerCount(components: Record<string, ComponentCustomisation>): number {
  return Object.values(components).reduce((total, component) => total + (component.layers?.length ?? 0), 0)
}

export function countSelectedComponentLayers(components: Record<string, ComponentCustomisation>, componentId: string): number {
  return components[componentId]?.layers?.length ?? 0
}

function withLayer(
  components: Record<string, ComponentCustomisation>,
  componentId: string,
  updater: (component: ComponentCustomisation) => ComponentCustomisation,
): Record<string, ComponentCustomisation> {
  const component = components[componentId]
  if (!component) return components
  return { ...components, [componentId]: updater(component) }
}

export function updateComponent(
  components: Record<string, ComponentCustomisation>,
  componentId: string,
  patch: Partial<ComponentCustomisation>,
): Record<string, ComponentCustomisation> {
  return withLayer(components, componentId, (component) => ({ ...component, ...patch }))
}

export function addLayer(
  components: Record<string, ComponentCustomisation>,
  componentId: string,
  layer: DesignLayer,
): Record<string, ComponentCustomisation> {
  return withLayer(components, componentId, (component) => {
    const layers = [...(component.layers ?? [])]
    if (layers.length >= MAX_LAYERS_PER_COMPONENT) return component
    const normalised = normaliseLayer({ ...layer, z_index: nextZIndex(component) })
    return { ...component, layers: [...layers, normalised] }
  })
}

export function updateLayer(
  components: Record<string, ComponentCustomisation>,
  componentId: string,
  layerId: string,
  patch: Partial<DesignLayer>,
): Record<string, ComponentCustomisation> {
  return withLayer(components, componentId, (component) => ({
    ...component,
    layers: (component.layers ?? []).map((layer) =>
      layer.id === layerId ? normaliseLayer({ ...layer, ...patch }) : layer,
    ),
  }))
}

export function removeLayer(
  components: Record<string, ComponentCustomisation>,
  componentId: string,
  layerId: string,
): Record<string, ComponentCustomisation> {
  return withLayer(components, componentId, (component) => ({
    ...component,
    layers: (component.layers ?? []).filter((layer) => layer.id !== layerId),
  }))
}

/** Move a layer one step up (later) or down (earlier) in the paint order. */
export function moveLayer(
  components: Record<string, ComponentCustomisation>,
  componentId: string,
  layerId: string,
  direction: 'up' | 'down',
): Record<string, ComponentCustomisation> {
  return withLayer(components, componentId, (component) => {
    const layers = orderedLayers(component)
    const index = layers.findIndex((layer) => layer.id === layerId)
    const target = direction === 'up' ? index + 1 : index - 1
    if (index < 0 || target < 0 || target >= layers.length) return component
    const reordered = [...layers]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    return {
      ...component,
      layers: reordered.map((layer, position) => ({ ...layer, z_index: position })),
    }
  })
}

export function duplicateLayer(
  components: Record<string, ComponentCustomisation>,
  componentId: string,
  layerId: string,
): { components: Record<string, ComponentCustomisation>; layer: DesignLayer | null } {
  const component = components[componentId]
  const layer = component?.layers?.find((candidate) => candidate.id === layerId)
  if (!component || !layer) return { components, layer: null }
  if ((component.layers?.length ?? 0) >= MAX_LAYERS_PER_COMPONENT) return { components, layer: null }
  const copy = normaliseLayer({
    ...layer,
    id: newLayerId(),
    name: `${layer.name} copy`.slice(0, 60),
    z_index: nextZIndex(component),
    transform: {
      ...layer.transform,
      x: layer.transform.x + 0.04,
      y: layer.transform.y + 0.04,
    },
  })
  return {
    components: withLayer(components, componentId, (current) => ({
      ...current,
      layers: [...(current.layers ?? []), copy],
    })),
    layer: copy,
  }
}

/** Drop one component's customisation and fall back to catalogue defaults. */
export function resetComponent(
  components: Record<string, ComponentCustomisation>,
  componentId: string,
  garment: Pick<Garment, 'components' | 'default_fabric' | 'default_color' | 'palette'>,
): Record<string, ComponentCustomisation> {
  const component = garment.components.find((candidate) => candidate.id === componentId)
  if (!component) return components
  return { ...components, [componentId]: defaultComponent(component, garment) }
}

/** Stage-space box for a layer, shared by the editor and the SVG renderer. */
export function layerBox(layer: DesignLayer): {
  cx: number
  cy: number
  width: number
  height: number
  rotation: number
} {
  return {
    cx: layer.transform.x * STAGE.width,
    cy: layer.transform.y * STAGE.height,
    width: layer.transform.width * STAGE.width,
    height: layer.transform.height * STAGE.height,
    rotation: layer.transform.rotation,
  }
}

export function moveLayerBy(
  layer: DesignLayer,
  dxStage: number,
  dyStage: number,
): DesignLayer {
  return normaliseLayer({
    ...layer,
    transform: {
      ...layer.transform,
      x: layer.transform.x + dxStage / STAGE.width,
      y: layer.transform.y + dyStage / STAGE.height,
    },
  })
}

export function scaleLayerBy(layer: DesignLayer, factor: number): DesignLayer {
  return normaliseLayer({
    ...layer,
    transform: {
      ...layer.transform,
      width: layer.transform.width * factor,
      height: layer.transform.height * factor,
    },
  })
}

export function exportFileName(designName: string): string {
  const slug = designName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'design'}-proof.png`
}

/** Payload sent to the API: layers stay separate and ordered. */
export function toSavePayload(
  components: Record<string, ComponentCustomisation>,
): Record<string, ComponentCustomisation> {
  const payload: Record<string, ComponentCustomisation> = {}
  Object.entries(components).forEach(([key, component]) => {
    payload[key] = {
      ...component,
      layers: orderedLayers(component).map((layer) => normaliseLayer(layer)),
      pattern_scale: component.pattern_scale ?? 1,
      pattern_rotation: component.pattern_rotation ?? 0,
      print_asset_id: component.pattern === 'custom_print' ? component.print_asset_id ?? null : null,
    }
  })
  return payload
}

export function hasUnsavedChanges(design: Design | undefined, name: string, components: Record<string, ComponentCustomisation>): boolean {
  if (!design) return false
  if (design.name !== name) return true
  return JSON.stringify(toSavePayload(design.components)) !== JSON.stringify(toSavePayload(components))
}

export function summaryOf(design: Design): string {
  const parts = Object.keys(design.components).length
  const layers = layerCount(design.components)
  return `${parts} part${parts === 1 ? '' : 's'} · ${layers} layer${layers === 1 ? '' : 's'}`
}
