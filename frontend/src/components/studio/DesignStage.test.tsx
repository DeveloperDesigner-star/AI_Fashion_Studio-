import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DesignStage } from '@/components/studio/DesignStage'
import { useDesignHistory } from '@/hooks/useDesignHistory'
import { layerFromAsset, mergeComponentDefaults, updateComponent } from '@/lib/designStudio'
import type { Garment, DesignLayer } from '@/lib/types'

vi.mock('@/hooks/useMediaUrl', () => ({
  useMediaUrl: (path: string | null) => ({ url: path ? 'blob:mock-artwork' : null, loading: false, error: null }),
}))

vi.mock('@/lib/fabricTexture', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ...actual,
    fabricPatternDataUrl: (pattern: string, colour: string) =>
      pattern === 'solid' ? null : `data:image/png;base64,${colour.replace('#', '')}`,
  }
})

const garment: Garment = {
  id: 'g1',
  slug: 'noor-shalwar-kameez-ivory-lattice',
  name: 'Ivory Lattice Shalwar Kameez',
  brand: 'AI Fashion Studio',
  gender: 'womenswear',
  category: 'shalwar_kameez',
  slot: 'dress',
  description: '',
  story: null,
  base_price_cents: 18900,
  currency: 'USD',
  default_fabric: 'cotton',
  default_color: '#f2ede2',
  season: 'all-season',
  styles: [],
  occasions: [],
  sizes: [],
  fit: 'regular',
  tags: [],
  silhouette: 'shalwar_kameez',
  palette: { primary: '#7a1f2b', secondary: '#f2e8d5', accent: '#c9a227' },
  is_featured: true,
  is_active: true,
  is_favorite: false,
  created_at: '2026-10-30T00:00:00',
  components: [
    { id: 'kameez_front', label: 'Kameez front', fabrics: ['silk'], allows_print: true, kind: 'front_panel' },
    { id: 'kameez_back', label: 'Kameez back', fabrics: ['silk'], allows_print: true, kind: 'back_panel' },
    { id: 'sleeves', label: 'Sleeves', fabrics: ['silk'], allows_print: true, kind: 'sleeve' },
    { id: 'neckline', label: 'Neckline', fabrics: ['silk'], allows_print: false, kind: 'neckline' },
    { id: 'collar', label: 'Collar', fabrics: ['silk'], allows_print: false, kind: 'collar' },
    { id: 'borders', label: 'Borders', fabrics: ['silk'], allows_print: false, kind: 'border' },
    { id: 'shalwar', label: 'Shalwar', fabrics: ['cotton'], allows_print: true, kind: 'trouser' },
    { id: 'dupatta', label: 'Dupatta', fabrics: ['chiffon'], allows_print: true, kind: 'dupatta' },
  ],
}

const layer: DesignLayer = layerFromAsset({ id: 'asset-1', original_filename: 'chest-motif.png' }, 0, {
  id: 'layer-test',
  transform: { x: 0.44, y: 0.32, width: 0.34, height: 0.3, rotation: 12, opacity: 0.9, flip_x: false },
})

function components() {
  let doc = mergeComponentDefaults(garment)
  doc = updateComponent(doc, 'kameez_front', {
    color: '#7a1f2b',
    pattern: 'floral',
    embroidery: 'gold_work',
    layers: [layer],
  })
  doc = updateComponent(doc, 'dupatta', { pattern: 'traditional', color: '#c9a227' })
  return doc
}

describe('DesignStage', () => {
  it('renders every garment piece, patterns and the artwork layer', () => {
    const { container } = render(
      <DesignStage garment={garment} components={components()} activeComponentId="kameez_front" />,
    )
    const titles = Array.from(container.querySelectorAll('title')).map((node) => node.textContent ?? '')
    expect(titles.some((title) => title.includes('Kameez front'))).toBe(true)
    expect(titles.some((title) => title.includes('Dupatta'))).toBe(true)
    const images = container.querySelectorAll('image')
    expect(images.length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll('pattern').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 240 320')
  })

  it('selects a component when its piece is pressed', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <DesignStage garment={garment} components={components()} onSelectComponent={onSelect} />,
    )
    const title = Array.from(container.querySelectorAll('title')).find((node) =>
      (node.textContent ?? '').includes('Kameez front'),
    )
    const path = title?.parentElement
    expect(path).not.toBeNull()
    fireEvent.pointerDown(path as Element)
    expect(onSelect).toHaveBeenCalledWith('kameez_front')
  })

  it('renders a preview without the editorial grain or selection box', () => {
    const { container } = render(
      <DesignStage
        garment={garment}
        components={components()}
        mode="preview"
        selectedLayerId={layer.id}
        activeComponentId="kameez_front"
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('rect[stroke-dasharray="4 3"]').length).toBe(0)
  })
})

describe('useDesignHistory', () => {
  it('records, undoes and redoes component edits', () => {
    const initial = mergeComponentDefaults(garment)
    const { result } = renderHook(() => useDesignHistory(initial))
    expect(result.current.canUndo).toBe(false)

    const changed = updateComponent(result.current.components, 'kameez_front', { color: '#000000' })
    act(() => result.current.commit(changed))
    expect(result.current.components.kameez_front.color).toBe('#000000')
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(result.current.components.kameez_front.color).toBe('#7a1f2b')
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.redo())
    expect(result.current.components.kameez_front.color).toBe('#000000')
  })

  it('supports transient drags with a single undo step', () => {
    const initial = mergeComponentDefaults(garment)
    const { result } = renderHook(() => useDesignHistory(initial))
    const snapshot = result.current.components
    const moved = updateComponent(snapshot, 'kameez_front', { color: '#111111' })
    act(() => result.current.record(snapshot))
    act(() => result.current.replace(moved))
    act(() => result.current.replace(updateComponent(moved, 'dupatta', { color: '#222222' })))
    expect(result.current.components.dupatta.color).toBe('#222222')
    act(() => result.current.undo())
    expect(result.current.components.dupatta.color).toBe('#7a1f2b')
  })
})
