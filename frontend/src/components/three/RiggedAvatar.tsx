import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  PIECE_MESHES,
  RIGGED_MODELS,
  ROLE_DEFAULT_COLORS,
  animationMeta,
  hairMeshForStyle,
  materialRoleForMesh,
  pieceForMesh,
  type FittingLook,
  type MaterialRole,
  type RigAnimationId,
  type RigId,
  type RigProportions,
} from '@/lib/fittingRoom'

interface RiggedAvatarProps {
  rig: RigId
  look: FittingLook
  proportions: RigProportions
  animation: RigAnimationId
  speed: number
  paused: boolean
  skinTone?: string
  hairColor?: string
  hairStyle?: string
  onTurnFinished?: () => void
  onReady?: () => void
}

interface MeshRecord {
  name: string
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
  role: MaterialRole | null
}

const LEG_LIFT = 0.84

function makeMaterial(material: THREE.Material | THREE.Material[]): THREE.MeshStandardMaterial {
  const source = Array.isArray(material) ? material[0] : material
  const cloned = source.clone() as THREE.MeshStandardMaterial
  cloned.side = THREE.DoubleSide
  cloned.metalness = 0
  cloned.roughness = Math.min(1, Math.max(0.35, cloned.roughness ?? 0.85))
  return cloned
}

/**
 * A skinned avatar plus its fitted sample wardrobe, driven by the GLB's own
 * animation clips. Garments and footwear are meshes inside the *same* skinned
 * file, so they inherit exactly the same skeleton transforms as the body.
 */
export function RiggedAvatar({
  rig,
  look,
  proportions,
  animation,
  speed,
  paused,
  skinTone = '#c99a76',
  hairColor = '#241c18',
  hairStyle = 'short',
  onTurnFinished,
  onReady,
}: RiggedAvatarProps) {
  const url = RIGGED_MODELS[rig].file
  const { scene, animations } = useGLTF(url)

  const model = useMemo(() => {
    const cloned = cloneSkeleton(scene)
    cloned.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      // Skinned bounds are conservative; culling can vanish a moving limb.
      object.frustumCulled = false
      object.castShadow = true
      object.receiveShadow = false
      object.material = makeMaterial(object.material)
    })
    return cloned
  }, [scene])

  const records = useMemo<MeshRecord[]>(() => {
    const list: MeshRecord[] = []
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const material = object.material
      if (Array.isArray(material) || !(material instanceof THREE.MeshStandardMaterial)) return
      list.push({
        name: object.name,
        mesh: object,
        material,
        role: materialRoleForMesh(object.name),
      })
    })
    return list
  }, [model])

  const bones = useMemo(() => {
    const map = new Map<string, THREE.Bone>()
    model.traverse((object) => {
      if (object instanceof THREE.Bone) map.set(object.name, object)
    })
    return map
  }, [model])

  const restPositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    bones.forEach((bone, name) => map.set(name, bone.position.clone()))
    return map
  }, [bones])

  useEffect(() => {
    onReady?.()
  }, [model, onReady])

  // Materials are cloned per mount, so dispose them with the model.
  useEffect(() => {
    return () => {
      for (const record of records) record.material.dispose()
    }
  }, [records])

  // Body proportions: height/build through the transform, torso/leg length
  // through bone offsets. The fitted wardrobe shares those bones, so it tracks.
  useEffect(() => {
    const [width, height] = proportions.scale
    model.scale.set(width, height, width)
    model.position.y = LEG_LIFT * (proportions.leg - 1) * height

    const setLength = (name: string, factor: number) => {
      const bone = bones.get(name)
      const rest = restPositions.get(name)
      if (!bone || !rest) return
      bone.position.set(rest.x, rest.y * factor, rest.z)
    }
    setLength('spine', proportions.torso)
    setLength('chest', proportions.torso)
    for (const side of ['L', 'R']) {
      setLength(`shin_${side}`, proportions.leg)
      setLength(`foot_${side}`, proportions.leg)
    }
  }, [bones, model, proportions, restPositions])

  // Visibility + colours. Unselected sample pieces stay hidden rather than
  // being tinted and left on the mannequin.
  useEffect(() => {
    const hairMesh = hairMeshForStyle(hairStyle)
    for (const record of records) {
      const { name } = record
      let visible = true
      if (name.startsWith('hair_')) {
        visible = name === hairMesh
      } else if (name.startsWith('body_')) {
        visible = !look.bodyHidden.includes(name)
      } else {
        const piece = pieceForMesh(name)
        visible = piece ? look.pieceIds.includes(piece) : true
      }
      record.mesh.visible = visible
      if (!record.role) continue
      const colour =
        record.role === 'skin'
          ? skinTone
          : record.role === 'hair'
            ? hairColor
            : (look.colors[record.role] ?? ROLE_DEFAULT_COLORS[record.role])
      record.material.color.set(colour)
    }
  }, [hairColor, hairStyle, look, records, skinTone])

  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model])
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>()
    for (const clip of animations) map.set(clip.name, mixer.clipAction(clip))
    return map
  }, [animations, mixer])

  const activeAction = useRef<THREE.AnimationAction | null>(null)

  useEffect(() => {
    const next = actions.get(animation)
    if (!next) return
    const previous = activeAction.current
    if (previous === next) return

    const meta = animationMeta(animation)
    next.reset()
    next.setLoop(meta.loop ? THREE.LoopRepeat : THREE.LoopOnce, meta.loop ? Infinity : 1)
    next.clampWhenFinished = !meta.loop
    next.enabled = true
    next.setEffectiveWeight(1)
    next.play()
    if (previous) previous.crossFadeTo(next, 0.36, false)
    activeAction.current = next
  }, [actions, animation])

  useEffect(() => {
    mixer.timeScale = paused ? 0 : speed
  }, [mixer, paused, speed])

  useEffect(() => {
    const handleFinished = (event: { action?: THREE.AnimationAction }) => {
      if (event.action && event.action === actions.get('turn')) onTurnFinished?.()
    }
    mixer.addEventListener('finished', handleFinished)
    return () => mixer.removeEventListener('finished', handleFinished)
  }, [actions, mixer, onTurnFinished])

  useFrame((_, delta) => {
    // A long tab pause should not teleport the walk cycle.
    mixer.update(Math.min(delta, 0.05))
  })

  return <primitive object={model} />
}

/** Keep the sample wardrobes warm once the fitting room has opened. */
export function preloadRiggedModels() {
  useGLTF.preload(RIGGED_MODELS.female.file)
  useGLTF.preload(RIGGED_MODELS.male.file)
}

/** Mesh names inside the rigged files (also used by tests). */
export const RIG_MESH_NAMES = Object.values(PIECE_MESHES).flat()
