/**
 * Fitting-room rules shared by the 3D viewport, the wardrobe rail and tests.
 *
 * The rigged avatars ship with a small **authored sample wardrobe**. Catalogue
 * slots are mapped onto those silhouettes and the saved design colours are
 * applied per mapped material. This is deliberately not a garment auto-fit
 * system: a catalogue T-shirt does not become a fitted 3D T-shirt. The UI must
 * always describe the result as a fitted sample silhouette.
 */
import type { Avatar, AvatarAdjustments, AvatarParameters } from '@/lib/types'
import type { FittingItem } from '@/stores/studioStore'
import { measurementMultipliers } from '@/lib/avatarStudio'

export type RigId = 'female' | 'male'

export interface RiggedModel {
  id: RigId
  label: string
  presentation: 'feminine' | 'masculine'
  file: string
  bones: number
  triangles: number
  bytes: number
}

/**
 * Allowlist of bundled assets. No URL from the API is ever loaded as a model.
 * Keep in sync with `scripts/build_rigged_avatars.py` and
 * `public/models/rig/rigged-models.json` (there is a unit test for the drift).
 */
export const RIGGED_MODELS: Record<RigId, RiggedModel> = {
  female: {
    id: 'female',
    label: 'Atelier female',
    presentation: 'feminine',
    file: '/models/rig/rigged-female.glb',
    bones: 19,
    triangles: 6664,
    bytes: 296400,
  },
  male: {
    id: 'male',
    label: 'Atelier male',
    presentation: 'masculine',
    file: '/models/rig/rigged-male.glb',
    bones: 19,
    triangles: 6216,
    bytes: 281840,
  },
}

export const RIGGED_MANIFEST = '/models/rig/rigged-models.json'

export type RigAnimationId = 'idle' | 'walk' | 'turn'

export interface RigAnimation {
  id: RigAnimationId
  label: string
  shortLabel: string
  loop: boolean
  description: string
}

export const RIG_ANIMATIONS: RigAnimation[] = [
  {
    id: 'idle',
    label: 'Idle stand',
    shortLabel: 'Idle',
    loop: true,
    description: 'Relaxed breathing and a slow weight shift.',
  },
  {
    id: 'walk',
    label: 'Walk the look',
    shortLabel: 'Walk',
    loop: true,
    description: 'In-place walk cycle — outfit, sleeves and footwear move with the rig.',
  },
  {
    id: 'turn',
    label: 'Turn on the spot',
    shortLabel: 'Turn',
    loop: false,
    description: 'A slow pivot that returns to the front.',
  },
]

export function animationMeta(id: string): RigAnimation {
  return RIG_ANIMATIONS.find((entry) => entry.id === id) ?? RIG_ANIMATIONS[0]
}

export type ViewId = 'front' | 'three-quarter' | 'side' | 'back' | 'free'

export interface CameraPreset {
  id: Exclude<ViewId, 'free'>
  label: string
  position: [number, number, number]
  target: [number, number, number]
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'front', label: 'Front', position: [0, 1.16, 3.85], target: [0, 0.98, 0] },
  { id: 'three-quarter', label: '3/4', position: [2.35, 1.34, 2.95], target: [0, 0.98, 0] },
  { id: 'side', label: 'Side', position: [3.75, 1.16, 0.28], target: [0, 0.98, 0] },
  { id: 'back', label: 'Back', position: [0, 1.16, -3.85], target: [0, 0.98, 0] },
]

export const RESET_CAMERA = CAMERA_PRESETS[0]

export function cameraPreset(view: ViewId): CameraPreset | null {
  return CAMERA_PRESETS.find((preset) => preset.id === view) ?? null
}

/** Presentation of the rig. Neutral avatars inherit the studio's chosen style. */
export function rigForAvatar(
  avatar: Pick<Avatar, 'gender_presentation' | 'base_model'> | null | undefined,
  fallbackStyle: string | null | undefined = 'womenswear',
): RigId {
  const presentation = avatar?.gender_presentation
  if (presentation === 'feminine') return 'female'
  if (presentation === 'masculine') return 'male'
  if (avatar?.base_model === 'atlas') return 'male'
  if (avatar?.base_model === 'willow' || avatar?.base_model === 'curve') return 'female'
  return fallbackStyle === 'menswear' ? 'male' : 'female'
}

