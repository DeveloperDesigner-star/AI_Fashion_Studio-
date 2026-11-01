import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { toast } from '@/stores/toastStore'
import { useDesignHistory } from '@/hooks/useDesignHistory'
import { ComponentPanel } from '@/components/studio/ComponentPanel'
import { LayerPanel } from '@/components/studio/LayerPanel'
import { DesignStage } from '@/components/studio/DesignStage'
import type { StageMode } from '@/components/studio/DesignStage'
import { Button, LinkButton } from '@/components/ui/Button'
import { Badge, ErrorState, LoadingBlock, Notice } from '@/components/ui/Primitives'
import { STAGE } from '@/lib/designLayout'
import {
  addLayer,
  defaultComponent,
  duplicateLayer,
  exportFileName,
  layerFromAsset,
  mergeComponentDefaults,
  moveLayer,
  moveLayerBy,
  nextZIndex,
  removeLayer,
  scaleLayerBy,
  toSavePayload,
  updateComponent,
  updateLayer,
  MAX_LAYERS_PER_COMPONENT,
} from '@/lib/designStudio'
import { downloadBlob, renderStagePng } from '@/lib/stageExport'
import { formatDate, titleCase } from '@/lib/format'
import { useAuthStore } from '@/stores/authStore'
import type {
  ComponentCustomisation,
  Design,
  DesignLayer,
  DerivedAsset,
  MediaAsset,
} from '@/lib/types'

interface GestureState {
  mode: 'move' | 'pinch'
  layerId: string
  baseLayer: DesignLayer
  baseComponents: Record<string, ComponentCustomisation>
  pointers: Map<number, { x: number; y: number }>
  startDistance: number
  startAngle: number
  startPoint: { x: number; y: number }
  recorded: boolean
}

function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pointerAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

