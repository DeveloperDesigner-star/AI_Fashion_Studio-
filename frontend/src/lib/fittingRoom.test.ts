import { describe, expect, it } from 'vitest'
import {
  CAMERA_PRESETS,
  PIECE_MESHES,
  RIGGED_MODELS,
  RIG_ANIMATIONS,
  ROLE_DEFAULT_COLORS,
  animationMeta,
  cameraPreset,
  hairMeshForStyle,
  isSampleSupported,
  lookFromItems,
  lookSummary,
  materialRoleForMesh,
  normaliseHexColor,
  pieceForMesh,
  proportionPlan,
  renderQuality,
  rigForAvatar,
  roleColor,
  viewportMode,
  type LookPiece,
} from '@/lib/fittingRoom'
import type { FittingItem } from '@/stores/studioStore'
import type { Avatar, AvatarParameters, Garment } from '@/lib/types'

const garment = (overrides: Partial<Garment> = {}): Garment =>
  ({
    id: 'garment',
    slug: 'garment',
    name: 'Kameez',
    slot: 'top',
    category: 'kameez',
    gender: 'womenswear',
    silhouette: 'straight',
    default_color: '#8d4f43',
    palette: { primary: '#8d4f43' },
    components: [],
    ...overrides,
  }) as unknown as Garment

const item = (overrides: Partial<FittingItem> & { garment?: Garment } = {}): FittingItem => ({
  key: `${overrides.garment?.id ?? 'garment'}:base`,
  slot: overrides.slot ?? 'top',
  garment: overrides.garment ?? garment(),
  designId: null,
  designName: null,
  components: {},
  ...overrides,
})

const findPiece = (pieces: LookPiece[], id: LookPiece['id']) => pieces.find((piece) => piece.id === id)

describe('rigged avatar selection', () => {
  it('uses the saved presentation first, then the base model', () => {
    const avatar = (presentation: Avatar['gender_presentation'], base_model: string) =>
      ({ gender_presentation: presentation, base_model }) as Avatar
    expect(rigForAvatar(avatar('feminine', 'atlas'))).toBe('female')
    expect(rigForAvatar(avatar('masculine', 'willow'))).toBe('male')
    expect(rigForAvatar(avatar('neutral', 'atlas'))).toBe('male')
    expect(rigForAvatar(avatar('neutral', 'curve'))).toBe('female')
    expect(rigForAvatar(null, 'menswear')).toBe('male')
    expect(rigForAvatar(null, 'womenswear')).toBe('female')
  })

  it('exposes only allowlisted, bundled rigs', () => {
    expect(Object.keys(RIGGED_MODELS).sort()).toEqual(['female', 'male'])
    for (const model of Object.values(RIGGED_MODELS)) {
      expect(model.file.startsWith('/models/rig/')).toBe(true)
      expect(model.file.endsWith('.glb')).toBe(true)
      expect(model.bones).toBe(19)
      expect(model.triangles).toBeLessThan(12000)
    }
  })
})

