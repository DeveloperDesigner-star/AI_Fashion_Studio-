import { useId, useMemo } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useMediaUrl } from '@/hooks/useMediaUrl'
import { fabricPatternDataUrl } from '@/lib/fabricTexture'
import { STAGE, STAGE_VIEWBOX, stagePieces } from '@/lib/designLayout'
import { layerBox, orderedLayers } from '@/lib/designStudio'
import type { ComponentCustomisation, DesignLayer, Garment } from '@/lib/types'

export type StageMode = 'edit' | 'preview' | 'export'

interface DesignStageProps {
  garment: Garment
  components: Record<string, ComponentCustomisation>
  activeComponentId?: string | null
  selectedLayerId?: string | null
  mode?: StageMode
  className?: string
  svgRef?: RefObject<SVGSVGElement | null>
  onSelectComponent?: (componentId: string) => void
  onSelectLayer?: (layerId: string | null) => void
  onLayerPointerDown?: (
    event: ReactPointerEvent<SVGGElement>,
    componentId: string,
    layer: DesignLayer,
  ) => void
  onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void
  onPointerDownCapture?: (event: ReactPointerEvent<SVGSVGElement>) => void
  onPointerUp?: (event: ReactPointerEvent<SVGSVGElement>) => void
  onPointerCancel?: (event: ReactPointerEvent<SVGSVGElement>) => void
}

const OUTLINE = '#15130f'
const pieceLine = {
  stroke: OUTLINE,
  strokeOpacity: 0.22,
  strokeWidth: 1.1,
  strokeLinejoin: 'round' as const,
}

function mediaPath(assetId: string): string {
  return `/api/v1/media/${assetId}/content`
}

function LayerArtwork({
  layer,
  clipId,
  filterId,
  interactive,
  onPointerDown,
}: {
  layer: DesignLayer
  clipId: string
  filterId: string
  interactive: boolean
  onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void
}) {
  const { url } = useMediaUrl(mediaPath(layer.asset_id))
  const box = layerBox(layer)
  const fullWidth = box.width / layer.crop.width
  const fullHeight = box.height / layer.crop.height
  const x = -box.width / 2 - layer.crop.x * fullWidth
  const y = -box.height / 2 - layer.crop.y * fullHeight

  if (!url) return null

  return (
    <g
      transform={`translate(${box.cx} ${box.cy}) rotate(${box.rotation}) scale(${layer.transform.flip_x ? -1 : 1} 1)`}
      opacity={layer.transform.opacity}
      style={{ mixBlendMode: layer.blend_mode, pointerEvents: interactive ? 'auto' : 'none' }}
      clipPath={`url(#${clipId})`}
      onPointerDown={onPointerDown}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? `${layer.name} layer` : undefined}
    >
      <image
        href={url}
        x={x}
        y={y}
        width={fullWidth}
        height={fullHeight}
        preserveAspectRatio="none"
        filter={`url(#${filterId})`}
      />
    </g>
  )
}

function PatternFill({
  componentId,
  component,
  patternId,
}: {
  componentId: string
  component: ComponentCustomisation
  patternId: string
}) {
  const printAssetId =
    component.pattern === 'custom_print' && component.print_asset_id
      ? component.print_asset_id
      : null
  const { url: printUrl } = useMediaUrl(printAssetId ? mediaPath(printAssetId) : null)
  const procedural = useMemo(
    () =>
      component.pattern === 'custom_print'
        ? null
        : fabricPatternDataUrl(component.pattern, component.color),
    [component.pattern, component.color],
  )
  const href = printUrl ?? procedural
  const scale = component.pattern_scale ?? 1
  const rotation = component.pattern_rotation ?? 0

  if (!href) return null

  return (
    <pattern
      id={patternId}
      patternUnits="userSpaceOnUse"
      width={78}
      height={78}
      patternTransform={`rotate(${rotation}) scale(${scale})`}
    >
      <image href={href} width={78} height={78} preserveAspectRatio="none" />
      <title>{`${componentId} pattern`}</title>
    </pattern>
  )
}

