/**
 * Product mockup registry.
 *
 * Each entry is a photographed blank garment plus the geometry that makes it a
 * *product*: where artwork may legally land, how large that area really is in
 * centimetres, and what the fabric is. The print area is a quad, not a
 * rectangle, because a printable region on a garment is rarely axis-aligned —
 * a tapered body or a sleeve needs four independent corners.
 *
 * Provenance: the photographs are original blank-garment renders produced for
 * this project. They are demonstration assets, not photographs of a physical
 * sample, and the interface says so. See docs/MOCKUPS.md.
 */

export type MockupViewKind = 'front' | 'back' | 'left_sleeve' | 'right_sleeve' | 'chest'

export type FabricKind = 'cotton' | 'fleece' | 'pique' | 'poplin' | 'twill' | 'canvas' | 'jersey'

export interface Vec2 {
  x: number
  y: number
}

export interface PrintQuad {
  topLeft: Vec2
  topRight: Vec2
  bottomRight: Vec2
  bottomLeft: Vec2
}

export interface MockupView {
  /** Stable key used in saved designs and URLs. */
  key: string
  label: string
  view: MockupViewKind
  src: string
  /** Natural pixel size, needed for the canvas and for layout stability. */
  width: number
  height: number
  /** Normalised 0–1 printable region. */
  printArea: PrintQuad
  /** Physical maximum of the printable region on this blank. */
  maxPrintCm: { width: number; height: number }
  fabric: FabricKind
}

export interface ProductMockup {
  id: string
  label: string
  /** The blank colourway actually rendered. */
  blank: string
  swatch: string
  views: MockupView[]
}

const W = 800
const H = 1000

function view(
  key: string,
  label: string,
  kind: MockupViewKind,
  src: string,
  box: [number, number, number, number],
  maxPrintCm: { width: number; height: number },
  fabric: FabricKind,
  taper = 0,
): MockupView {
  const [x1, y1, x2, y2] = box
  return {
    key,
    label,
    view: kind,
    src,
    width: W,
    height: H,
    printArea: {
      topLeft: { x: x1 + taper, y: y1 },
      topRight: { x: x2 - taper, y: y1 },
      bottomRight: { x: x2, y: y2 },
      bottomLeft: { x: x1, y: y2 },
    },
    maxPrintCm,
    fabric,
  }
}

export const MOCKUPS: Record<string, ProductMockup> = {
  tee: {
    id: 'tee',
    label: 'Heavyweight cotton tee',
    blank: 'Optic white',
    swatch: '#f4f2ee',
    views: [
      view('front', 'Front', 'front', '/mockups/tee-front-white.jpg', [0.335, 0.285, 0.665, 0.625], {
        width: 30,
        height: 40,
      }, 'cotton'),
      view('back', 'Back', 'back', '/mockups/tee-back-white.jpg', [0.335, 0.275, 0.665, 0.625], {
        width: 30,
        height: 42,
      }, 'cotton'),
    ],
  },
  'womens-tee': {
    id: 'womens-tee',
    label: "Women's fitted tee",
    blank: 'Optic white',
    swatch: '#f6f4f0',
    views: [
      view(
        'front',
        'Front',
        'front',
        '/mockups/womens-tee-front-white.jpg',
        [0.345, 0.29, 0.655, 0.615],
        { width: 26, height: 38 },
        'jersey',
        0.008,
      ),
    ],
  },
  'kids-tee': {
    id: 'kids-tee',
    label: "Children's tee",
    blank: 'Optic white',
    swatch: '#f7f5f2',
    views: [
      view('front', 'Front', 'front', '/mockups/kids-tee-front-white.jpg', [0.36, 0.305, 0.64, 0.605], {
        width: 22,
        height: 28,
      }, 'jersey'),
    ],
  },
  hoodie: {
    id: 'hoodie',
    label: 'Fleece pullover hoodie',
    blank: 'Natural ivory',
    swatch: '#f0ebe1',
    views: [
      view('front', 'Front', 'front', '/mockups/hoodie-front-white.jpg', [0.365, 0.305, 0.635, 0.555], {
        width: 28,
        height: 34,
      }, 'fleece'),
    ],
  },
  sweatshirt: {
    id: 'sweatshirt',
    label: 'Crewneck sweatshirt',
    blank: 'Natural ivory',
    swatch: '#efeae0',
    views: [
      view(
        'front',
        'Front',
        'front',
        '/mockups/sweatshirt-front-white.jpg',
        [0.345, 0.295, 0.655, 0.58],
        { width: 28, height: 34 },
        'fleece',
      ),
    ],
  },
  polo: {
    id: 'polo',
    label: 'Piqué cotton polo',
    blank: 'Off-white cream',
    swatch: '#f2eee3',
    views: [
      view('front', 'Front', 'front', '/mockups/polo-front-white.jpg', [0.335, 0.285, 0.665, 0.59], {
        width: 26,
        height: 34,
      }, 'pique'),
    ],
  },
  shirt: {
    id: 'shirt',
    label: 'Cotton poplin shirt',
    blank: 'Warm ivory',
    swatch: '#f3efe4',
    views: [
      view('front', 'Front', 'front', '/mockups/shirt-front-white.jpg', [0.34, 0.295, 0.66, 0.6], {
        width: 26,
        height: 36,
      }, 'poplin'),
    ],
  },
  kurta: {
    id: 'kurta',
    label: 'Straight-cut kurta',
    blank: 'Warm ivory',
    swatch: '#efe8d9',
    views: [
      view('front', 'Front', 'front', '/mockups/kurta-front-ivory.jpg', [0.35, 0.28, 0.65, 0.6], {
        width: 26,
        height: 40,
      }, 'cotton'),
    ],
  },
  jacket: {
    id: 'jacket',
    label: 'Cotton twill jacket',
    blank: 'Stone',
    swatch: '#cdc3ae',
    views: [
      view('front', 'Front', 'front', '/mockups/jacket-front-stone.jpg', [0.34, 0.29, 0.66, 0.6], {
        width: 26,
        height: 34,
      }, 'twill'),
    ],
  },
}