export function riggedModel(rig: RigId): RiggedModel {
  return RIGGED_MODELS[rig]
}

export type MaterialRole =
  | 'skin'
  | 'hair'
  | 'top'
  | 'sleeves'
  | 'bottom'
  | 'outer'
  | 'dupatta'
  | 'footwear'
  | 'bag'
  | 'watch'
  | 'cap'

export const ROLE_DEFAULT_COLORS: Record<MaterialRole, string> = {
  skin: '#c99a76',
  hair: '#241c18',
  top: '#8d4f43',
  sleeves: '#8d4f43',
  bottom: '#e4dbc9',
  outer: '#3c423c',
  dupatta: '#c47a62',
  footwear: '#45352b',
  bag: '#7a5a38',
  watch: '#b89a60',
  cap: '#504e48',
}

export type PieceId = 'top' | 'bottom' | 'outer' | 'dupatta' | 'footwear' | 'bag' | 'watch' | 'cap'

/** Mesh names inside both rigged GLBs, grouped by the wardrobe piece. */
export const PIECE_MESHES: Record<PieceId, string[]> = {
  top: ['garment_top', 'garment_sleeve_l', 'garment_sleeve_r'],
  bottom: ['garment_bottom_l', 'garment_bottom_r'],
  outer: ['garment_outer'],
  dupatta: ['garment_dupatta'],
  footwear: ['footwear_l', 'footwear_r'],
  bag: ['accessory_bag'],
  watch: ['accessory_watch_l', 'accessory_watch_r'],
  cap: ['accessory_cap'],
}

export const PIECE_LABELS: Record<PieceId, string> = {
  top: 'Kameez / kurta sample',
  bottom: 'Shalwar / trouser sample',
  outer: 'Waistcoat sample',
  dupatta: 'Dupatta sample',
  footwear: 'Footwear sample',
  bag: 'Tote sample',
  watch: 'Watch band sample',
  cap: 'Cap sample',
}

/** Catalogue slot → authored sample silhouette. */
export const SLOT_TO_PIECE: Record<string, PieceId> = {
  top: 'top',
  dress: 'top',
  bottom: 'bottom',
  outerwear: 'outer',
  footwear: 'footwear',
  bag: 'bag',
  watch: 'watch',
  headwear: 'cap',
  accessory: 'dupatta',
}

export function pieceForMesh(meshName: string): PieceId | null {
  for (const [piece, meshes] of Object.entries(PIECE_MESHES) as [PieceId, string[]][]) {
    if (meshes.includes(meshName)) return piece
  }
  return null
}

/** Material slot for a mesh inside the rigged GLB. */
export function materialRoleForMesh(meshName: string): MaterialRole | null {
  if (meshName.startsWith('body_')) return 'skin'
  if (meshName.startsWith('hair_')) return 'hair'
  if (meshName === 'garment_top') return 'top'
  if (meshName.startsWith('garment_sleeve')) return 'sleeves'
  if (meshName.startsWith('garment_bottom')) return 'bottom'
  if (meshName === 'garment_outer') return 'outer'
  if (meshName === 'garment_dupatta') return 'dupatta'
  if (meshName.startsWith('footwear_')) return 'footwear'
  if (meshName === 'accessory_bag') return 'bag'
  if (meshName.startsWith('accessory_watch')) return 'watch'
  if (meshName === 'accessory_cap') return 'cap'
  return null
}

/** Which body meshes are hidden beneath a worn sample piece. */
export const BODY_HIDDEN_BY_PIECE: Partial<Record<PieceId, string[]>> = {
  top: ['body_torso'],
  bottom: ['body_leg_l', 'body_leg_r'],
}

export interface LookPiece {
  id: PieceId
  slot: string
  label: string
  garmentName: string
  itemKey: string
  color: string
  accent: string
}

export interface UnsupportedPiece {
  slot: string
  garmentName: string
  reason: string
}

export interface FittingLook {
  pieces: LookPiece[]
  pieceIds: PieceId[]
  colors: Partial<Record<MaterialRole, string>>
  bodyHidden: string[]
  unsupported: UnsupportedPiece[]
  /** Every visible piece is an authored silhouette, never an auto-fit claim. */
  fidelity: 'sample'
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function normaliseHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!HEX.test(trimmed)) return fallback
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase()
  }
  return trimmed.toLowerCase()
}

