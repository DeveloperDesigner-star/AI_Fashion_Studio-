import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GarmentArt } from '@/components/garment/GarmentArt'

/**
 * Every slot/silhouette pair currently seeded in the catalogue. Rendering each
 * one guards against a piece appearing blank when a new silhouette is added.
 */
const PAIRS: Array<[string, string]> = [
  ['accessory', 'belt'],
  ['accessory', 'jewellery'],
  ['accessory', 'scarf'],
  ['accessory', 'sunglasses'],
  ['bag', 'handbag'],
  ['bag', 'tote'],
  ['bottom', 'column'],
  ['bottom', 'jeans'],
  ['bottom', 'pleated'],
  ['bottom', 'wide_leg'],
  ['dress', 'frock'],
  ['dress', 'gown'],
  ['dress', 'kurta_pajama'],
  ['dress', 'lehenga'],
  ['dress', 'maxi'],
  ['dress', 'saree'],
  ['dress', 'shalwar_kameez'],
  ['dress', 'sherwani'],
  ['dress', 'shirt'],
  ['dress', 'slip'],
  ['footwear', 'boot'],
  ['footwear', 'derby'],
  ['footwear', 'flat'],
  ['footwear', 'heel'],
  ['footwear', 'khussa'],
  ['footwear', 'loafer'],
  ['footwear', 'pump'],
  ['footwear', 'sandal'],
  ['footwear', 'sneaker'],
  ['footwear', 'trail'],
  ['headwear', 'cap'],
  ['outerwear', 'blazer'],
  ['outerwear', 'bomber'],
  ['outerwear', 'chore'],
  ['outerwear', 'field'],
  ['outerwear', 'overcoat'],
  ['outerwear', 'puffer'],
  ['outerwear', 'suit'],
  ['outerwear', 'trench'],
  ['outerwear', 'waistcoat'],
  ['top', 'active'],
  ['top', 'camisole'],
  ['top', 'hoodie'],
  ['top', 'knit'],
  ['top', 'kurti'],
  ['top', 'shirt'],
  ['top', 'tshirt'],
  ['watch', 'dress_watch'],
  ['watch', 'field_watch'],
  ['watch', 'watch'],
]

const garment = (slot: string, silhouette: string) => ({
  name: `${silhouette} sample`,
  slot,
  silhouette,
  default_color: '#1f1d1a',
  palette: { primary: '#7c3b3f', secondary: '#c99a93', accent: '#e6d3b8' },
})

describe('GarmentArt', () => {
  it.each(PAIRS)('draws artwork for %s / %s', (slot, silhouette) => {
    const markup = renderToStaticMarkup(<GarmentArt garment={garment(slot, silhouette)} />)
    expect(markup).toContain('<svg')
    expect(markup).toContain('role="img"')
    const shapes = (markup.match(/<(path|rect|circle|ellipse)/g) ?? []).length
    expect(shapes).toBeGreaterThan(1)
  })

  it('applies component colours to the drawing', () => {
    const markup = renderToStaticMarkup(
      <GarmentArt
        garment={garment('top', 'shirt')}
        components={{
          body: { color: '#123456', fabric: 'cotton', pattern: 'solid', embroidery: 'none' },
        }}
      />,
    )
    expect(markup).toContain('#123456')
  })

  it('falls back to the palette when no colour is supplied', () => {
    const markup = renderToStaticMarkup(<GarmentArt garment={garment('dress', 'saree')} />)
    expect(markup).toContain('#7c3b3f')
  })
})
