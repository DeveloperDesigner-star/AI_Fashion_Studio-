import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AvatarParameters } from '@/lib/types'
import { getPatternTexture } from '@/components/three/patternTexture'
import type { FittingItem } from '@/stores/studioStore'

interface FigureProps {
  parameters: AvatarParameters
  skinTone: string
  hairColor: string
  hairStyle: string
  items: FittingItem[]
  walk: boolean
}

interface Dimensions {
  leg: number
  torso: number
  hipY: number
  shoulderY: number
  chestW: number
  chestD: number
  waistW: number
  hipW: number
  hipD: number
  shoulderW: number
  headH: number
  armL: number
  thighW: number
  calfW: number
}

function fabricColour(item: FittingItem, preferred: string[], fallback: string): string {
  for (const key of preferred) {
    const value = item.components?.[key]
    if (value?.color) return value.color
  }
  return fallback
}

function FabricMaterial({
  colour,
  pattern,
  roughness = 0.85,
  metalness = 0,
}: {
  colour: string
  pattern?: string
  roughness?: number
  metalness?: number
}) {
  const texture = useMemo(
    () => (pattern ? getPatternTexture(pattern, colour) : null),
    [pattern, colour],
  )
  return (
    <meshStandardMaterial
      color={colour}
      map={texture ?? undefined}
      roughness={roughness}
      metalness={metalness}
      side={THREE.DoubleSide}
    />
  )
}

function patternFor(item: FittingItem, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item.components?.[key]
    if (value?.pattern) return value.pattern
  }
  return undefined
}

/** Torso-level garments: tops, outerwear, dresses and the trouser waistband. */
function TorsoGarment({ item, dimensions }: { item: FittingItem; dimensions: Dimensions }) {
  const { chestW, waistW, hipW, torso, shoulderY, hipY } = dimensions

  if (item.slot === 'bottom') {
    return (
      <mesh position={[0, hipY + 0.035, 0]}>
        <cylinderGeometry args={[hipW / 2 + 0.022, hipW / 2 + 0.02, 0.13, 24, 1, true]} />
        <FabricMaterial colour={fabricColour(item, ['body', 'waistband'], item.garment.default_color)} />
      </mesh>
    )
  }

  if (item.slot === 'dress') {
    const height = torso + dimensions.leg * 0.6
    const colour = fabricColour(item, ['body', 'bodice'], item.garment.default_color)
    return (
      <group>
        <mesh position={[0, shoulderY - height / 2 - 0.015, 0]} castShadow>
          <cylinderGeometry args={[chestW / 2 + 0.022, hipW / 2 + 0.12, height, 32, 1, true]} />
          <FabricMaterial colour={colour} pattern={patternFor(item, ['body', 'bodice'])} />
        </mesh>
        {[...Array(6)].map((_, index) => (
          <mesh
            key={index}
            position={[
              Math.sin((index / 6) * Math.PI * 2) * (hipW / 2 + 0.105),
              shoulderY - height + 0.06,
              Math.cos((index / 6) * Math.PI * 2) * (hipW / 2 + 0.105) * 0.8,
            ]}
          >
            <sphereGeometry args={[0.012, 6, 6]} />
            <meshStandardMaterial color={colour} roughness={0.9} />
          </mesh>
        ))}
      </group>
    )
  }

  if (item.slot === 'top' || item.slot === 'outerwear') {
    const padded = item.slot === 'outerwear' ? 0.04 : 0.02
    const height = torso * (item.slot === 'outerwear' ? 0.98 : 0.82)
    const colour = fabricColour(item, ['body'], item.garment.default_color)
    const collarColour = fabricColour(item, ['collar', 'lapels'], colour)
    return (
      <group>
        <mesh position={[0, shoulderY - height / 2 - 0.012, 0]} castShadow>
          <cylinderGeometry args={[chestW / 2 + padded, waistW / 2 + padded * 0.8, height, 28, 1, true]} />
          <FabricMaterial colour={colour} pattern={patternFor(item, ['body'])} />
        </mesh>
        <mesh position={[0, shoulderY - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[chestW * 0.26, 0.02, 8, 24]} />
          <FabricMaterial colour={collarColour} roughness={0.7} />
        </mesh>
        {item.slot === 'outerwear' && (
          <mesh position={[0, shoulderY - height * 0.52, chestW / 2 + 0.02]}>
            <boxGeometry args={[0.035, height * 0.9, 0.012]} />
            <meshStandardMaterial color="#15130f" opacity={0.25} transparent />
          </mesh>
        )}
      </group>
    )
  }

  return null
}

/** Pieces that live inside an animated limb group. */
function LimbGarment({ item, leg }: { item: FittingItem; leg: number }) {
  const colour = fabricColour(item, ['body', 'upper'], item.garment.default_color)

  if (item.slot === 'bottom') {
    return (
      <mesh position={[0, -leg / 2 + 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.062, leg * 0.97, 18, 1, true]} />
        <FabricMaterial colour={colour} pattern={patternFor(item, ['body'])} />
      </mesh>
    )
  }

  if (item.slot === 'footwear') {
    return (
      <group position={[0, -leg + 0.03, 0.05]}>
        <mesh castShadow>
          <boxGeometry args={[0.095, 0.06, 0.235]} />
          <FabricMaterial colour={colour} pattern={patternFor(item, ['upper'])} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.032, 0]}>
          <boxGeometry args={[0.1, 0.014, 0.24]} />
          <meshStandardMaterial color="#20201d" roughness={0.9} />
        </mesh>
      </group>
    )
  }

  return null
}