/** Category → mockup, resolved per department. */
const CATEGORY_MOCKUP: Record<string, string> = {
  tshirt: 'tee',
  tee: 'tee',
  sweatshirt: 'sweatshirt',
  sweater: 'sweatshirt',
  knitwear: 'sweatshirt',
  hoodie: 'hoodie',
  polo: 'polo',
  shirt: 'shirt',
  top: 'womens-tee',
  kurti: 'kurta',
  tunic: 'kurta',
  kurta: 'kurta',
  kurta_pajama: 'kurta',
  shalwar_kameez: 'kurta',
  jacket: 'jacket',
  blazer: 'jacket',
  coat: 'jacket',
  suit: 'jacket',
  waistcoat: 'jacket',
  sherwani: 'jacket',
  kids: 'kids-tee',
  childrenswear: 'kids-tee',
}

const WOMENS_ONLY = new Set(['top', 'kurti', 'dress', 'maxi_dress', 'frock', 'gown'])

export interface MockupTarget {
  category: string
  gender?: string
}

/**
 * The best photographed blank for a product, or null when no honest photograph
 * exists for that category (the caller then shows a flat design preview rather
 * than a stand-in photograph).
 */
export function resolveMockup(target: MockupTarget): ProductMockup | null {
  const key = CATEGORY_MOCKUP[target.category]
  if (key) {
    if (key === 'tee' && target.gender === 'womenswear') return MOCKUPS['womens-tee']
    return MOCKUPS[key] ?? null
  }
  if (target.category === 'dress' && WOMENS_ONLY.has(target.category)) return null
  return null
}

export function primaryView(mockup: ProductMockup | null): MockupView | null {
  return mockup?.views[0] ?? null
}

/** Axis-aligned bounds of a quad, useful for layout and hit-testing. */
export function quadBounds(quad: PrintQuad): {
  x: number
  y: number
  width: number
  height: number
} {
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x]
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Point-in-quad test used to keep dragged artwork inside the printable region. */
export function pointInQuad(point: Vec2, quad: PrintQuad): boolean {
  const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
  let inside = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i]
    const b = corners[j]
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

/**
 * Fit an artwork box of a given aspect ratio inside the printable area, leaving
 * a margin. Returns normalised width/height/centre within the quad's bounds.
 */
export function fitInsidePrintArea(
  quad: PrintQuad,
  aspect: number,
  margin = 0.06,
): { width: number; height: number; cx: number; cy: number } {
  const bounds = quadBounds(quad)
  const availableW = bounds.width * (1 - margin * 2)
  const availableH = bounds.height * (1 - margin * 2)
  let width = availableW
  let height = width / aspect
  if (height > availableH) {
    height = availableH
    width = height * aspect
  }
  return {
    width,
    height,
    cx: bounds.x + bounds.width / 2,
    cy: bounds.y + bounds.height / 2,
  }
}

/** Human-readable print size for a view, e.g. "30 × 40 cm". */
export function printSizeLabel(mockupView: MockupView): string {
  const { width, height } = mockupView.maxPrintCm
  return `${width} × ${height} cm`
}

export const NO_SUPPLIER_NOTE =
  'Rendered preview. Production colour and placement are confirmed by the print partner before manufacturing.'