function EmbroideryFill({ id, tone }: { id: string; tone: string }) {
  const url = useMemo(() => fabricPatternDataUrl('embroidered', tone), [tone])
  if (!url) return null
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={64} height={64}>
      <image href={url} width={64} height={64} preserveAspectRatio="none" />
    </pattern>
  )
}

function LayerFilter({ id, layer }: { id: string; layer: DesignLayer }) {
  const { brightness, contrast, saturation, hue } = layer.adjustments
  return (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values={String(saturation)} />
      <feColorMatrix type="hueRotate" values={String(hue)} />
      <feComponentTransfer>
        <feFuncR type="linear" slope={brightness} />
        <feFuncG type="linear" slope={brightness} />
        <feFuncB type="linear" slope={brightness} />
      </feComponentTransfer>
      <feComponentTransfer>
        <feFuncR type="linear" slope={contrast} intercept={(1 - contrast) / 2} />
        <feFuncG type="linear" slope={contrast} intercept={(1 - contrast) / 2} />
        <feFuncB type="linear" slope={contrast} intercept={(1 - contrast) / 2} />
      </feComponentTransfer>
    </filter>
  )
}

export function DesignStage({
  garment,
  components,
  activeComponentId = null,
  selectedLayerId = null,
  mode = 'edit',
  className,
  svgRef,
  onSelectComponent,
  onSelectLayer,
  onLayerPointerDown,
  onPointerMove,
  onPointerDownCapture,
  onPointerUp,
  onPointerCancel,
}: DesignStageProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const pieces = useMemo(() => stagePieces(garment), [garment])
  const interactive = mode === 'edit'
  const isExport = mode === 'export' || mode === 'preview'

  return (
    <svg
      ref={svgRef}
      viewBox={STAGE_VIEWBOX}
      className={className}
      role="img"
      aria-label={`${garment.name} design canvas`}
      xmlns="http://www.w3.org/2000/svg"
      onPointerMove={onPointerMove}
      onPointerDownCapture={onPointerDownCapture}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelectLayer?.(null)
      }}
      style={{ touchAction: 'none' }}
    >
      <defs>
        {pieces.map(({ component }) => (
          <PatternFill
            key={`pattern-${component.id}`}
            componentId={component.id}
            component={components[component.id] ?? { color: '#1f1d1a', fabric: 'cotton', pattern: 'solid', embroidery: 'none' }}
            patternId={`${uid}-pattern-${component.id}`}
          />
        ))}
        {pieces.map(({ component }) => (
          <EmbroideryFill
            key={`embroidery-${component.id}`}
            id={`${uid}-embroidery-${component.id}`}
            tone={components[component.id]?.embroidery === 'gold_work' ? '#c9a227' : '#d9c9a3'}
          />
        ))}
        {pieces.flatMap(({ component, geometry }) =>
          orderedLayers(components[component.id]).map((layer) => {
            const box = layerBox(layer)
            return (
              <g key={`defs-${component.id}-${layer.id}`}>
                <clipPath id={`${uid}-clip-${component.id}-${layer.id}`}>
                  <rect
                    x={-box.width / 2}
                    y={-box.height / 2}
                    width={box.width}
                    height={box.height}
                  />
                </clipPath>
                {geometry.paths.map((_, pathIndex) => (
                  <clipPath key={pathIndex} id={`${uid}-piece-${component.id}-${pathIndex}`}>
                    <path d={geometry.paths[pathIndex]} />
                  </clipPath>
                ))}
                <LayerFilter id={`${uid}-filter-${component.id}-${layer.id}`} layer={layer} />
              </g>
            )
          }),
        )}
        <pattern id={`${uid}-grain`} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6L6 0" stroke="#15130f" strokeOpacity="0.05" strokeWidth="1" />
        </pattern>
      </defs>

      <rect
        width={STAGE.width}
        height={STAGE.height}
        fill="transparent"
        onPointerDown={interactive ? () => onSelectLayer?.(null) : undefined}
      />
      {!isExport && <rect width={STAGE.width} height={STAGE.height} fill={`url(#${uid}-grain)`} />}
      {!isExport && (
        <>
          <ellipse
            cx={STAGE.width / 2}
            cy={STAGE.height - 20}
            rx={86}
            ry={12}
            fill="#15130f"
            opacity={0.06}
          />
          <rect
            x={44}
            y={30}
            width={STAGE.width - 88}
            height={STAGE.height - 54}
            fill="none"
            stroke="#15130f"
            strokeOpacity={0.08}
            strokeDasharray="4 6"
          />
        </>
      )}

      {pieces.map(({ component, geometry }) => {
        const custom = components[component.id]
        if (!custom) return null
        const layers = orderedLayers(custom).filter((layer) => layer.visible)
        const isActive = activeComponentId === component.id
        const dimmed = interactive && activeComponentId !== null && !isActive
        const baseOpacity = (geometry.opacity ?? 1) * (dimmed ? 0.4 : 1)

        return (
          <g key={component.id} opacity={baseOpacity}>
            {geometry.paths.map((path, pathIndex) => {
              const pieceClipId = `${uid}-piece-${component.id}-${pathIndex}`
              return (
                <g key={pathIndex}>
                  <path
                    d={path}
                    fill={custom.color}
                    fillRule={geometry.evenOdd ? 'evenodd' : 'nonzero'}
                    {...pieceLine}
                    onPointerDown={
                      interactive && onSelectComponent
                        ? (event) => {
                            event.stopPropagation()
                            onSelectComponent(component.id)
                          }
                        : undefined
                    }
                    style={{ cursor: interactive ? 'pointer' : 'default' }}
                  >
                    <title>{`${component.label} — ${component.kind ?? 'piece'}`}</title>
                  </path>

                  {custom.pattern !== 'solid' && (
                    <path
                      d={path}
                      fill={`url(#${uid}-pattern-${component.id})`}
                      fillRule={geometry.evenOdd ? 'evenodd' : 'nonzero'}
                      pointerEvents="none"
                      opacity={0.92}
                    />
                  )}

                  {custom.embroidery !== 'none' && (
                    <path
                      d={path}
                      fill={`url(#${uid}-embroidery-${component.id})`}
                      fillRule={geometry.evenOdd ? 'evenodd' : 'nonzero'}
                      pointerEvents="none"
                      opacity={0.42}
                    />
                  )}

                  <g clipPath={`url(#${pieceClipId})`}>
                    {layers.map((layer) => (
                      <LayerArtwork
                        key={layer.id}
                        layer={layer}
                        clipId={`${uid}-clip-${component.id}-${layer.id}`}
                        filterId={`${uid}-filter-${component.id}-${layer.id}`}
                        interactive={interactive && isActive && !layer.locked}
                        onPointerDown={
                          onLayerPointerDown && !layer.locked
                            ? (event) => {
                                event.stopPropagation()
                                onSelectLayer?.(layer.id)
                                onLayerPointerDown(event, component.id, layer)
                              }
                            : undefined
                        }
                      />
                    ))}
                  </g>

                  <path
                    d={path}
                    fill="none"
                    stroke={isActive ? OUTLINE : OUTLINE}
                    strokeOpacity={isActive ? 0.85 : 0}
                    strokeWidth={isActive ? 1.8 : 0}
                    strokeDasharray={isActive ? '5 3' : undefined}
                    pointerEvents="none"
                    fillRule={geometry.evenOdd ? 'evenodd' : 'nonzero'}
                  />
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Selected layer transform box with corner handles. */}
      {interactive &&
        (() => {
          const layer = activeComponentId
            ? orderedLayers(components[activeComponentId]).find(
                (candidate) => candidate.id === selectedLayerId && candidate.visible,
              )
            : undefined
          if (!layer) return null
          const box = layerBox(layer)
          return (
            <g
              transform={`translate(${box.cx} ${box.cy}) rotate(${box.rotation})`}
              pointerEvents="none"
            >
              <rect
                x={-box.width / 2}
                y={-box.height / 2}
                width={box.width}
                height={box.height}
                fill="none"
                stroke="#b08a4f"
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
              {[
                [-box.width / 2, -box.height / 2],
                [box.width / 2, -box.height / 2],
                [-box.width / 2, box.height / 2],
                [box.width / 2, box.height / 2],
              ].map(([x, y], index) => (
                <circle key={index} cx={x} cy={y} r={3} fill="#f7f4ef" stroke="#b08a4f" />
              ))}
            </g>
          )
        })()}

    </svg>
  )
}
