import { describe, expect, it } from 'vitest'
import {
  addLayer,
  duplicateLayer,
  exportFileName,
  layerBox,
  layerFromAsset,
  mergeComponentDefaults,
  moveLayer,
  moveLayerBy,
  normaliseLayer,
  removeLayer,
  resetComponent,
  scaleLayerBy,
  toSavePayload,
  updateComponent,
  updateLayer,
} from '@/lib/designStudio'
import { KIND_GEOMETRY, STAGE, geometryFor, stagePieces } from '@/lib/designLayout'
import type { ComponentCustomisation, DesignLayer, GarmentComponent } from '@/lib/types'

const garment = {
  components: [
    { id: 'kameez_front', label: 'Kameez front', fabrics: ['silk', 'cotton'], allows_print: true, kind: 'front_panel' },
    { id: 'kameez_back', label: 'Kameez back', fabrics: ['silk'], allows_print: true, kind: 'back_panel' },
    { id: 'dupatta', label: 'Dupatta', fabrics: ['chiffon'], allows_print: true, kind: 'dupatta' },
    { id: 'collar', label: 'Collar', fabrics: ['silk'], allows_print: false, kind: 'collar' },
  ] satisfies GarmentComponent[],
  default_fabric: 'cotton',
  default_color: '#7a1f2b',
  palette: { primary: '#7a1f2b', secondary: '#f2e8d5', accent: '#c9a227' },
  name: 'Test kameez',
  slug: 'test-kameez',
}

const asset = { id: 'asset-1', original_filename: 'motif.png' }

function layer(overrides: Partial<DesignLayer> = {}): DesignLayer {
  return layerFromAsset(asset, 0, overrides)
}

function baseComponents(): Record<string, ComponentCustomisation> {
  return mergeComponentDefaults(garment)
}

