/**
 * Pattern-piece geometry for the design studio.
 *
 * Each component kind is drawn as the shape a tailor would cut, laid out on a
 * 240×320 technical flat. The stage doubles as the coordinate space for
 * artwork layers, so what the customer positions is exactly what is saved and
 * re-rendered on reopen. All shapes are original vector work for this project.
 */

import type { Garment, GarmentComponent } from '@/lib/types'

export const STAGE = { width: 240, height: 320 } as const

export interface KindGeometry {
  /** SVG path data in stage coordinates. */
  paths: string[]
  /** Painting order on the stage (higher paints later). */
  z: number
  /** Extra transparency for drape/overlay pieces. */
  opacity?: number
  /** Use the even-odd rule for rings. */
  evenOdd?: boolean
}

export const KIND_GEOMETRY: Record<string, KindGeometry> = {
  front_panel: {
    paths: ['M74 66 Q120 50 166 66 L180 206 Q120 222 60 206 Z'],
    z: 30,
  },
  back_panel: {
    paths: ['M66 70 Q120 54 174 70 L186 212 Q120 228 54 212 Z'],
    z: 8,
    opacity: 0.92,
  },
  bodice_front: {
    paths: ['M80 70 Q120 58 160 70 L168 156 Q120 168 72 156 Z'],
    z: 30,
  },
  bodice_back: {
    paths: ['M74 74 Q120 62 166 74 L172 160 Q120 172 68 160 Z'],
    z: 8,
    opacity: 0.92,
  },
  sleeve: {
    paths: [
      'M62 72 Q40 96 44 138 L54 178 L76 170 L84 92 Z',
      'M178 72 Q200 96 196 138 L186 178 L164 170 L156 92 Z',
    ],
    z: 18,
  },
  neckline: {
    paths: ['M98 60 Q120 94 142 60 L148 70 Q120 108 92 70 Z'],
    z: 42,
  },
  collar: {
    paths: ['M101 56 Q120 46 139 56 L143 72 Q120 60 97 72 Z'],
    z: 44,
  },
  lapel: {
    paths: ['M104 64 L120 78 L114 132 L96 96 Z', 'M136 64 L120 78 L126 132 L144 96 Z'],
    z: 46,
  },
  cuff: {
    paths: ['M41 158 L67 152 L70 166 L43 172 Z', 'M199 158 L173 152 L170 166 L197 172 Z'],
    z: 47,
  },
  placket: {
    paths: ['M112 66 L128 66 L130 198 L110 198 Z'],
    z: 43,
  },
  pocket: {
    paths: ['M132 116 L160 116 L158 140 L134 140 Z'],
    z: 45,
  },
  border: {
    paths: [
      'M62 198 Q120 214 178 198 L180 214 Q120 230 60 214 Z',
      'M41 150 L68 145 L70 157 L43 162 Z',
      'M199 150 L172 145 L170 157 L197 162 Z',
    ],
    z: 48,
  },
  hem: {
    paths: ['M62 192 Q120 208 178 192 L178 204 Q120 220 62 204 Z'],
    z: 47,
  },
  skirt: {
    paths: ['M80 148 L160 148 L186 276 Q120 292 54 276 Z'],
    z: 25,
  },
  pleats: {
    paths: [
      'M90 152 L98 152 L86 280 L78 276 Z',
      'M110 152 L118 152 L112 284 L104 280 Z',
      'M130 152 L138 152 L136 284 L128 282 Z',
      'M150 152 L158 152 L162 278 L154 280 Z',
    ],
    z: 34,
    opacity: 0.75,
  },
  trouser: {
    paths: [
      'M86 206 L118 206 L114 302 L88 302 Z',
      'M122 206 L154 206 L152 302 L126 302 Z',
    ],
    z: 25,
  },
  waistband: {
    paths: ['M82 196 L158 196 L160 214 L80 214 Z'],
    z: 26,
  },
  dupatta: {
    paths: [
      'M42 62 Q96 34 152 52 Q170 60 166 78 Q120 90 72 78 Q52 72 42 62 Z',
      'M148 54 L180 66 L198 208 L172 232 L146 218 Z',
    ],
    z: 4,
    opacity: 0.92,
  },
  hood: {
    paths: ['M84 62 Q120 16 156 62 Q168 86 120 90 Q72 86 84 62 Z'],
    z: 36,
  },
  ribbing: {
    paths: [
      'M62 198 Q120 214 178 198 L178 210 Q120 226 62 210 Z',
      'M41 158 L67 152 L69 164 L43 170 Z',
      'M199 158 L173 152 L171 164 L197 170 Z',
    ],
    z: 49,
  },
  lining: {
    paths: ['M78 72 Q120 56 162 72 L174 204 Q120 220 66 204 Z'],
    z: 6,
    opacity: 0.65,
  },
  embroidery: {
    paths: [
      'M84 78 Q120 92 156 78 L154 102 Q120 116 86 102 Z',
      'M120 128 a7 7 0 1 0 0.1 0',
      'M120 156 a5 5 0 1 0 0.1 0',
    ],
    z: 46,
  },
  waistcoat_front: {
    paths: ['M78 68 L112 78 L108 196 L84 200 Z', 'M162 68 L128 78 L132 196 L156 200 Z'],
    z: 50,
  },
  waistcoat_back: {
    paths: ['M72 74 Q120 60 168 74 L174 198 Q120 214 66 198 Z'],
    z: 7,
    opacity: 0.92,
  },
  upper: {
    paths: ['M46 236 Q84 214 124 226 Q164 238 196 252 Q204 266 194 278 L56 278 Q36 262 46 236 Z'],
    z: 30,
  },
  sole: {
    paths: ['M44 272 Q120 292 198 274 L200 290 Q120 308 42 288 Z'],
    z: 20,
  },
  fastening: {
    paths: ['M100 244 L124 254 L100 264 L124 274 L108 278 L86 268 L112 256 L88 246 Z'],
    z: 45,
  },
  bag_body: {
    paths: ['M72 120 L168 120 L176 250 L64 250 Z'],
    z: 30,
  },
  strap: {
    paths: ['M84 124 Q120 58 156 124 L148 134 Q120 84 92 134 Z'],
    z: 20,
  },
  hardware: {
    paths: ['M106 128 L134 128 L134 150 L106 150 Z', 'M120 158 a10 10 0 1 0 0.1 0'],
    z: 45,
  },
  dial: {
    paths: ['M120 148 a38 38 0 1 0 0.1 0'],
    z: 34,
  },
  bezel: {
    paths: ['M120 106 a42 42 0 1 0 0.1 0 M120 118 a30 30 0 1 1 -0.1 0'],
    z: 40,
    evenOdd: true,
  },
  band: {
    paths: ['M36 148 L204 148 L204 180 L36 180 Z'],
    z: 20,
  },
  buckle: {
    paths: ['M100 146 L140 146 L140 182 L100 182 Z M110 154 L130 154 L130 174 L110 174 Z'],
    z: 45,
    evenOdd: true,
  },
  crown: {
    paths: ['M80 190 Q120 138 160 190 L160 206 L80 206 Z'],
    z: 30,
  },
  brim: {
    paths: ['M70 206 L190 206 Q206 220 188 234 L66 226 Z'],
    z: 26,
  },
  tassel: {
    paths: ['M112 66 L128 66 L132 118 L120 130 L108 118 Z', 'M110 130 L130 130 L134 176 L106 176 Z'],
    z: 45,
  },
  frame: {
    paths: ['M92 118 L148 118 Q158 118 158 128 L158 172 Q158 182 148 182 L92 182 Q82 182 82 172 L82 128 Q82 118 92 118 Z'],
    z: 26,
  },
  lens: {
    paths: ['M96 126 L144 126 L144 174 L96 174 Z'],
    z: 32,
    opacity: 0.8,
  },
  jewel_body: {
    paths: ['M96 150 Q120 116 144 150 Q120 202 96 150 Z'],
    z: 30,
  },
  stone: {
    paths: ['M120 158 a13 13 0 1 0 0.1 0'],
    z: 38,
  },
  generic: {
    paths: ['M78 90 L162 90 Q172 90 172 100 L172 220 Q172 230 162 230 L78 230 Q68 230 68 220 L68 100 Q68 90 78 90 Z'],
    z: 30,
  },
}

export interface StagePiece {
  component: GarmentComponent
  kind: string
  geometry: KindGeometry
  index: number
}

export function geometryFor(kind: string | undefined): KindGeometry {
  return KIND_GEOMETRY[kind ?? 'generic'] ?? KIND_GEOMETRY.generic
}

/** Paint order: kind z-index first, catalogue component order as tie-break. */
export function stagePieces(garment: Pick<Garment, 'components'>): StagePiece[] {
  return garment.components
    .map((component, index) => {
      const kind = component.kind ?? 'generic'
      return { component, kind, geometry: geometryFor(kind), index }
    })
    .sort((a, b) => {
      const delta = a.geometry.z - b.geometry.z
      return delta !== 0 ? delta : a.index - b.index
    })
}

/** Bounding box of all paths in stage coordinates (for thumbnails/exports). */
export const STAGE_VIEWBOX = `0 0 ${STAGE.width} ${STAGE.height}`