export function DesignEditorPage() {
  const { designId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const designQuery = useQuery({
    queryKey: qk.design(designId),
    queryFn: () => fetchers.design(designId),
    enabled: Boolean(designId && user),
  })
  const libraryQuery = useQuery({
    queryKey: qk.designLibrary,
    queryFn: fetchers.designLibrary,
  })
  const mediaQuery = useQuery({
    queryKey: qk.media,
    queryFn: fetchers.media,
    enabled: Boolean(user),
  })

  const design = designQuery.data
  const garment = design?.garment ?? null

  const history = useDesignHistory({})
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [revision, setRevision] = useState(1)
  const [baseline, setBaseline] = useState('')
  const [activeComponentId, setActiveComponentId] = useState('')
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'components' | 'layers'>('components')

  const stageRef = useRef<SVGSVGElement>(null)
  const loadedDesignRef = useRef<string | null>(null)
  const gestureRef = useRef<GestureState | null>(null)

  // ---------------------------------------------------------------- load state
  useEffect(() => {
    if (!design || !garment) return
    if (loadedDesignRef.current === design.id) return
    loadedDesignRef.current = design.id
    const merged = mergeComponentDefaults(garment, design.components)
    history.reset(merged)
    setBaseline(JSON.stringify(toSavePayload(merged)))
    setName(design.name)
    setNotes(design.notes ?? '')
    setRevision(design.revision ?? 1)
    setActiveComponentId(garment.components[0]?.id ?? '')
    setSelectedLayerId(null)
  }, [design, garment, history])

  const components = history.components
  const activeComponent = components[activeComponentId]
  const activeDefinition = garment?.components.find(
    (component) => component.id === activeComponentId,
  )
  const selectedLayer = activeComponent?.layers?.find((layer) => layer.id === selectedLayerId)
  const dirty = useMemo(() => {
    if (!design) return false
    if (name !== design.name) return true
    if (notes !== (design.notes ?? '')) return true
    return baseline !== JSON.stringify(toSavePayload(components))
  }, [baseline, components, design, name, notes])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['designs'] })
    if (designId) queryClient.invalidateQueries({ queryKey: qk.design(designId) })
  }, [designId, queryClient])

  const saveDesign = useCallback(async (): Promise<Design | null> => {
    if (!design) return null
    setSaving(true)
    try {
      const payload = toSavePayload(components)
      const saved = await api.patch<Design>(`/designs/${design.id}`, {
        name: name.trim() || `${garment?.name ?? 'Design'} study`,
        components: payload,
        notes,
        revision,
      })
      setRevision(saved.revision)
      setBaseline(JSON.stringify(toSavePayload(saved.components as Record<string, ComponentCustomisation>)))
      setName(saved.name)
      setConflict(false)
      invalidate()
      toast.success('Design saved', 'Every component and layer is stored for the next session.')
      return saved
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true)
        toast.error('Save conflict', 'This design changed in another tab. Reload before saving.')
      } else {
        toast.error(
          'Could not save the design',
          error instanceof ApiError ? error.message : 'Try again in a moment.',
        )
      }
      return null
    } finally {
      setSaving(false)
    }
  }, [components, design, garment?.name, invalidate, name, notes, revision])

  // ------------------------------------------------------------- layer helpers
  const commitLayerPatch = useCallback(
    (patch: Partial<DesignLayer>) => {
      if (!activeComponentId || !selectedLayerId) return
      history.commit(
        updateLayer(history.components, activeComponentId, selectedLayerId, patch),
      )
    },
    [activeComponentId, history, selectedLayerId],
  )

  const updateTransform = useCallback(
    (patch: Partial<DesignLayer['transform']>) => {
      if (!selectedLayer) return
      commitLayerPatch({ transform: { ...selectedLayer.transform, ...patch } })
    },
    [commitLayerPatch, selectedLayer],
  )

  const updateCrop = useCallback(
    (patch: Partial<DesignLayer['crop']>) => {
      if (!selectedLayer) return
      commitLayerPatch({ crop: { ...selectedLayer.crop, ...patch } })
    },
    [commitLayerPatch, selectedLayer],
  )

  const updateAdjustments = useCallback(
    (patch: Partial<DesignLayer['adjustments']>) => {
      if (!selectedLayer) return
      commitLayerPatch({ adjustments: { ...selectedLayer.adjustments, ...patch } })
    },
    [commitLayerPatch, selectedLayer],
  )

  const handleLayerAction = useCallback(
    (action: 'up' | 'down' | 'duplicate' | 'remove' | 'reset-transform') => {
      if (!activeComponentId || !selectedLayerId) return
      if (action === 'up' || action === 'down') {
        history.commit(moveLayer(history.components, activeComponentId, selectedLayerId, action))
        return
      }
      if (action === 'duplicate') {
        const result = duplicateLayer(history.components, activeComponentId, selectedLayerId)
        if (!result.layer) {
          toast.error('Layer limit reached', `A component can hold ${MAX_LAYERS_PER_COMPONENT} layers.`)
          return
        }
        history.commit(result.components)
        setSelectedLayerId(result.layer.id)
        return
      }
      if (action === 'remove') {
        history.commit(removeLayer(history.components, activeComponentId, selectedLayerId))
        setSelectedLayerId(null)
        return
      }
      if (action === 'reset-transform' && selectedLayer) {
        commitLayerPatch({
          transform: {
            ...selectedLayer.transform,
            x: 0.5,
            y: 0.42,
            width: 0.55,
            height: 0.5,
            rotation: 0,
            opacity: 1,
            flip_x: false,
          },
        })
      }
    },
    [activeComponentId, commitLayerPatch, history, selectedLayer, selectedLayerId],
  )

  const handleAddAsset = useCallback(
    (asset: MediaAsset) => {
      if (!activeDefinition || !activeComponentId) return
      if (!activeDefinition.allows_print) {
        toast.error('This piece does not take artwork', `${activeDefinition.label} is a structural piece.`)
        return
      }
      if ((components[activeComponentId]?.layers?.length ?? 0) >= MAX_LAYERS_PER_COMPONENT) {
        toast.error('Layer limit reached', `A component can hold ${MAX_LAYERS_PER_COMPONENT} layers.`)
        return
      }
      const layer = layerFromAsset(
        asset,
        nextZIndex(components[activeComponentId]),
      )
      history.commit(addLayer(components, activeComponentId, layer))
      setSelectedLayerId(layer.id)
      toast.success('Artwork added', `${layer.name} is now a separate layer on ${activeDefinition.label}.`)
    },
    [activeComponentId, activeDefinition, components, history],
  )

  const handleUseAsPattern = useCallback(
    (asset: MediaAsset) => {
      if (!activeDefinition || !activeComponentId) return
      if (!activeDefinition.allows_print) {
        toast.error('This piece does not take a print')
        return
      }
      history.commit(
        updateComponent(components, activeComponentId, {
          pattern: 'custom_print',
          print_asset_id: asset.id,
        }),
      )
      toast.success('Pattern applied', 'The uploaded artwork now tiles across this piece.')
    },
    [activeComponentId, activeDefinition, components, history],
  )

  // ------------------------------------------------------------------ uploads
  const upload = useCallback(
    async (file: File, kind: 'print' | 'reference') => {
      if (!activeDefinition) return
      if (!activeDefinition.allows_print) {
        toast.error('This piece does not take artwork')
        return
      }
      setUploading(true)
      try {
        const asset = await api.upload<MediaAsset>('/media/upload', file, { kind })
        queryClient.invalidateQueries({ queryKey: qk.media })
        handleAddAsset(asset)
      } catch (error) {
        toast.error(
          'Upload failed',
          error instanceof ApiError ? error.message : 'Check the file and try again.',
        )
      } finally {
        setUploading(false)
      }
    },
    [activeDefinition, handleAddAsset, queryClient],
  )

  const removeBackground = useCallback(async () => {
    if (!selectedLayer) return
    setBusy(true)
    try {
      const derived = await api.post<DerivedAsset>(
        `/media/${selectedLayer.asset_id}/remove-background`,
      )
      queryClient.invalidateQueries({ queryKey: qk.media })
      if (activeComponentId) {
        history.commit(
          updateLayer(history.components, activeComponentId, selectedLayer.id, {
            asset_id: derived.asset.id,
            name: `${selectedLayer.name} cut-out`.slice(0, 60),
          }),
        )
      }
      toast.success(
        'Background removed',
        'A transparent PNG was generated on the server. The original is untouched.',
      )
    } catch (error) {
      toast.error(
        'Could not remove the background',
        error instanceof ApiError ? error.message : 'Try a photo with a cleaner background.',
      )
    } finally {
      setBusy(false)
    }
  }, [activeComponentId, history, queryClient, selectedLayer])

  // ------------------------------------------------------------------ gestures
  const stagePoint = useCallback((event: ReactPointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return { x: 0, y: 0 }
    return {
      x: ((event.clientX - rect.left) / rect.width) * STAGE.width,
      y: ((event.clientY - rect.top) / rect.height) * STAGE.height,
    }
  }, [])

  const onLayerPointerDown = useCallback(
    (event: ReactPointerEvent<SVGGElement>, componentId: string, layer: DesignLayer) => {
      if (gestureRef.current?.mode === 'pinch') return
      if (activeComponentId !== componentId) setActiveComponentId(componentId)
      if (!selectedLayerId || selectedLayerId !== layer.id) {
        setSelectedLayerId(layer.id)
      }
      if (layer.locked) return
      const point = stagePoint(event)
      event.currentTarget.setPointerCapture?.(event.pointerId)
      gestureRef.current = {
        mode: 'move',
        layerId: layer.id,
        baseLayer: layer,
        baseComponents: history.components,
        pointers: new Map([[event.pointerId, point]]),
        startDistance: 0,
        startAngle: 0,
        startPoint: point,
        recorded: false,
      }
    },
    [activeComponentId, history.components, selectedLayerId, stagePoint],
  )

  const onStagePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const gesture = gestureRef.current
      if (!gesture) return
      if (gesture.pointers.has(event.pointerId)) {
        gesture.pointers.set(event.pointerId, stagePoint(event))
      }

      if (!gesture.recorded) {
        history.record(gesture.baseComponents)
        gesture.recorded = true
      }

      if (gesture.mode === 'pinch' && gesture.pointers.size >= 2) {
        const [first, second] = Array.from(gesture.pointers.values())
        const distance = Math.max(4, pointerDistance(first, second))
        const angle = pointerAngle(first, second)
        const ratio = distance / Math.max(4, gesture.startDistance)
        const rotation = gesture.baseLayer.transform.rotation + (angle - gesture.startAngle)
        const scaled = scaleLayerBy(gesture.baseLayer, ratio)
        history.replace(
          updateLayer(history.components, activeComponentId, gesture.layerId, {
            transform: { ...scaled.transform, rotation },
          }),
        )
        return
      }

      if (!gesture.pointers.has(event.pointerId)) return
      const point = stagePoint(event)
      const dx = point.x - gesture.startPoint.x
      const dy = point.y - gesture.startPoint.y
      if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return
      history.replace(
        updateLayer(
          history.components,
          activeComponentId,
          gesture.layerId,
          { transform: moveLayerBy(gesture.baseLayer, dx, dy).transform },
        ),
      )
    },
    [activeComponentId, history, stagePoint],
  )

  const endGesture = useCallback(() => {
    gestureRef.current = null
  }, [])

  // Pinch begins when a second pointer lands on the stage.
  const onStagePointerDownCapture = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const gesture = gestureRef.current
      if (!gesture || gesture.mode === 'pinch') return
      if (!activeComponentId) return
      const layer = history.components[activeComponentId]?.layers?.find(
        (candidate) => candidate.id === gesture.layerId,
      )
      if (!layer || layer.locked) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      const point = stagePoint(event)
      gesture.pointers.set(event.pointerId, point)
      if (gesture.pointers.size === 2) {
        const [first, second] = Array.from(gesture.pointers.values())
        gesture.mode = 'pinch'
        gesture.startDistance = Math.max(4, pointerDistance(first, second))
        gesture.startAngle = pointerAngle(first, second)
        gesture.baseLayer = layer
        gesture.baseComponents = history.components
        if (!gesture.recorded) {
          history.record(gesture.baseComponents)
          gesture.recorded = true
        }
      }
    },
    [activeComponentId, history, stagePoint],
  )

  // ---------------------------------------------------------------- shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      if (editing || preview) return

      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveDesign()
        return
      }
      if (!selectedLayer || !activeComponentId) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        history.commit(removeLayer(history.components, activeComponentId, selectedLayer.id))
        setSelectedLayerId(null)
        return
      }
      const nudge = event.shiftKey ? 5 : 1
      const vectors: Record<string, [number, number]> = {
        ArrowLeft: [-nudge, 0],
        ArrowRight: [nudge, 0],
        ArrowUp: [0, -nudge],
        ArrowDown: [0, nudge],
      }
      const vector = vectors[event.key]
      if (vector) {
        event.preventDefault()
        history.commit(
          updateLayer(history.components, activeComponentId, selectedLayer.id, {
            transform: moveLayerBy(selectedLayer, vector[0], vector[1]).transform,
          }),
        )
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeComponentId, history, preview, saveDesign, selectedLayer])

  // ------------------------------------------------------------------ actions
  const duplicateDesign = useMutation({
    mutationFn: () => api.post<Design>(`/designs/${designId}/duplicate`),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ['designs'] })
      toast.success('Design duplicated', 'The copy opens with every layer independent.')
      navigate(`/editor/${copy.id}`)
    },
    onError: (error) =>
      toast.error('Could not duplicate', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const resetComponentMutation = useMutation({
    mutationFn: (componentId: string) =>
      api.delete<Design>(`/designs/${designId}/components/${componentId}`),
    onSuccess: (updated, componentId) => {
      setRevision(updated.revision)
      const component = garment?.components.find((candidate) => candidate.id === componentId)
      if (component && garment) {
        history.commit({
          ...components,
          [componentId]: defaultComponent(component, garment),
        })
      }
      queryClient.invalidateQueries({ queryKey: qk.design(designId) })
      toast.success('Component reset', 'The piece is back to the catalogue specification.')
    },
    onError: (error) =>
      toast.error('Could not reset', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const handleExport = useCallback(async () => {
    if (!design || !stageRef.current) return
    setExporting(true)
    try {
      if (dirty) {
        const saved = await saveDesign()
        if (!saved) return
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rendered = await renderStagePng(stageRef.current, { width: 1200, height: 1600 })
      const filename = exportFileName(name || design.name)
      downloadBlob(rendered.blob, filename)

      const file = new File([rendered.blob], filename, { type: 'image/png' })
      await api.upload<MediaAsset>(`/designs/${design.id}/proof`, file, {})
      queryClient.invalidateQueries({ queryKey: qk.design(design.id) })
      queryClient.invalidateQueries({ queryKey: qk.media })
      toast.success('Proof exported', 'The flattened PNG is stored on the design and stays separate from its layers.')
    } catch (error) {
      toast.error(
        'Export failed',
        error instanceof ApiError ? error.message : 'Try again after saving the design.',
      )
    } finally {
      setExporting(false)
    }
  }, [design, dirty, name, queryClient, saveDesign])

  if (!user) return null

  if (designQuery.isLoading) {
    return (
      <div className="shell py-16">
        <LoadingBlock label="Opening the design studio" />
      </div>
    )
  }

  if (designQuery.isError || !design) {
    return (
      <div className="shell py-16">
        <ErrorState
          title="Design could not be opened"
          message="It may have been deleted, or it belongs to another account."
          onRetry={() => designQuery.refetch()}
        />
      </div>
    )
  }

  if (!garment) {
    return (
      <div className="shell py-16">
        <Notice tone="warn" title="The garment is no longer available">
          This design references a garment that is not in the active catalogue. Its stored layers are
          safe, but there is nothing to edit.{' '}
          <Link to="/designs" className="underline">
            Back to designs
          </Link>
          .
        </Notice>
      </div>
    )
  }

  if (!baseline) {
    return (
      <div className="shell py-16">
        <LoadingBlock label="Preparing the studio" />
      </div>
    )
  }

  const stageMode: StageMode = exporting ? 'export' : preview ? 'preview' : 'edit'
  const media = (mediaQuery.data?.items ?? []).filter((asset) =>
    ['print', 'reference', 'clothing', 'photo'].includes(asset.kind),
  )
  const activeLayerCount = activeComponent?.layers?.length ?? 0

  return (
    <div className="min-h-screen bg-bone">
      <div className="border-b border-line bg-paper">
        <div className="shell flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/designs"
              className="shrink-0 text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted hover:text-ink"
            >
              ← Designs
            </Link>
            <div className="min-w-0">
              <input
                aria-label="Design name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={140}
                className="w-full max-w-md border-0 border-b border-transparent bg-transparent p-0 font-display text-xl leading-tight focus:border-ink focus:outline-none lg:text-2xl"
              />
              <p className="mt-0.5 truncate text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted">
                {garment.name} · {titleCase(garment.category)} · rev {revision} · saved{' '}
                {formatDate(design.updated_at)}
              </p>
            </div>
            {dirty && <Badge tone="gold">Unsaved</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={history.undo}
              disabled={!history.canUndo || preview}
              title="Undo (Ctrl/⌘ Z)"
            >
              Undo
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={history.redo}
              disabled={!history.canRedo || preview}
              title="Redo (Ctrl/⌘ Shift Z)"
            >
              Redo
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreview((value) => !value)}
              aria-pressed={preview}
            >
              {preview ? 'Back to editing' : 'Preview'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void saveDesign()}
              loading={saving}
              disabled={!dirty || conflict}
            >
              Save
            </Button>
            <Button size="sm" onClick={() => void handleExport()} loading={exporting}>
              Export proof
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    'This design has unsaved changes. Duplicate the last saved version anyway?',
                  )
                ) {
                  return
                }
                duplicateDesign.mutate()
              }}
              loading={duplicateDesign.isPending}
            >
              Duplicate
            </Button>
          </div>
        </div>
      </div>

      {conflict && (
        <div className="shell pt-3">
          <Notice tone="warn" title="Another tab saved this design">
            Reload to get the newest revision, or duplicate this design to keep your edits.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                loadedDesignRef.current = null
                setConflict(false)
                void designQuery.refetch()
              }}
            >
              Reload the design
            </button>
            .
          </Notice>
        </div>
      )}

      {preview ? (
        <div className="shell py-6">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="label-xs">Preview</p>
                <h1 className="font-display text-2xl">{name}</h1>
              </div>
              <Badge tone="olive">{activeLayerCount > 0 ? 'Layered' : 'Catalogue base'}</Badge>
            </div>
            <div className="mt-4 border border-line bg-paper p-3">
              <DesignStage
                garment={garment}
                components={components}
                mode={exporting ? 'export' : 'preview'}
                svgRef={stageRef}
                className="mx-auto h-[70vh] max-h-[720px] w-full"
              />
            </div>
            <p className="mt-3 text-center text-[0.625rem] uppercase tracking-[0.1em] text-ink-muted">
              Preview is rendered from the live layers — nothing is flattened until you export.
            </p>
          </div>
        </div>
      ) : (
        <div className="shell py-4">
          <div className="mb-3 flex gap-1.5 lg:hidden">
            <button
              type="button"
              onClick={() => setMobilePanel('components')}
              aria-pressed={mobilePanel === 'components'}
              className={`flex-1 border px-3 py-2 text-[0.625rem] uppercase tracking-[0.1em] ${
                mobilePanel === 'components' ? 'border-ink bg-ink text-paper' : 'border-line bg-paper'
              }`}
            >
              Pieces
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel('layers')}
              aria-pressed={mobilePanel === 'layers'}
              className={`flex-1 border px-3 py-2 text-[0.625rem] uppercase tracking-[0.1em] ${
                mobilePanel === 'layers' ? 'border-ink bg-ink text-paper' : 'border-line bg-paper'
              }`}
            >
              Layers ({activeLayerCount})
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[17rem_minmax(0,1fr)_20rem]">
            <aside
              className={`${
                mobilePanel === 'components' ? 'block' : 'hidden'
              } h-[70vh] border border-line bg-paper lg:block lg:h-[calc(100vh-9rem)]`}
            >
              <ComponentPanel
                garment={garment}
                components={components}
                activeComponentId={activeComponentId}
                library={libraryQuery.data}
                onSelect={(componentId) => {
                  setActiveComponentId(componentId)
                  setSelectedLayerId(null)
                  setMobilePanel('components')
                }}
                onUpdate={(componentId, patch) =>
                  history.commit(updateComponent(components, componentId, patch))
                }
                onReset={(componentId) => resetComponentMutation.mutate(componentId)}
              />
            </aside>

            <main className="order-first lg:order-none">
              <div className="relative border border-line bg-paper">
                <DesignStage
                  garment={garment}
                  components={components}
                  activeComponentId={activeComponentId}
                  selectedLayerId={selectedLayerId}
                  mode={stageMode}
                  svgRef={stageRef}
                  className="mx-auto h-[62vh] max-h-[680px] w-full lg:h-[calc(100vh-11rem)]"
                  onSelectComponent={(componentId) => {
                    setActiveComponentId(componentId)
                    setSelectedLayerId(null)
                    setMobilePanel('components')
                  }}
                  onSelectLayer={(layerId) => setSelectedLayerId(layerId)}
                  onLayerPointerDown={onLayerPointerDown}
                  onPointerMove={onStagePointerMove}
                  onPointerUp={endGesture}
                  onPointerCancel={endGesture}
                  onPointerDownCapture={onStagePointerDownCapture}
                />
                {activeDefinition && (
                  <div className="pointer-events-none absolute left-3 top-3 border border-line bg-paper/90 px-2 py-1">
                    <span className="text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">
                      Editing
                    </span>
                    <span className="ml-2 text-[0.6875rem]">{activeDefinition.label}</span>
                  </div>
                )}
                <div className="pointer-events-none absolute bottom-3 left-3 text-[0.5rem] uppercase tracking-[0.12em] text-ink-muted">
                  Drag to move · pinch to scale/rotate · wheel-free, buttons in the panel
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.5625rem] uppercase tracking-[0.1em] text-ink-muted">
                  {Object.keys(components).length} components ·{' '}
                  {Object.values(components).reduce(
                    (total, component) => total + (component.layers?.length ?? 0),
                    0,
                  )}{' '}
                  layers · positions stored per component
                </p>
                <div className="flex gap-1.5">
                  <LinkButton to={`/garment/${garment.slug}?design=${design.id}`} size="sm" variant="ghost">
                    Quick edit
                  </LinkButton>
                  <LinkButton to="/fitting-room" size="sm" variant="ghost">
                    Fitting room
                  </LinkButton>
                </div>
              </div>
            </main>

            <aside
              className={`${
                mobilePanel === 'layers' ? 'block' : 'hidden'
              } h-[70vh] border border-line bg-paper lg:block lg:h-[calc(100vh-9rem)]`}
            >
              <LayerPanel
                component={activeComponent}
                componentLabel={activeDefinition?.label ?? 'Component'}
                layers={activeComponent?.layers ?? []}
                selectedLayerId={selectedLayerId}
                media={media}
                library={libraryQuery.data}
                maxLayers={MAX_LAYERS_PER_COMPONENT}
                uploading={uploading}
                busy={busy}
                onSelectLayer={(layerId) => setSelectedLayerId(layerId)}
                onUpload={(file, kind) => void upload(file, kind)}
                onAddAsset={handleAddAsset}
                onUseAsPattern={handleUseAsPattern}
                onUpdateLayer={commitLayerPatch}
                onUpdateLayerById={(layerId, patch) => {
                  if (!activeComponentId) return
                  history.commit(
                    updateLayer(components, activeComponentId, layerId, patch),
                  )
                }}
                onUpdateTransform={updateTransform}
                onUpdateCrop={updateCrop}
                onUpdateAdjustments={updateAdjustments}
                onAction={handleLayerAction}
                onRemoveBackground={() => void removeBackground()}
              />
            </aside>
          </div>
        </div>
      )}

      <div className="shell pb-10">
        <label className="block max-w-3xl space-y-1.5">
          <span className="label-xs">Studio notes (optional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 2000))}
            rows={2}
            placeholder="Fitting notes, fabric callouts, who this design is for…"
            className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
        </label>
      </div>
    </div>
  )
}