describe('catalogue → authored sample wardrobe', () => {
  it('maps a full outfit and the saved design colours', () => {
    const top = item({
      key: 'top:design-1',
      slot: 'top',
      garment: garment({
        id: 'kameez',
        name: 'Layered kameez',
        components: [
          { id: 'kameez_front', label: 'Front', fabrics: [], allows_print: true, kind: 'front_panel' },
          { id: 'sleeves', label: 'Sleeves', fabrics: [], allows_print: true, kind: 'sleeve' },
        ],
      }),
      components: {
        kameez_front: { color: '#1a2b3c', fabric: 'cotton', pattern: 'solid', embroidery: 'none' },
        sleeves: { color: '#445566', fabric: 'cotton', pattern: 'solid', embroidery: 'none' },
      },
    })
    const bottom = item({
      key: 'bottom:base',
      slot: 'bottom',
      garment: garment({ id: 'shalwar', name: 'Pleated shalwar', slot: 'bottom', default_color: '#abcdef' }),
    })
    const shoes = item({
      key: 'shoes:base',
      slot: 'footwear',
      garment: garment({ id: 'shoes', name: 'Khussa', slot: 'footwear', default_color: '#221100' }),
    })
    const scarf = item({
      key: 'scarf:base',
      slot: 'accessory',
      garment: garment({ id: 'scarf', name: 'Silk dupatta', slot: 'accessory', category: 'dupatta' }),
    })

    const look = lookFromItems([top, bottom, shoes, scarf])
    expect(look.pieceIds).toEqual(['top', 'bottom', 'footwear', 'dupatta'])
    expect(look.colors.top).toBe('#1a2b3c')
    expect(look.colors.sleeves).toBe('#445566')
    expect(look.colors.bottom).toBe('#abcdef')
    expect(look.colors.footwear).toBe('#221100')
    expect(look.bodyHidden).toEqual(['body_torso', 'body_leg_l', 'body_leg_r'])
    expect(look.unsupported).toEqual([])
    expect(findPiece(look.pieces, 'top')?.accent).toBe('#445566')
    expect(lookSummary(look)).toContain('Kameez / kurta')
  })

  it('never claims a fitted sample for unsupported accessories or headwear', () => {
    const belt = item({
      slot: 'accessory',
      garment: garment({ id: 'belt', name: 'Leather belt', slot: 'accessory', category: 'belt' }),
    })
    const veil = item({
      slot: 'headwear',
      garment: garment({ id: 'veil', name: 'Veil', slot: 'headwear', category: 'veil' }),
    })
    expect(isSampleSupported(belt)).toBe(false)
    expect(isSampleSupported(veil)).toBe(false)
    const look = lookFromItems([belt, veil])
    expect(look.pieces).toHaveLength(0)
    expect(look.unsupported.map((entry) => entry.slot)).toEqual(['accessory', 'headwear'])
    expect(look.unsupported[0].reason).toContain('No fitted 3D sample')
    expect(lookSummary(look)).toBe('Undressed sample mannequin')
  })

  it('supports headwear only for genuinely fitted cap-like pieces', () => {
    const cap = item({
      slot: 'headwear',
      garment: garment({ id: 'cap', name: 'Cotton cap', slot: 'headwear', category: 'caps' }),
    })
    expect(isSampleSupported(cap)).toBe(true)
    expect(lookFromItems([cap]).pieceIds).toEqual(['cap'])
  })

  it('keeps one authored silhouette per piece', () => {
    const first = item({ key: 'a:base', slot: 'outerwear', garment: garment({ id: 'a', slot: 'outerwear' }) })
    const second = item({ key: 'b:base', slot: 'outerwear', garment: garment({ id: 'b', slot: 'outerwear' }) })
    const look = lookFromItems([first, second])
    expect(look.pieces).toHaveLength(1)
    expect(look.pieces[0].itemKey).toBe('a:base')
  })

  it('requires a worn top or bottom before hiding body meshes', () => {
    expect(lookFromItems([]).bodyHidden).toEqual([])
    const shoes = item({ slot: 'footwear', garment: garment({ slot: 'footwear' }) })
    expect(lookFromItems([shoes]).bodyHidden).toEqual([])
  })
})

describe('colour mapping', () => {
  it('accepts only real hex colours and expands short notation', () => {
    expect(normaliseHexColor('#abc', '#000000')).toBe('#aabbcc')
    expect(normaliseHexColor('  #AABBCC ', '#000000')).toBe('#aabbcc')
    expect(normaliseHexColor('red', '#000000')).toBe('#000000')
    expect(normaliseHexColor(null, '#123456')).toBe('#123456')
  })

  it('falls back to the garment colour and the role default', () => {
    const bare = item({ garment: garment({ default_color: '#010203', palette: {} }) })
    expect(roleColor(bare, 'top')).toBe('#010203')
    const broken = item({ garment: garment({ default_color: 'not-a-colour', palette: {} }) })
    expect(roleColor(broken, 'top')).toBe(ROLE_DEFAULT_COLORS.top)
  })

  it('maps by component kind when the template uses different component ids', () => {
    const dress = item({
      slot: 'dress',
      garment: garment({
        slot: 'dress',
        default_color: '#ffffff',
        components: [
          { id: 'bodice', label: 'Bodice', fabrics: [], allows_print: true, kind: 'bodice_front' },
          { id: 'sleeve_panel', label: 'Sleeve', fabrics: [], allows_print: true, kind: 'sleeve' },
        ],
      }),
      components: {
        bodice: { color: '#122334', fabric: 'silk', pattern: 'solid', embroidery: 'none' },
        sleeve_panel: { color: '#455667', fabric: 'silk', pattern: 'solid', embroidery: 'none' },
      },
    })
    expect(roleColor(dress, 'top')).toBe('#122334')
    expect(roleColor(dress, 'sleeves')).toBe('#455667')
  })
})

