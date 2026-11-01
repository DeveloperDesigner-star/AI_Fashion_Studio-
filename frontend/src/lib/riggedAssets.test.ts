import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  PIECE_MESHES,
  RIGGED_MODELS,
  RIG_ANIMATIONS,
  animationMeta,
} from '@/lib/fittingRoom'

interface ManifestModel {
  id: string
  label: string
  presentation: string
  file: string
  bytes: number
  bones: number
  meshes: number
  vertices: number
  triangles: number
  animations: { id: string; duration: number; loop: boolean }[]
  pieces: string[]
}

interface Manifest {
  version: number
  generator: string
  models: ManifestModel[]
  animations: { id: string; label: string; loop: boolean }[]
}

interface Glb {
  json: Record<string, unknown> & {
    nodes: { name?: string; mesh?: number; skin?: number }[]
    meshes: { primitives: { attributes: Record<string, number> }[] }[]
    skins: { joints: number[]; inverseBindMatrices: number }[]
    animations: { name: string }[]
    accessors: { count: number; componentType: number; type: string }[]
  }
  binary: Buffer
}

const rigDir = `${resolve(
  [resolve(process.cwd(), 'public/models/rig'), resolve(process.cwd(), 'frontend/public/models/rig')].find(
    (candidate) => existsSync(candidate),
  ) ?? 'public/models/rig',
)}/`

function readGlb(file: string): Glb {
  const buffer = readFileSync(`${rigDir}${file}`)
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67)
  expect(buffer.readUInt32LE(4)).toBe(2)
  const jsonLength = buffer.readUInt32LE(12)
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as Glb['json']
  const binaryStart = 20 + jsonLength + 8
  return { json, binary: buffer.subarray(binaryStart) }
}

async function loadGltf(file: string): Promise<GLTF> {
  const buffer = readFileSync(`${rigDir}${file}`)
  // Copy into the current realm's ArrayBuffer: jsdom can expose a different
  // ArrayBuffer constructor than the one three.js checks in GLTFLoader.parse.
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)
  return new Promise<GLTF>((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
  })
}

const manifest = JSON.parse(readFileSync(`${rigDir}rigged-models.json`, 'utf8')) as Manifest

describe('rigged asset manifest', () => {
  it('matches the runtime allowlist exactly', () => {
    expect(manifest.version).toBe(1)
    expect(manifest.models.map((model) => model.id).sort()).toEqual(['female', 'male'])
    for (const model of manifest.models) {
      const runtime = RIGGED_MODELS[model.id as keyof typeof RIGGED_MODELS]
      expect(runtime).toBeDefined()
      expect(model.file).toBe(runtime.file.split('/').at(-1))
      expect(model.bytes).toBe(runtime.bytes)
      expect(model.triangles).toBe(runtime.triangles)
      expect(model.bones).toBe(runtime.bones)
      expect(model.presentation).toBe(runtime.presentation)
    }
    expect(manifest.animations.map((clip) => clip.id)).toEqual(RIG_ANIMATIONS.map((clip) => clip.id))
    expect(manifest.animations.map((clip) => clip.loop)).toEqual(RIG_ANIMATIONS.map((clip) => clip.loop))
  })

  it('ships both genders with idle, walk and turn clips', () => {
    for (const model of manifest.models) {
      expect(model.animations.map((clip) => clip.id).sort()).toEqual(['idle', 'turn', 'walk'])
      const walk = model.animations.find((clip) => clip.id === 'walk')
      expect(walk?.loop).toBe(true)
      expect(walk?.duration).toBeCloseTo(1.2, 2)
      const turn = model.animations.find((clip) => clip.id === 'turn')
      expect(turn?.loop).toBe(false)
      expect(animationMeta('turn').loop).toBe(false)
    }
  })
})

describe.each(manifest.models)('rigged GLB: $id', (model) => {
    const glb = readGlb(model.file)
    const json = glb.json
    const nodeNames = json.nodes.map((node) => node.name ?? '')

    it('is a compact, optimised GLB under the performance budget', () => {
      const size = readFileSync(`${rigDir}${model.file}`).byteLength
      expect(size).toBe(model.bytes)
      expect(size).toBeLessThan(380_000)
      expect(model.vertices).toBeLessThan(6_000)
      expect(model.triangles).toBeLessThan(8_000)
      expect(json.meshes.length).toBe(model.meshes)
      expect(json.skins).toHaveLength(1)
      expect(json.skins[0].joints).toHaveLength(19)
    })

    it('contains a skeleton with every bone the clips and proportions use', () => {
      for (const bone of [
        'hips',
        'spine',
        'chest',
        'neck',
        'head',
        'shoulder_L',
        'upper_arm_L',
        'forearm_L',
        'hand_L',
        'thigh_L',
        'shin_L',
        'foot_L',
        'shoulder_R',
        'upper_arm_R',
        'forearm_R',
        'hand_R',
        'thigh_R',
        'shin_R',
        'foot_R',
      ]) {
        expect(nodeNames).toContain(bone)
      }
      expect(json.skins[0].inverseBindMatrices).toBeTypeOf('number')
    })

    it('ships every fitted sample piece as a skinned mesh', () => {
      for (const meshName of Object.values(PIECE_MESHES).flat()) {
        expect(nodeNames).toContain(meshName)
        const node = json.nodes.find((entry) => entry.name === meshName)
        expect(node?.skin).toBe(0)
        const primitive = json.meshes[node?.mesh ?? -1]?.primitives[0]
        expect(primitive?.attributes.JOINTS_0).toBeTypeOf('number')
        expect(primitive?.attributes.WEIGHTS_0).toBeTypeOf('number')
      }
      for (const meshName of ['body_torso', 'body_head', 'body_arm_l', 'body_leg_r', 'hair_short', 'hair_long', 'hair_bun']) {
        expect(nodeNames).toContain(meshName)
      }
    })

    it('exports idle, walk and turn animations with valid targets', () => {
      expect(json.animations.map((clip) => clip.name).sort()).toEqual(['idle', 'turn', 'walk'])
      for (const clip of json.animations) {
        expect(['idle', 'turn', 'walk']).toContain(clip.name)
      }
    })

    it('loads into three.js with one skinned skeleton per instance', async () => {
      const gltf = await loadGltf(model.file)
      const skinned: THREE.SkinnedMesh[] = []
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) skinned.push(object)
      })
      expect(skinned.length).toBeGreaterThan(20)
      const body = skinned.find((mesh) => mesh.name === 'body_torso')
      expect(body).toBeDefined()
      expect(body?.skeleton.bones).toHaveLength(19)
      expect(body?.skeleton.boneInverses).toHaveLength(19)
      expect(gltf.animations.map((clip) => clip.name).sort()).toEqual(['idle', 'turn', 'walk'])
    })
  },
)

