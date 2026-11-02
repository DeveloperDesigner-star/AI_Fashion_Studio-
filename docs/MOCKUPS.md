# Product mockups

How product imagery works in AI Fashion Studio, what it is, and what it is not.

---

## What these images are

`frontend/public/mockups/*.jpg` are **original blank-garment renders produced for
this project**. They were generated specifically for AI Fashion Studio and carry no
third-party licence, no supplier claim and no copyrighted catalogue imagery.

They are **not** photographs of a physical sample, and the interface never implies
they are. Every surface that shows one is labelled *rendered garment preview*, and
product pages carry the line:

> Rendered garment preview, not a photograph of a physical sample. Production colour
> and placement are confirmed by the print partner before manufacturing.

## Why they exist

Before this change, every product image was drawn procedurally as SVG from the
catalogue's `silhouette` and `palette` columns (`GarmentArt.tsx`). That code is
original and license-clean, but it reads as illustration, not commerce — the single
largest reason the platform looked like a design exercise rather than a product
business.

The vector renderer is **kept** as the honest fallback: categories with no
photographed blank show a labelled *design preview* frame instead of substituting a
photograph of a different product.

## Current inventory

| Asset | Product | Views | Print area |
| --- | --- | --- | --- |
| `tee-front-white`, `tee-back-white` | Heavyweight cotton tee | front, back | 30 × 40 cm / 30 × 42 cm |
| `womens-tee-front-white` | Women's fitted tee | front | 26 × 38 cm |
| `kids-tee-front-white` | Children's tee | front | 22 × 28 cm |
| `hoodie-front-white` | Fleece pullover hoodie | front | 28 × 34 cm |
| `sweatshirt-front-white` | Crewneck sweatshirt | front | 28 × 34 cm |
| `polo-front-white` | Piqué cotton polo | front | 26 × 34 cm |
| `shirt-front-white` | Cotton poplin shirt | front | 26 × 36 cm |
| `kurta-front-ivory` | Straight-cut kurta | front | 26 × 40 cm |
| `jacket-front-stone` | Cotton twill jacket | front | 26 × 34 cm |

All assets are 800 × 1000, JPEG quality 82, progressive, between 29 kB and 56 kB —
about 400 kB in total for ten products, which is cheaper than a single hero image
on most commerce sites.

Not yet produced: caps, totes, bags, footwear, watches, scarves, dresses and
saree/lehenga shapes, plus back and sleeve views for the styles that only have a
front. Those categories currently fall back to the labelled design preview.

## Print geometry

Print areas live in `frontend/src/lib/mockups.ts`, normalised to the image, as a
**quad** — four independent corners — not a rectangle. A printable region on a
tapered body or a sleeve is not axis-aligned, and storing it as a rectangle would
make accurate placement impossible later.

```ts
printArea: {
  topLeft: { x: 0.335, y: 0.285 },
  topRight: { x: 0.665, y: 0.285 },
  bottomRight: { x: 0.665, y: 0.625 },
  bottomLeft: { x: 0.335, y: 0.625 },
}
```

Each view also carries `maxPrintCm`, the physical size of that area, so the editor
can validate artwork resolution rather than pretending any size prints well.

The geometry was verified visually rather than assumed: each quad was overlaid on
its photograph and inspected before being committed. `mockups.test.ts` asserts that
every view's quad stays inside the frame with a real printable size.

## Colourways

The blanks are rendered in a single colourway each (optic white, natural ivory,
stone). Colour selection is **not** faked by tinting the photograph — a believable
recolour needs a garment mask, and the automated masks were not accurate enough to
ship on these vignetted backgrounds.

Real colour variants are the correct fix: separate renders per colourway, generated
in Phase 5. Until then the interface names the blank that is actually shown
("Optic white") rather than offering swatches that would not change the image.

## Rules for adding an asset

1. Blank garment, front-on, symmetric, no print, no logo, no people, no mannequin.
2. Uniform seamless background with soft, even lighting.
3. 4:5 portrait framing with generous margin.
4. Add the asset, then measure the printable region by overlaying a quad on the
   photograph and looking at it — never by guessing from the frame.
5. Export at 800 × 1000, JPEG q82, progressive, and keep it under 60 kB.
6. Add a row to the inventory table above.