const ROLE_COMPONENT_IDS: Record<MaterialRole, string[]> = {
  skin: [],
  hair: [],
  top: [
    'kameez_front',
    'shirt_front',
    'kurta_front',
    'kurti_front',
    'bodice_front',
    'blouse_front',
    'choli_front',
    'saree_body',
    'top',
    'front',
  ],
  sleeves: ['sleeves', 'sleeve'],
  bottom: ['shalwar', 'pajama', 'trouser', 'trousers', 'skirt', 'lehenga_skirt', 'pants', 'bottom'],
  outer: ['jacket_front', 'coat_front', 'waistcoat_front', 'outer', 'jacket'],
  dupatta: ['dupatta', 'pallu', 'stole', 'scarf'],
  footwear: ['upper', 'shoe_upper', 'sole', 'footwear'],
  bag: ['body', 'bag_body', 'strap'],
  watch: ['strap', 'watch_strap', 'dial'],
  cap: ['crown', 'brim', 'cap_crown'],
}

const ROLE_COMPONENT_KINDS: Record<MaterialRole, string[]> = {
  skin: [],
  hair: [],
  top: ['front_panel', 'bodice_front', 'back_panel'],
  sleeves: ['sleeve'],
  bottom: ['trouser', 'skirt', 'pleats'],
  outer: ['outerwear', 'jacket', 'coat'],
  dupatta: ['dupatta'],
  footwear: ['shoe', 'footwear'],
  bag: ['bag'],
  watch: ['watch'],
  cap: ['headwear', 'cap'],
}

function componentEntries(item: FittingItem) {
  const custom = item.components ?? {}
  const definitions = item.garment.components ?? []
  return definitions.map((definition) => ({
    definition,
    customisation: custom[definition.id],
  }))
}

/** Colour of the mapped design component, falling back to the garment palette. */
export function roleColor(item: FittingItem, role: MaterialRole): string {
  const fallback = normaliseHexColor(
    item.garment.default_color ?? item.garment.palette?.primary,
    ROLE_DEFAULT_COLORS[role],
  )
  if (role === 'skin' || role === 'hair') return fallback
  const entries = componentEntries(item)
  const ids = ROLE_COMPONENT_IDS[role]
  const kinds = ROLE_COMPONENT_KINDS[role]

  for (const id of ids) {
    const entry = entries.find((candidate) => candidate.definition.id === id)
    const colour = entry?.customisation?.color
    if (colour) return normaliseHexColor(colour, fallback)
  }
  for (const kind of kinds) {
    const entry = entries.find((candidate) => candidate.definition.kind === kind)
    const colour = entry?.customisation?.color
    if (colour) return normaliseHexColor(colour, fallback)
  }
  const anyCustomised = entries.find((entry) => entry.customisation?.color)
  if (anyCustomised?.customisation?.color) {
    return normaliseHexColor(anyCustomised.customisation.color, fallback)
  }
  return fallback
}

/** Whether the authored sample wardrobe can stand in for this catalogue item. */
export function isSampleSupported(item: Pick<FittingItem, 'slot' | 'garment'>): boolean {
  const piece = SLOT_TO_PIECE[item.slot]
  if (!piece) return false
  const descriptor = `${item.garment.category ?? ''} ${item.garment.name ?? ''} ${item.garment.silhouette ?? ''}`.toLowerCase()
  if (item.slot === 'accessory') {
    return /dupatta|stole|scarf|shawl|wrap|saree|pallu|drape/.test(descriptor)
  }
  if (item.slot === 'headwear') {
    return /cap|hat|turban|topi|beanie|headband/.test(descriptor)
  }
  return true
}

function unsupportedReason(item: Pick<FittingItem, 'slot'>): string {
  if (item.slot === 'accessory') {
    return 'No fitted 3D sample for this accessory — 2D preview and technical pack only.'
  }
  if (item.slot === 'headwear') {
    return 'No fitted 3D sample for this headpiece — 2D preview and technical pack only.'
  }
  return 'This slot has no authored 3D sample.'
}

/**
 * Build the visible sample wardrobe from the outfit rail. The first supported
 * item per piece wins; the store already enforces slot exclusivity.
 */
