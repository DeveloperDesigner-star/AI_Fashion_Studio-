import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import type { AvatarParameters } from '@/lib/types'
import { Figure } from '@/components/three/Figure'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { visibleItems, useStudioStore, type FittingItem } from '@/stores/studioStore'
import { cn } from '@/lib/format'

interface AvatarSceneProps {
  parameters: AvatarParameters | null
  skinTone?: string
  hairColor?: string
  hairStyle?: string
  className?: string
  showControls?: boolean
  interactive?: boolean
  itemsOverride?: FittingItem[]
  walkOverride?: boolean
}

function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    )
  } catch {
    return false
  }
}

export function AvatarScene({
  parameters,
  skinTone = '#c99a76',
  hairColor = '#241c18',
  hairStyle = 'short',
  className,
  showControls = true,
  interactive = true,
  itemsOverride,
  walkOverride,
}: AvatarSceneProps) {
  const items = useStudioStore((state) => state.items)
  const walk = useStudioStore((state) => state.walk)
  const autoRotate = useStudioStore((state) => state.autoRotate)
  const showAccessories = useStudioStore((state) => state.showAccessories)
  const visible = useMemo(
    () => visibleItems(itemsOverride ?? items, showAccessories),
    [items, itemsOverride, showAccessories],
  )
  const webgl = useMemo(supportsWebGL, [])

  if (!parameters) {
    return (
      <div className={cn('flex items-center justify-center border border-line bg-bone', className)}>
        <div className="max-w-xs px-6 text-center">
          <p className="eyebrow">Avatar</p>
          <p className="mt-2 text-sm text-ink-muted">
            Complete your measurements to generate a personalised 3D body.
          </p>
        </div>
      </div>
    )
  }

  if (!webgl) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4 border border-line bg-bone p-6', className)}>
        <p className="eyebrow">3D unavailable</p>
        <p className="max-w-xs text-center text-xs leading-relaxed text-ink-muted">
          This browser or device does not expose WebGL, so the atelier falls back to the 2D flat
          illustration. All design and print features remain available.
        </p>
        <div className="flex gap-2">
          {visible.slice(0, 3).map((item) => (
            <GarmentArt key={item.key} garment={item.garment} components={item.components} className="h-32 w-24" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden border border-line bg-[#f0ece3]', className)}>
      <Canvas
        dpr={[1, 1.8]}
        shadows={false}
        camera={{ position: [0.35, 1.15, 3.15], fov: 32, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => gl.setClearColor('#f0ece3')}
        aria-label="3D avatar preview. Drag to rotate."
      >
        <fog attach="fog" args={['#f0ece3', 6, 14]} />
        <ambientLight intensity={0.62} />
        <hemisphereLight args={['#fdfbf6', '#b6ab99', 0.65]} />
        <directionalLight position={[2.4, 3.6, 3.2]} intensity={1.7} color="#fff8ec" />
        <directionalLight position={[-3, 2, 1.4]} intensity={0.55} color="#dfe6ea" />
        <directionalLight position={[0, 2.4, -3.4]} intensity={0.7} color="#f6e6d2" />

        <Suspense fallback={null}>
          <group position={[0, 0, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
              <circleGeometry args={[1.35, 64]} />
              <meshStandardMaterial color="#e8e1d4" roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
              <ringGeometry args={[1.33, 1.36, 64]} />
              <meshBasicMaterial color="#cdc3b2" />
            </mesh>
            <mesh position={[0, 1.9, -2.4]}>
              <planeGeometry args={[14, 7]} />
              <meshStandardMaterial color="#ece6da" roughness={1} />
            </mesh>
            <Figure
              parameters={parameters}
              skinTone={skinTone}
              hairColor={hairColor}
              hairStyle={hairStyle}
              items={visible}
              walk={walkOverride ?? walk}
            />
            <ContactShadows position={[0, 0.002, 0]} opacity={0.32} scale={4.4} blur={2.6} far={2.2} color="#15130f" />
          </group>
        </Suspense>

        <OrbitControls
          enabled={interactive}
          target={[0, 1.0, 0]}
          enablePan={false}
          enableZoom={showControls}
          minDistance={1.5}
          maxDistance={4.6}
          minPolarAngle={0.45}
          maxPolarAngle={1.62}
          autoRotate={autoRotate}
          autoRotateSpeed={1.6}
          makeDefault
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 text-[0.5625rem] uppercase tracking-[0.16em] text-ink-muted">
        <span className="border border-line bg-paper/80 px-2 py-1">Drag to rotate · scroll to zoom</span>
      </div>
      {visible.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 text-center">
          <span className="border border-line bg-paper/85 px-3 py-1.5 text-[0.625rem] uppercase tracking-[0.16em] text-ink-muted">
            Undressed mannequin — add garments from the studio
          </span>
        </div>
      )}
    </div>
  )
}
