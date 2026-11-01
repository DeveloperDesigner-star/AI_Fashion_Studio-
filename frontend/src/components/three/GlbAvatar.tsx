import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { cn } from '@/lib/format'
import { glbNodeMultipliers, modelAssetUrl } from '@/lib/avatarStudio'
import type { AvatarAdjustments, AvatarParameters } from '@/lib/types'

type Measured = { height: number; build: number; shoulder: number }

interface GlbAvatarProps {
  modelId: string
  adjustments: AvatarAdjustments
  parameters?: AvatarParameters | null
  skinTone?: string
  hairColor?: string
  hairStyle?: string
  autoRotate?: boolean
  className?: string
  showHint?: boolean
}

function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

class ModelErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Simulated measurements from the shared helper, memoised per parameter object. */
function measuredFrom(parameters?: AvatarParameters | null): Measured {
  if (!parameters) return { height: 1, build: 1, shoulder: 1 }
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
  return {
    height: clamp((parameters.height_m ?? 1.72) / 1.72, 0.88, 1.12),
    build:
      (clamp((parameters.chest_width ?? 0.29) / 0.29, 0.9, 1.12) +
        clamp((parameters.waist_width ?? 0.24) / 0.24, 0.9, 1.12) +
        clamp((parameters.hip_width ?? 0.31) / 0.31, 0.9, 1.12)) /
      3,
    shoulder: clamp((parameters.shoulder_width ?? 0.42) / 0.42, 0.9, 1.12),
  }
}

function AvatarModel({
  url,
  adjustments,
  measured,
  skinTone,
  hairColor,
  hairStyle,
  groupRef,
}: {
  url: string
  adjustments: AvatarAdjustments
  measured: Measured
  skinTone: string
  hairColor: string
  hairStyle: string
  groupRef: RefObject<THREE.Group | null>
}) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => scene.clone(true), [scene])
  const originals = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) map.set(object.name, { x: object.position.x, y: object.position.y })
    })
    return map
  }, [clone])

  useEffect(() => {
    const multipliers = glbNodeMultipliers(adjustments, measured)
    const skin = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.82, metalness: 0 })
    const hair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.7, metalness: 0 })

    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
      const name = object.name
      const original = originals.get(name)

      if (name === 'body_torso') {
        object.scale.set(...multipliers.torso)
        object.material = skin
      } else if (name === 'body_head' || name === 'body_neck') {
        object.scale.set(...multipliers.head)
        object.material = skin
      } else if (name.startsWith('arm_')) {
        object.scale.set(...multipliers.arms)
        object.material = skin
        if (original) object.position.x = original.x * multipliers.armOffsetX
      } else if (name.startsWith('leg_')) {
        object.scale.set(...multipliers.legs)
        object.material = skin
        if (original) object.position.y = original.y + multipliers.legOffsetY
      } else if (name === 'hair') {
        object.visible = hairStyle !== 'bald'
        object.material = hair
        object.scale.setScalar(hairStyle === 'long' ? 1.02 : 1)
      } else {
        object.material = skin
      }
    })
  }, [clone, adjustments, measured, skinTone, hairColor, hairStyle, originals])

  return <primitive ref={groupRef} object={clone} />
}

export function AvatarSilhouette({
  presentation = 'neutral',
  skinTone = '#c99a76',
  hairColor = '#241c18',
  className,
}: {
  presentation?: 'feminine' | 'masculine' | 'neutral'
  skinTone?: string
  hairColor?: string
  className?: string
}) {
  const shoulder = presentation === 'masculine' ? 46 : presentation === 'feminine' ? 34 : 39
  const hip = presentation === 'feminine' ? 34 : presentation === 'masculine' ? 30 : 32
  return (
    <svg viewBox="0 0 120 220" className={cn('h-full w-full', className)} role="img" aria-label="Avatar silhouette">
      <ellipse cx="60" cy="30" rx="17" ry="21" fill={skinTone} />
      <path d={`M60 50 q${shoulder} 4 ${shoulder + 4} 44 l-2 34 q-${shoulder / 2} 10 -${shoulder} 0 l-3 -34 q-8 -36 12 -44 z`} fill={skinTone} opacity="0.92" />
      <path d={`M60 128 q${hip} 6 ${hip} 36 l-3 52 h-12 l-3 -44 h-4 l-4 44 h-12 l-2 -52 q0 -30 ${hip} -36 z`} fill={skinTone} opacity="0.86" />
      <path d="M43 12 q17 -16 34 0 q4 18 -3 26 q-14 -10 -28 0 q-7 -8 -3 -26 z" fill={hairColor} />
    </svg>
  )
}