/** Accessories worn on the torso / hands. */
function AccessoryGarment({ item, dimensions }: { item: FittingItem; dimensions: Dimensions }) {
  const { hipW, hipY, shoulderY, headH } = dimensions

  if (item.slot === 'bag') {
    const colour = fabricColour(item, ['body'], item.garment.default_color)
    return (
      <group position={[hipW / 2 + 0.13, hipY + 0.18, 0.02]} rotation={[0, 0, -0.08]}>
        <mesh castShadow>
          <boxGeometry args={[0.18, 0.22, 0.085]} />
          <FabricMaterial colour={colour} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.15, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.062, 0.008, 8, 22, Math.PI]} />
          <meshStandardMaterial color="#3a2a1e" roughness={0.6} />
        </mesh>
      </group>
    )
  }

  if (item.slot === 'accessory') {
    const colour = fabricColour(item, ['body'], item.garment.default_color)
    return (
      <group position={[0, shoulderY + 0.02, 0]}>
        <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2.1, 0, 0]}>
          <torusGeometry args={[0.09, 0.024, 10, 28]} />
          <FabricMaterial colour={colour} pattern={patternFor(item, ['body'])} />
        </mesh>
        <mesh position={[0.05, -0.12, 0.075]} rotation={[0.12, 0, 0.06]}>
          <boxGeometry args={[0.075, 0.22, 0.008]} />
          <FabricMaterial colour={colour} pattern={patternFor(item, ['body'])} />
        </mesh>
      </group>
    )
  }

  if (item.slot === 'headwear') {
    const colour = fabricColour(item, ['body'], item.garment.default_color)
    return (
      <group position={[0, shoulderY + 0.19 + headH * 0.5, 0]}>
        <mesh>
          <cylinderGeometry args={[0.135, 0.13, 0.11, 24]} />
          <FabricMaterial colour={colour} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.055, 0.02]} rotation={[0.05, 0, 0]}>
          <cylinderGeometry args={[0.215, 0.215, 0.012, 32]} />
          <FabricMaterial colour={colour} roughness={0.9} />
        </mesh>
      </group>
    )
  }

  return null
}

function WristWatch({ item }: { item: FittingItem }) {
  const strap = fabricColour(item, ['strap'], '#2b2823')
  const caseColour = fabricColour(item, ['case'], '#b08d54')
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[0.038, 0.008, 10, 24]} />
        <meshStandardMaterial color={strap} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0, 0.013]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.023, 0.023, 0.009, 20]} />
        <meshStandardMaterial color={caseColour} metalness={0.65} roughness={0.3} />
      </mesh>
    </group>
  )
}

