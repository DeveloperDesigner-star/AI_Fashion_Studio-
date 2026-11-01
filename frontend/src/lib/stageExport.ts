/**
 * Flatten the design stage only when the customer exports.
 *
 * The live editor keeps every layer separate. To export, the SVG is cloned and
 * every private image is inlined as a data URL (an SVG loaded as an image is
 * not allowed to fetch external files), then rasterised on a canvas. The PNG is
 * uploaded as the design proof; the stored design itself stays layered.
 */

const MIME = 'image/svg+xml'

async function toDataUrl(href: string): Promise<string | null> {
  if (!href || href.startsWith('data:')) return href
  try {
    const response = await fetch(href, { credentials: 'include' })
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export interface RenderedStage {
  blob: Blob
  width: number
  height: number
}

export async function renderStagePng(
  svg: SVGSVGElement,
  options: { width?: number; height?: number; background?: string } = {},
): Promise<RenderedStage> {
  const width = options.width ?? 1200
  const height = options.height ?? 1600
  const background = options.background ?? '#f7f4ef'

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const images = Array.from(clone.querySelectorAll('image'))
  await Promise.all(
    images.map(async (image) => {
      const href = image.getAttribute('href') ?? image.getAttribute('xlink:href')
      if (!href) return
      const data = await toDataUrl(href)
      if (data) {
        image.setAttribute('href', data)
        image.setAttribute('xlink:href', data)
      } else {
        image.remove()
      }
    }),
  )

  const markup = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([markup], { type: MIME })
  const url = URL.createObjectURL(svgBlob)

  try {
    const image = new Image()
    image.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The design preview could not be rendered.'))
      image.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot export the design.')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('The design preview could not be encoded.'))
      }, 'image/png')
    })
    return { blob, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}