export function GlbAvatar({
  modelId,
  adjustments,
  parameters,
  skinTone = '#c99a76',
  hairColor = '#241c18',
  hairStyle = 'short',
  autoRotate = true,
  className,
  showHint = false,
}: GlbAvatarProps) {
  const url = modelAssetUrl(modelId)
  const measured = useMemo(() => measuredFrom(parameters), [parameters])
  const webgl = useMemo(supportsWebGL, [])
  const groupRef = useRef<THREE.Group | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const download = useCallback(async () => {
    if (!groupRef.current) return
    setExporting(true)
    setExportError(null)
    try {
      const exporter = new GLTFExporter()
      const result = (await exporter.parseAsync(groupRef.current, { binary: true })) as ArrayBuffer
      const blob = new Blob([result], { type: 'model/gltf-binary' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `avatar-${modelId}.glb`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 4000)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }, [modelId])

  const silhouette = (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-bone px-6 text-center">
      <div className="h-32 w-20">
        <AvatarSilhouette skinTone={skinTone} hairColor={hairColor} />
      </div>
      <p className="max-w-[15rem] text-xs leading-relaxed text-ink-muted">
        The 3D preview needs WebGL. Your avatar is still saved and editable.
      </p>
    </div>
  )

  if (!webgl) {
    return <div className={cn('relative border border-line bg-bone', className)}>{silhouette}</div>
  }

  return (
    <div className={cn('relative overflow-hidden border border-line bg-bone', className)}>
      <ModelErrorBoundary fallback={silhouette}>
        <Canvas
          shadows
          dpr={[1, 1.8]}
          camera={{ position: [0.9, 1.2, 3.1], fov: 34 }}
          gl={{ antialias: true, powerPreference: 'low-power' }}
        >
          <color attach="background" args={['#f3efe8']} />
          <ambientLight intensity={0.65} />
          <directionalLight
            position={[2.4, 4.2, 3]}
            intensity={1.7}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <directionalLight position={[-3, 2, -2]} intensity={0.35} />
          <Suspense fallback={null}>
            <AvatarModel
              url={url}
              adjustments={adjustments}
              measured={measured}
              skinTone={skinTone}
              hairColor={hairColor}
              hairStyle={hairStyle}
              groupRef={groupRef}
            />
          </Suspense>
          <ContactShadows position={[0, 0.005, 0]} opacity={0.34} scale={3.2} blur={2.6} far={1.4} />
          <OrbitControls
            makeDefault
            target={[0, 0.95, 0]}
            enablePan={false}
            minDistance={1.5}
            maxDistance={4.5}
            minPolarAngle={0.35}
            maxPolarAngle={Math.PI / 1.85}
            autoRotate={autoRotate}
            autoRotateSpeed={0.7}
            enableDamping
            dampingFactor={0.08}
          />
        </Canvas>
      </ModelErrorBoundary>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-paper/85 to-transparent p-3">
        <span className="text-[0.5625rem] uppercase tracking-[0.14em] text-ink-muted">
          {showHint ? 'Drag to orbit' : 'Base model'}
        </span>
        <button
          type="button"
          onClick={download}
          disabled={exporting}
          className="pointer-events-auto border border-line bg-paper px-2.5 py-1.5 text-[0.5625rem] uppercase tracking-[0.12em] hover:border-ink disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Download GLB'}
        </button>
      </div>

      {exportError && (
        <p className="absolute inset-x-0 top-0 bg-danger/10 px-3 py-1.5 text-[0.5625rem] text-danger">
          {exportError}
        </p>
      )}
    </div>
  )
}