describe('animation behaviour (headless three.js)', () => {
  it('moves the body, the worn outfit and footwear during the walk cycle', async () => {
    const gltf = await loadGltf(manifest.models[0].file)
    const instance = cloneSkeleton(gltf.scene)
    const mixer = new THREE.AnimationMixer(instance)
    const walk = THREE.AnimationClip.findByName(gltf.animations, 'walk')
    expect(walk).not.toBeNull()
    const action = mixer.clipAction(walk as THREE.AnimationClip)
    action.play()

    const findMesh = (name: string) => {
      let found: THREE.SkinnedMesh | null = null
      instance.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh && object.name === name) found = object as THREE.SkinnedMesh
      })
      return found
    }
    const body = findMesh('body_torso')!
    const bottom = findMesh('garment_bottom_l')!
    const top = findMesh('garment_sleeve_l')!
    const shoe = findMesh('footwear_l')!
    for (const mesh of [body, bottom, top, shoe]) expect(mesh).toBeDefined()

    const sample = (mesh: THREE.SkinnedMesh) => {
      instance.updateMatrixWorld(true)
      const position = new THREE.Vector3()
      const attribute = mesh.geometry.attributes.position
      const positions: THREE.Vector3[] = []
      for (let index = 0; index < attribute.count; index += 1) {
        position.fromBufferAttribute(attribute, index)
        mesh.applyBoneTransform(index, position)
        positions.push(position.clone())
      }
      return positions
    }

    mixer.setTime(0)
    const rest = { bottom: sample(bottom), top: sample(top), shoe: sample(shoe) }
    const thigh = instance.getObjectByName('thigh_L')
    const restQuaternion = thigh?.quaternion.clone()

    mixer.setTime(0.3)
    instance.updateMatrixWorld(true)
    const moved = { bottom: sample(bottom), top: sample(top), shoe: sample(shoe) }
    const displacement = (a: THREE.Vector3[], b: THREE.Vector3[]) =>
      Math.max(...a.map((point, index) => point.distanceTo(b[index])))

    expect(displacement(rest.bottom, moved.bottom)).toBeGreaterThan(0.02)
    expect(displacement(rest.top, moved.top)).toBeGreaterThan(0.02)
    expect(displacement(rest.shoe, moved.shoe)).toBeGreaterThan(0.02)
    expect(thigh?.quaternion.equals(restQuaternion as THREE.Quaternion)).toBe(false)

    // Every skinned vertex must stay finite while the skeleton animates.
    for (const point of moved.bottom) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
      expect(Number.isFinite(point.z)).toBe(true)
    }
  })

  it('keeps the footwear on the floor across the supported leg-length range', async () => {
    for (const leg of [0.95, 1, 1.05]) {
      const gltf = await loadGltf('rigged-female.glb')
      const instance = cloneSkeleton(gltf.scene)
      const height = 1.08
      instance.scale.set(1.05, height, 1.05)
      instance.position.y = 0.84 * (leg - 1) * height
      const shin = instance.getObjectByName('shin_L') as THREE.Bone
      const foot = instance.getObjectByName('foot_L') as THREE.Bone
      shin.position.y = -0.44 * leg
      foot.position.y = -0.4 * leg
      instance.updateMatrixWorld(true)
      const ankle = foot.getWorldPosition(new THREE.Vector3())
      // The authored ankle sits at 0.06 m; body proportion changes must not
      // push the shoes through the platform or leave them floating.
      expect(ankle.y).toBeCloseTo(0.06 * height, 4)
    }
  })

  it('turns the whole skeleton through the turn clip', async () => {
    const gltf = await loadGltf('rigged-female.glb')
    const instance = cloneSkeleton(gltf.scene)
    const mixer = new THREE.AnimationMixer(instance)
    const turn = THREE.AnimationClip.findByName(gltf.animations, 'turn') as THREE.AnimationClip
    mixer.clipAction(turn).play()
    const hips = instance.getObjectByName('hips') as THREE.Bone
    mixer.setTime(0)
    const before = hips.quaternion.clone()
    mixer.setTime(turn.duration / 2)
    instance.updateMatrixWorld(true)
    expect(hips.quaternion.equals(before)).toBe(false)
    // Halfway through the authored pivot is roughly a half turn.
    const halfTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    const angle = hips.quaternion.angleTo(halfTurn)
    expect(angle).toBeLessThan(0.3)
  })
})