describe('supported body proportions', () => {
  const parameters = {
    height_m: 1.8,
    chest_width: 0.31,
    waist_width: 0.26,
    hip_width: 0.33,
    shoulder_width: 0.45,
  } as AvatarParameters

  it('is neutral for a neutral avatar', () => {
    expect(proportionPlan(null, null)).toMatchObject({
      scale: [1, 1, 1],
      torso: 1,
      leg: 1,
    })
  })

  it('combines measurements and manual adjustments inside safe ranges', () => {
    const plan = proportionPlan(parameters, { height: 1.04, build: 1.08, shoulder: 1.1, torso: 1.05, leg: 0.95 })
    expect(plan.height).toBeGreaterThan(1)
    expect(plan.build).toBeGreaterThan(1)
    expect(plan.shoulder).toBeGreaterThanOrEqual(1.1)
    expect(plan.scale[1]).toBe(plan.height)
    expect(plan.scale[0]).toBeGreaterThan(plan.build)
    expect(plan.torso).toBe(1.05)
    expect(plan.leg).toBe(0.95)
  })

  it('clamps outlier adjustments instead of distorting the rig', () => {
    const tall = proportionPlan({ ...parameters, height_m: 2.6, chest_width: 1.2 }, {
      height: 1.4,
      build: 1.5,
      shoulder: 0.4,
      torso: 1.4,
      leg: 0.4,
    })
    expect(tall.height).toBeLessThanOrEqual(1.14)
    expect(tall.build).toBeLessThanOrEqual(1.14)
    expect(tall.shoulder).toBeGreaterThanOrEqual(0.88)
    expect(tall.torso).toBe(1.05)
    expect(tall.leg).toBe(0.95)
  })
})

describe('camera, motion and mesh registry', () => {
  it('offers front, three-quarter, side and back presets plus a reset', () => {
    expect(CAMERA_PRESETS.map((preset) => preset.id)).toEqual(['front', 'three-quarter', 'side', 'back'])
    expect(cameraPreset('front')?.position[2]).toBeGreaterThan(3)
    expect(cameraPreset('back')?.position[2]).toBeLessThan(0)
    expect(cameraPreset('free')).toBeNull()
  })

  it('registers idle, walk and turn clips with a non-looping turn', () => {
    expect(RIG_ANIMATIONS.map((entry) => entry.id)).toEqual(['idle', 'walk', 'turn'])
    expect(animationMeta('walk').loop).toBe(true)
    expect(animationMeta('turn').loop).toBe(false)
    expect(animationMeta('unknown').id).toBe('idle')
    expect(animationMeta('walk').description).toContain('footwear')
  })

  it('maps the authored meshes to pieces and materials', () => {
    expect(PIECE_MESHES.top).toContain('garment_sleeve_l')
    expect(pieceForMesh('garment_bottom_r')).toBe('bottom')
    expect(pieceForMesh('footwear_l')).toBe('footwear')
    expect(pieceForMesh('body_torso')).toBeNull()
    expect(materialRoleForMesh('garment_sleeve_r')).toBe('sleeves')
    expect(materialRoleForMesh('accessory_watch_l')).toBe('watch')
    expect(materialRoleForMesh('unknown')).toBeNull()
  })

  it('maps saved hair styles onto the three authored hair meshes', () => {
    expect(hairMeshForStyle('bun')).toBe('hair_bun')
    expect(hairMeshForStyle('long')).toBe('hair_long')
    expect(hairMeshForStyle('braid')).toBe('hair_long')
    expect(hairMeshForStyle('curly')).toBe('hair_short')
    expect(hairMeshForStyle('short')).toBe('hair_short')
    expect(hairMeshForStyle('bald')).toBeNull()
  })
})

describe('responsive and device quality rules', () => {
  it('uses compact controls below 640px', () => {
    expect(viewportMode(390)).toBe('compact')
    expect(viewportMode(640)).toBe('regular')
    expect(viewportMode(1440)).toBe('regular')
  })

  it('reduces pixel ratio and effects on mobile while keeping animation', () => {
    expect(renderQuality(true)).toEqual({ dpr: [1, 1.5], antialias: false, contactShadows: false })
    expect(renderQuality(false)).toEqual({ dpr: [1, 2], antialias: true, contactShadows: true })
  })
})