export function Figure({ parameters, skinTone, hairColor, hairStyle, items, walk }: FigureProps) {
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const root = useRef<THREE.Group>(null)

  const dimensions = useMemo<Dimensions>(() => {
    const leg = Math.max(0.55, parameters.leg_length)
    const torso = Math.max(0.4, parameters.torso_length)
    const footY = 0.055
    const hipY = leg + footY
    return {
      leg,
      torso,
      hipY,
      shoulderY: hipY + torso,
      chestW: Math.max(0.24, parameters.chest_width),
      chestD: Math.max(0.16, parameters.chest_depth),
      waistW: Math.max(0.2, parameters.waist_width),
      hipW: Math.max(0.26, parameters.hip_width),
      hipD: Math.max(0.17, parameters.hip_depth),
      shoulderW: Math.max(0.32, parameters.shoulder_width),
      headH: Math.max(0.18, parameters.head_height),
      armL: Math.max(0.45, parameters.arm_length / 100),
      thighW: Math.max(0.1, parameters.thigh_width),
      calfW: Math.max(0.08, parameters.calf_width),
    }
  }, [parameters])

  const bySlot = useMemo(() => {
    const map: Record<string, FittingItem | undefined> = {}
    items.forEach((item) => {
      map[item.slot] = item
    })
    return map
  }, [items])

  useFrame((state) => {
    if (!walk) {
      const ease = (group: THREE.Group | null) => {
        if (group) group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, 0.12)
      }
      ease(leftLeg.current)
      ease(rightLeg.current)
      ease(leftArm.current)
      ease(rightArm.current)
      if (root.current) root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, 0, 0.12)
      return
    }
    const time = state.clock.elapsedTime * 3.1
    const swing = Math.sin(time) * 0.4
    if (leftLeg.current) leftLeg.current.rotation.x = swing
    if (rightLeg.current) rightLeg.current.rotation.x = -swing
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.65
    if (rightArm.current) rightArm.current.rotation.x = swing * 0.65
    if (root.current) root.current.position.y = Math.abs(Math.sin(time)) * 0.012
  })

  const { leg, hipY, shoulderY, shoulderW, chestW, chestD, waistW, hipW, hipD, headH, armL, thighW, calfW, torso } = dimensions
  const headY = shoulderY + 0.075 + headH / 2

  const renderLeg = (side: -1 | 1) => {
    const ref = side === -1 ? leftLeg : rightLeg
    return (
      <group key={`leg-${side}`} ref={ref} position={[side * hipW * 0.19, hipY - 0.01, 0]}>
        <mesh position={[0, -leg / 2, 0]} castShadow>
          <capsuleGeometry args={[thighW * 0.42, leg * 0.9, 6, 14]} />
          <meshStandardMaterial color={skinTone} roughness={0.74} />
        </mesh>
        <mesh position={[0, -leg + 0.075, 0]}>
          <sphereGeometry args={[calfW * 0.42, 14, 12]} />
          <meshStandardMaterial color={skinTone} roughness={0.74} />
        </mesh>
        {bySlot.bottom && <LimbGarment item={bySlot.bottom} leg={leg} />}
        {bySlot.footwear ? (
          <LimbGarment item={bySlot.footwear} leg={leg} />
        ) : (
          <group position={[0, -leg + 0.03, 0.05]}>
            <mesh>
              <boxGeometry args={[0.09, 0.055, 0.21]} />
              <meshStandardMaterial color="#2a2620" roughness={0.85} />
            </mesh>
          </group>
        )}
      </group>
    )
  }

  const sleeveItem = bySlot.outerwear ?? bySlot.top ?? bySlot.dress

  const renderArm = (side: -1 | 1) => {
    const ref = side === -1 ? leftArm : rightArm
    return (
      <group
        key={`arm-${side}`}
        ref={ref}
        position={[side * (shoulderW / 2 - 0.012), shoulderY - 0.035, 0]}
        rotation={[0, 0, side * 0.05]}
      >
        <mesh position={[0, -armL / 2, 0]} castShadow>
          <capsuleGeometry args={[0.042, armL * 0.8, 6, 12]} />
          <meshStandardMaterial color={skinTone} roughness={0.74} />
        </mesh>
        <mesh position={[0, -armL, 0.004]}>
          <sphereGeometry args={[0.046, 16, 12]} />
          <meshStandardMaterial color={skinTone} roughness={0.74} />
        </mesh>
        {sleeveItem && (
          <mesh position={[0, -armL * 0.34, 0]}>
            <cylinderGeometry
              args={[
                sleeveItem.slot === 'outerwear' ? 0.076 : 0.064,
                0.056,
                armL * (sleeveItem.slot === 'outerwear' ? 0.7 : 0.44),
                16,
                1,
                true,
              ]}
            />
            <FabricMaterial
              colour={
                sleeveItem.components?.sleeves?.color ??
                sleeveItem.components?.body?.color ??
                sleeveItem.garment.default_color
              }
              pattern={sleeveItem.components?.sleeves?.pattern ?? sleeveItem.components?.body?.pattern}
            />
          </mesh>
        )}
        {bySlot.watch && side === 1 && (
          <group position={[0, -armL * 0.9, 0]}>
            <WristWatch item={bySlot.watch} />
          </group>
        )}
      </group>
    )
  }

  return (
    <group ref={root}>
      {renderLeg(-1)}
      {renderLeg(1)}

      {/* pelvis */}
      <mesh position={[0, hipY + 0.015, 0]} scale={[1, 0.62, hipD / hipW]} castShadow>
        <sphereGeometry args={[hipW / 2, 24, 18]} />
        <meshStandardMaterial color={skinTone} roughness={0.74} />
      </mesh>

      {/* torso */}
      <mesh
        position={[0, hipY + torso * 0.46, 0]}
        scale={[1, 1, chestD / Math.max(chestW, 0.01)]}
        castShadow
      >
        <cylinderGeometry args={[chestW / 2 - 0.006, waistW / 2, torso - 0.02, 26, 1, true]} />
        <meshStandardMaterial color={skinTone} roughness={0.74} side={THREE.DoubleSide} />
      </mesh>

      {/* neck + head */}
      <mesh position={[0, shoulderY + 0.03, 0]}>
        <cylinderGeometry args={[0.048, 0.052, 0.09, 16]} />
        <meshStandardMaterial color={skinTone} roughness={0.74} />
      </mesh>
      <mesh position={[0, headY, 0]} scale={[0.92, 1, 0.9]} castShadow>
        <sphereGeometry args={[headH / 2, 26, 22]} />
        <meshStandardMaterial color={skinTone} roughness={0.68} />
      </mesh>
      <mesh position={[0, headY + headH * 0.08, -0.008]} scale={[1.02, 0.94, 1.03]}>
        <sphereGeometry args={[headH / 2 + 0.003, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={hairColor} roughness={0.92} />
      </mesh>
      {hairStyle === 'bun' && (
        <mesh position={[0, headY + headH * 0.34, -headH * 0.4]}>
          <sphereGeometry args={[headH * 0.19, 16, 14]} />
          <meshStandardMaterial color={hairColor} roughness={0.92} />
        </mesh>
      )}
      {hairStyle === 'long' && (
        <mesh position={[0, headY - headH * 0.2, -headH * 0.3]} scale={[0.85, 1.5, 0.45]}>
          <sphereGeometry args={[headH * 0.42, 18, 16]} />
          <meshStandardMaterial color={hairColor} roughness={0.94} />
        </mesh>
      )}
      {hairStyle === 'braid' && (
        <mesh position={[0, headY - headH * 0.4, -headH * 0.28]} rotation={[0.12, 0, 0]}>
          <capsuleGeometry args={[headH * 0.09, headH * 0.85, 6, 10]} />
          <meshStandardMaterial color={hairColor} roughness={0.94} />
        </mesh>
      )}
      {hairStyle === 'curly' && (
        <group>
          {[-0.07, 0, 0.07].map((offset, index) => (
            <mesh key={index} position={[offset, headY + headH * 0.3, -headH * 0.16]}>
              <sphereGeometry args={[headH * 0.22, 12, 10]} />
              <meshStandardMaterial color={hairColor} roughness={0.96} />
            </mesh>
          ))}
        </group>
      )}

      {renderArm(-1)}
      {renderArm(1)}

      {bySlot.top && <TorsoGarment item={bySlot.top} dimensions={dimensions} />}
      {bySlot.dress && <TorsoGarment item={bySlot.dress} dimensions={dimensions} />}
      {bySlot.outerwear && <TorsoGarment item={bySlot.outerwear} dimensions={dimensions} />}
      {bySlot.bottom && <TorsoGarment item={bySlot.bottom} dimensions={dimensions} />}
      {bySlot.bag && <AccessoryGarment item={bySlot.bag} dimensions={dimensions} />}
      {bySlot.accessory && <AccessoryGarment item={bySlot.accessory} dimensions={dimensions} />}
      {bySlot.headwear && <AccessoryGarment item={bySlot.headwear} dimensions={dimensions} />}
    </group>
  )
}