describe('design studio document', () => {
  it('builds defaults per component and respects offered fabrics', () => {
    const components = baseComponents()
    expect(components.kameez_front.fabric).toBe('cotton')
    expect(components.collar.fabric).toBe('silk')
    expect(components.kameez_back.fabric).toBe('silk')
    expect(components.dupatta.color).toBe('#7a1f2b')
    expect(components.kameez_front.layers).toEqual([])
  })

  it('merges saved layers and ignores components retired from the garment', () => {
    const saved = {
      kameez_front: {
        color: '#112233',
        fabric: 'silk',
        pattern: 'floral',
        embroidery: 'gold_work',
        layers: [layer({ name: 'Chest motif' })],
        pattern_scale: 1.4,
        pattern_rotation: 20,
      },
      retired_component: {
        color: '#ffffff',
        fabric: 'cotton',
        pattern: 'solid',
        embroidery: 'none',
      },
    }
    const components = mergeComponentDefaults(garment, saved)
    expect(components.kameez_front.color).toBe('#112233')
    expect(components.kameez_front.layers).toHaveLength(1)
    expect(components.kameez_front.pattern_scale).toBe(1.4)
    expect(components).not.toHaveProperty('retired_component')
    expect(components.collar.layers).toEqual([])
  })

  it('normalises hostile transforms and crops', () => {
    const normalised = normaliseLayer({
      ...layer(),
      transform: { ...layer().transform, x: 9, width: 0, rotation: -900, opacity: 5 },
      crop: { x: 0.9, y: 0.9, width: 0.9, height: 0.9 },
    })
    expect(normalised.transform.x).toBe(2)
    expect(normalised.transform.width).toBe(0.03)
    expect(normalised.transform.rotation).toBe(-360)
    expect(normalised.transform.opacity).toBe(1)
    expect(normalised.crop.x).toBeCloseTo(0.1)
    expect(normalised.crop.width).toBe(0.9)
  })

  it('adds, edits, reorders and removes layers without merging them', () => {
    let components = baseComponents()
    const first = layer({ name: 'First' })
    const second = layer({ name: 'Second' })
    components = addLayer(components, 'kameez_front', first)
    components = addLayer(components, 'kameez_front', second)
    expect(components.kameez_front.layers).toHaveLength(2)
    const stored = components.kameez_front.layers ?? []
    expect(stored[1].z_index).toBeGreaterThan(stored[0].z_index)

    components = updateLayer(components, 'kameez_front', first.id, {
      transform: { ...first.transform, rotation: 30 },
    })
    const edited = components.kameez_front.layers?.find((item) => item.id === first.id)
    expect(edited?.transform.rotation).toBe(30)

    components = moveLayer(components, 'kameez_front', second.id, 'down')
    const ordered = [...(components.kameez_front.layers ?? [])].sort(
      (a, b) => a.z_index - b.z_index,
    )
    expect(ordered[0].name).toBe('Second')
    expect(ordered.map((item) => item.z_index)).toEqual([0, 1])

    components = removeLayer(components, 'kameez_front', first.id)
    expect(components.kameez_front.layers).toHaveLength(1)
  })

  it('caps a component at eight layers and duplicates independently', () => {
    let components = baseComponents()
    for (let index = 0; index < 8; index += 1) {
      components = addLayer(components, 'kameez_front', layer({ name: `Layer ${index}` }))
    }
    const before = components.kameez_front.layers?.length
    components = addLayer(components, 'kameez_front', layer({ name: 'Overflow' }))
    expect(components.kameez_front.layers?.length).toBe(before)
    expect(before).toBe(8)

    const source = components.kameez_front.layers?.[0] as DesignLayer
    const simple = baseComponents()
    const withOne = addLayer(simple, 'kameez_front', source)
    const duplicate = duplicateLayer(withOne, 'kameez_front', source.id)
    expect(duplicate.layer?.id).not.toBe(source.id)
    expect(duplicate.components.kameez_front.layers).toHaveLength(2)
    expect(duplicate.layer?.transform.x).toBeGreaterThan(source.transform.x)
  })

  it('moves and scales in stage coordinates', () => {
    const original = layer()
    const moved = moveLayerBy(original, STAGE.width * 0.1, STAGE.height * 0.05)
    expect(moved.transform.x).toBeCloseTo(original.transform.x + 0.1)
    expect(moved.transform.y).toBeCloseTo(original.transform.y + 0.05)
    const scaled = scaleLayerBy(original, 2)
    expect(scaled.transform.width).toBeCloseTo(original.transform.width * 2)
    const box = layerBox(moved)
    expect(box.cx).toBeCloseTo(moved.transform.x * STAGE.width)
    expect(box.cy).toBeCloseTo(moved.transform.y * STAGE.height)
  })

  it('resets one component and leaves the others alone', () => {
    let components = baseComponents()
    components = updateComponent(components, 'kameez_front', { color: '#000000' })
    components = updateComponent(components, 'dupatta', { color: '#eeeeee' })
    components = resetComponent(components, 'kameez_front', garment)
    expect(components.kameez_front.color).toBe('#7a1f2b')
    expect(components.kameez_front.pattern).toBe('solid')
    expect(components.dupatta.color).toBe('#eeeeee')
  })

  it('serialises layers sorted, private artwork only when custom print is used', () => {
    let components = baseComponents()
    const top = layer({ name: 'Top', z_index: 5 })
    const bottom = layer({ name: 'Bottom', z_index: 1 })
    components = updateComponent(components, 'kameez_front', {
      layers: [top, bottom],
      print_asset_id: 'asset-1',
      pattern: 'floral',
    })
    const payload = toSavePayload(components)
    expect(payload.kameez_front.layers?.map((item) => item.name)).toEqual(['Bottom', 'Top'])
    expect(payload.kameez_front.print_asset_id).toBeNull()

    components = updateComponent(components, 'kameez_front', { pattern: 'custom_print' })
    expect(toSavePayload(components).kameez_front.print_asset_id).toBe('asset-1')
  })

  it('creates safe export filenames', () => {
    expect(exportFileName('Noor Shalwar Kameez — Ivory / Lattice')).toBe(
      'noor-shalwar-kameez-ivory-lattice-proof.png',
    )
    expect(exportFileName('   ')).toBe('design-proof.png')
  })
})

describe('stage layout', () => {
  it('paints the dupatta and back panel behind the front panel', () => {
    const pieces = stagePieces(garment)
    const ids = pieces.map((piece) => piece.component.id)
    expect(ids.indexOf('dupatta')).toBeLessThan(ids.indexOf('kameez_front'))
    expect(ids.indexOf('kameez_back')).toBeLessThan(ids.indexOf('kameez_front'))
    expect(ids.indexOf('collar')).toBeGreaterThan(ids.indexOf('kameez_front'))
  })

  it('falls back to the generic piece for unknown kinds', () => {
    expect(geometryFor('unknown_kind')).toBe(KIND_GEOMETRY.generic)
    expect(geometryFor(undefined)).toBe(KIND_GEOMETRY.generic)
    expect(geometryFor('trouser').paths).toHaveLength(2)
  })
})
