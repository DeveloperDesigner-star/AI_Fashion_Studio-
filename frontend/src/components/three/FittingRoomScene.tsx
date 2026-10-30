import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RiggedAvatar } from '@/components/three/RiggedAvatar'
import {
  RESET_CAMERA,
  cameraPreset,
  type FittingLook,
  type RenderQuality,
  type RigAnimationId,
  type RigId,
  type RigProportions,
  type ViewId,
} from '@/lib/fittingRoom'

export type CameraAction = 'zoom-in' | 'zoom-out' | 'reset'

export interface CameraCommand {
  id: number
  action: CameraAction
}

interface ControlsLike {
  target: THREE.Vector3
  update: () => void
  addEventListener: (type: 'start', listener: () => void) => void
  removeEventListener: (type: 'start', listener: () => void) => void
}

interface FittingRoomSceneProps {
  rig: RigId
  look: FittingLook
  proportions: RigProportions
  animation: RigAnimationId
  speed: number
  paused: boolean
  autoRotate: boolean
  skinTone?: string
  hairColor?: string
  hairStyle?: string
  view: ViewId
  resetToken: number
  cameraCommand: CameraCommand
  onInteracted: () => void
  onTurnFinished: () => void
  onReady: () => void
  quality: RenderQuality
  frameloop: 'always' | 'never'
  captureEnabled?: boolean
  onCaptureReady?: (capture: (() => string | null) | null) => void
}

function CaptureBridge({ onReady }: { onReady?: (capture: (() => string | null) | null) => void }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    if (!onReady) return
    onReady(() => {
      try {
        return gl.domElement.toDataURL('image/png')
      } catch {
        return null
      }
    })
    return () => onReady(null)
  }, [gl, onReady])
  return null
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

interface Tween {
  progress: number
  fromPosition: THREE.Vector3
  fromTarget: THREE.Vector3
  toPosition: THREE.Vector3
  toTarget: THREE.Vector3
}

function CameraRig({
  view,
  resetToken,
  cameraCommand,
  onInteracted,
}: {
  view: ViewId
  resetToken: number
  cameraCommand: CameraCommand
  onInteracted: () => void
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as ControlsLike | null
  const tween = useRef<Tween | null>(null)

  useEffect(() => {
    if (!controls) return
    const handleStart = () => onInteracted()
    controls.addEventListener('start', handleStart)
    return () => controls.removeEventListener('start', handleStart)
  }, [controls, onInteracted])

  useEffect(() => {
    if (!controls || view === 'free') {
      tween.current = null
      return
    }
    const preset = cameraPreset(view)
    if (!preset) return
    tween.current = {
      progress: 0,
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition: new THREE.Vector3(...preset.position),
      toTarget: new THREE.Vector3(...preset.target),
    }
    // resetToken lets "Reset camera" replay the front preset even when the
    // active view is already Front.
  }, [camera, controls, resetToken, view])

  useEffect(() => {
    if (!controls || cameraCommand.action === 'reset' || cameraCommand.id === 0) return
    const offset = camera.position.clone().sub(controls.target)
    const distance = THREE.MathUtils.clamp(
      offset.length() * (cameraCommand.action === 'zoom-in' ? 0.84 : 1.19),
      1.5,
      5.2,
    )
    camera.position.copy(controls.target).add(offset.setLength(distance))
    controls.update()
  }, [camera, cameraCommand, controls])

  useFrame((_, delta) => {
    const active = tween.current
    if (!controls || !active) return
    active.progress = Math.min(1, active.progress + delta / 0.6)
    const eased = easeInOutCubic(active.progress)
    camera.position.lerpVectors(active.fromPosition, active.toPosition, eased)
    controls.target.lerpVectors(active.fromTarget, active.toTarget, eased)
    controls.update()
    if (active.progress >= 1) tween.current = null
  })

  return null
}

function Stage({ shadows }: { shadows: boolean }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[1.42, 72]} />
        <meshStandardMaterial color="#e5dccb" roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[1.39, 1.42, 72]} />
        <meshBasicMaterial color="#c8bdab" />
      </mesh>
      {/* Static contact pool keeps the avatar grounded on every camera side. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0.03]}>
        <circleGeometry args={[0.48, 40]} />
        <meshBasicMaterial color="#17120c" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      {shadows ? (
        <ContactShadows
          position={[0, 0.004, 0]}
          opacity={0.32}
          scale={3.2}
          blur={2.6}
          far={1.9}
          resolution={256}
          color="#17120c"
        />
      ) : null}
    </group>
  )
}

export function FittingRoomScene({
  rig,
  look,
  proportions,
  animation,
  speed,
  paused,
  autoRotate,
  skinTone,
  hairColor,
  hairStyle,
  view,
  resetToken,
  cameraCommand,
  onInteracted,
  onTurnFinished,
  onReady,
  quality,
  frameloop,
  captureEnabled = false,
  onCaptureReady,
}: FittingRoomSceneProps) {
  return (
    <Canvas
      dpr={quality.dpr}
      shadows={false}
      frameloop={frameloop}
      camera={{ position: RESET_CAMERA.position, fov: 32, near: 0.1, far: 30 }}
      gl={{
        antialias: quality.antialias,
        alpha: false,
        powerPreference: 'high-performance',
        // Only enabled for the try-on page, which saves a user-requested snapshot.
        preserveDrawingBuffer: captureEnabled,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor('#ece4d7')
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.03
      }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#ece4d7']} />
      <fog attach="fog" args={['#ece4d7', 7, 15]} />

      <ambientLight intensity={0.72} />
      <hemisphereLight args={['#fff9ef', '#9a8d7b', 0.72]} />
      <directionalLight position={[3.4, 4.6, 3.8]} intensity={2.5} color="#fff6e8" />
      <directionalLight position={[-3.4, 2.8, 2.2]} intensity={0.8} color="#dbe5ec" />
      <directionalLight position={[0, 3.2, -4.2]} intensity={1.0} color="#f6e7d2" />

      <Stage shadows={quality.contactShadows} />

      <Suspense fallback={null}>
        <RiggedAvatar
          key={rig}
          rig={rig}
          look={look}
          proportions={proportions}
          animation={animation}
          speed={speed}
          paused={paused}
          skinTone={skinTone}
          hairColor={hairColor}
          hairStyle={hairStyle}
          onTurnFinished={onTurnFinished}
          onReady={onReady}
        />
      </Suspense>

      <OrbitControls
        makeDefault
        target={RESET_CAMERA.target}
        enablePan
        panSpeed={0.7}
        enableZoom
        zoomSpeed={0.8}
        rotateSpeed={0.85}
        enableDamping
        dampingFactor={0.075}
        minDistance={1.45}
        maxDistance={5.2}
        minPolarAngle={0.22}
        maxPolarAngle={1.68}
        autoRotate={autoRotate}
        autoRotateSpeed={1.15}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
      <CameraRig
        view={view}
        resetToken={resetToken}
        cameraCommand={cameraCommand}
        onInteracted={onInteracted}
      />
      <CaptureBridge onReady={onCaptureReady} />
    </Canvas>
  )
}