export function lookFromItems(items: FittingItem[]): FittingLook {
  const pieces: LookPiece[] = []
  const colors: Partial<Record<MaterialRole, string>> = {}
  const bodyHidden = new Set<string>()
  const unsupported: UnsupportedPiece[] = []

  for (const item of items) {
    if (!isSampleSupported(item)) {
      unsupported.push({
        slot: item.slot,
        garmentName: item.garment.name,
        reason: unsupportedReason(item),
      })
      continue
    }
    const pieceId = SLOT_TO_PIECE[item.slot]
    if (pieces.some((piece) => piece.id === pieceId)) continue

    const primaryRole: MaterialRole =
      pieceId === 'top'
        ? 'top'
        : pieceId === 'bottom'
          ? 'bottom'
          : pieceId === 'footwear'
            ? 'footwear'
            : pieceId === 'bag'
              ? 'bag'
              : pieceId === 'watch'
                ? 'watch'
                : pieceId === 'cap'
                  ? 'cap'
                  : pieceId === 'outer'
                    ? 'outer'
                    : 'dupatta'

    const color = roleColor(item, primaryRole)
    const accent = pieceId === 'top' ? roleColor(item, 'sleeves') : color
    colors[primaryRole] = color
    if (pieceId === 'top') colors.sleeves = accent
    if (pieceId === 'dupatta') colors.dupatta = color

    for (const mesh of BODY_HIDDEN_BY_PIECE[pieceId] ?? []) bodyHidden.add(mesh)
    pieces.push({
      id: pieceId,
      slot: item.slot,
      label: PIECE_LABELS[pieceId],
      garmentName: item.garment.name,
      itemKey: item.key,
      color,
      accent,
    })
  }

  return {
    pieces,
    pieceIds: pieces.map((piece) => piece.id),
    colors,
    bodyHidden: [...bodyHidden],
    unsupported,
    fidelity: 'sample',
  }
}

export interface RigProportions {
  scale: [number, number, number]
  torso: number
  leg: number
  height: number
  build: number
  shoulder: number
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * Supported proportions. Height and build scale the whole skinned rig (so the
 * fitted wardrobe follows), while torso and leg length are applied to bone
 * offsets at runtime. Values are clamped to the same ranges as the avatar
 * studio so an outlier measurement cannot distort the figure.
 */
export function proportionPlan(
  parameters: AvatarParameters | null | undefined,
  adjustments?: Partial<AvatarAdjustments> | null,
): RigProportions {
  const measured = measurementMultipliers(parameters)
  const height = clamp((adjustments?.height ?? 1) * measured.height, 0.88, 1.14)
  const build = clamp((adjustments?.build ?? 1) * measured.build, 0.88, 1.14)
  const shoulder = clamp((adjustments?.shoulder ?? 1) * measured.shoulder, 0.88, 1.14)
  const width = build * (0.6 + 0.4 * shoulder)
  return {
    scale: [round(width), round(height), round(width)],
    torso: round(clamp(adjustments?.torso ?? 1, 0.95, 1.05)),
    leg: round(clamp(adjustments?.leg ?? 1, 0.95, 1.05)),
    height: round(height),
    build: round(build),
    shoulder: round(shoulder),
  }
}

export function hairMeshForStyle(style: string | null | undefined): string | null {
  const value = (style ?? 'short').toLowerCase()
  if (value === 'bald') return null
  if (value === 'bun') return 'hair_bun'
  if (value === 'long' || value === 'braid') return 'hair_long'
  return 'hair_short'
}

export function viewportMode(width: number): 'compact' | 'regular' {
  return width < 640 ? 'compact' : 'regular'
}

export interface RenderQuality {
  dpr: [number, number]
  antialias: boolean
  contactShadows: boolean
}

/** Mobile keeps the skinned animation but trims GPU cost. */
export function renderQuality(isMobile: boolean): RenderQuality {
  return isMobile
    ? { dpr: [1, 1.5], antialias: false, contactShadows: false }
    : { dpr: [1, 2], antialias: true, contactShadows: true }
}

export function isMobileViewport(width: number): boolean {
  return width < 768
}

export function lookSummary(look: FittingLook): string {
  if (look.pieces.length === 0) return 'Undressed sample mannequin'
  const labels = look.pieces.map((piece) => piece.label.replace(' sample', ''))
  return labels.join(' · ')
}
