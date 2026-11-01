/**
 * Procedural fabric patterns, drawn with the Canvas 2D API only.
 *
 * The same drawing code feeds the 3D fitting room (as a THREE texture) and the
 * 2D design studio (as an SVG pattern image), so a pattern always looks the
 * same everywhere. Nothing is downloaded and no third-party asset is used.
 */

const dataUrlCache = new Map<string, string>()

export function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(
    clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean,
    16,
  )
  if (Number.isNaN(value)) return hex
  const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)))
  const r = clamp(((value >> 16) & 255) + amount)
  const g = clamp(((value >> 8) & 255) + amount)
  const b = clamp((value & 255) + amount)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

function weave(ctx: CanvasRenderingContext2D, size: number, colour: string): void {
  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.strokeStyle = shade(colour, -70)
  ctx.lineWidth = 1
  for (let index = 0; index < size; index += 4) {
    ctx.beginPath()
    ctx.moveTo(0, index)
    ctx.lineTo(size, index)
    ctx.stroke()
  }
  ctx.globalAlpha = 0.03
  ctx.strokeStyle = '#ffffff'
  for (let index = 2; index < size; index += 4) {
    ctx.beginPath()
    ctx.moveTo(index, 0)
    ctx.lineTo(index, size)
    ctx.stroke()
  }
  ctx.restore()
}

function sequin(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  const gradient = ctx.createRadialGradient(x - radius / 3, y - radius / 3, 0, x, y, radius)
  gradient.addColorStop(0, '#fff6d8')
  gradient.addColorStop(0.55, '#d9ac52')
  gradient.addColorStop(1, '#8a6420')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draw one tile of `pattern` on a `size`×`size` canvas. The caller owns the
 * canvas and can reuse it for WebGL or convert it to a data URL.
 */
export function drawFabricPattern(
  ctx: CanvasRenderingContext2D,
  pattern: string,
  colour: string,
  size = 256,
): void {
  const base = colour
  const light = shade(colour, 58)
  const lighter = shade(colour, 96)
  const dark = shade(colour, -46)
  const deeper = shade(colour, -80)

  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  switch (pattern) {
    case 'stripes': {
      ctx.fillStyle = light
      for (let x = 0; x < size; x += 32) ctx.fillRect(x, 0, 12, size)
      break
    }
    case 'checks': {
      ctx.fillStyle = light
      for (let x = 0; x < size; x += 64) ctx.fillRect(x, 0, 28, size)
      for (let y = 0; y < size; y += 64) ctx.fillRect(0, y, size, 28)
      ctx.strokeStyle = dark
      ctx.lineWidth = 3
      for (let x = 0; x < size; x += 32) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, size)
        ctx.stroke()
      }
      break
    }
    case 'houndstooth': {
      ctx.fillStyle = light
      const step = 32
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          ctx.beginPath()
          if ((x / step + y / step) % 2 === 0) {
            ctx.moveTo(x, y)
            ctx.lineTo(x + step, y)
            ctx.lineTo(x, y + step)
          } else {
            ctx.moveTo(x + step, y)
            ctx.lineTo(x + step, y + step)
            ctx.lineTo(x, y + step)
          }
          ctx.closePath()
          ctx.fill()
        }
      }
      break
    }
    case 'polka': {
      ctx.fillStyle = light
      for (let y = 16; y < size; y += 48) {
        for (let x = 16; x < size; x += 48) {
          ctx.beginPath()
          ctx.arc(x + ((y / 48) % 2) * 12, y, 8, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    }
    case 'floral': {
      for (let y = 24; y < size; y += 64) {
        for (let x = 24; x < size; x += 64) {
          ctx.fillStyle = light
          for (let petal = 0; petal < 5; petal += 1) {
            const angle = (petal / 5) * Math.PI * 2
            ctx.beginPath()
            ctx.ellipse(
              x + Math.cos(angle) * 10,
              y + Math.sin(angle) * 10,
              7,
              4,
              angle,
              0,
              Math.PI * 2,
            )
            ctx.fill()
          }
          ctx.fillStyle = dark
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = shade(base, 22)
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(x + 8, y + 10)
          ctx.bezierCurveTo(x + 24, y + 20, x + 30, y + 34, x + 44, y + 40)
          ctx.stroke()
        }
      }
      break
    }
    case 'paisley': {
      ctx.strokeStyle = light
      ctx.lineWidth = 3
      for (let y = 20; y < size; y += 60) {
        for (let x = 20; x < size; x += 60) {
          ctx.beginPath()
          ctx.ellipse(x, y, 20, 12, 0.6, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = light
          ctx.beginPath()
          ctx.arc(x + 6, y + 4, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = dark
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(x - 4, y - 2, 11, 0.4, 3.4)
          ctx.stroke()
          ctx.strokeStyle = light
          ctx.lineWidth = 3
        }
      }
      break
    }
    case 'geometric': {
      ctx.fillStyle = light
      const step = 42
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          ctx.beginPath()
          ctx.moveTo(x, y + step)
          ctx.lineTo(x + step / 2, y)
          ctx.lineTo(x + step, y + step)
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.strokeStyle = dark
      ctx.lineWidth = 2
      for (let y = 0; y < size; y += step) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(size, y)
        ctx.stroke()
      }
      break
    }
    case 'animal': {
      ctx.fillStyle = light
      for (let index = 0; index < 22; index += 1) {
        const x = (index * 71) % size
        const y = (index * 43) % size
        ctx.beginPath()
        ctx.ellipse(x, y, 13, 7, (index * 0.7) % Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'gradient': {
      const gradient = ctx.createLinearGradient(0, 0, size, size)
      gradient.addColorStop(0, base)
      gradient.addColorStop(0.5, light)
      gradient.addColorStop(1, dark)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, size, size)
      break
    }
    case 'printed': {
      // A dense all-over print: alternating floral sprigs and tiny chevrons.
      const step = 48
      for (let y = 18; y < size; y += step) {
        for (let x = 18; x < size; x += step) {
          const alternate = (Math.round(x / step) + Math.round(y / step)) % 2 === 0
          if (alternate) {
            ctx.fillStyle = light
            for (let petal = 0; petal < 6; petal += 1) {
              const angle = (petal / 6) * Math.PI * 2
              ctx.beginPath()
              ctx.ellipse(
                x + Math.cos(angle) * 8,
                y + Math.sin(angle) * 8,
                5,
                3,
                angle,
                0,
                Math.PI * 2,
              )
              ctx.fill()
            }
            ctx.fillStyle = lighter
            ctx.beginPath()
            ctx.arc(x, y, 3, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.strokeStyle = dark
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(x - 8, y + 6)
            ctx.lineTo(x, y - 8)
            ctx.lineTo(x + 8, y + 6)
            ctx.stroke()
            ctx.fillStyle = light
            ctx.beginPath()
            ctx.arc(x, y + 12, 3, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      break
    }
    case 'traditional': {
      // Mughal-style jaal: a fine lattice with a boteh inside each cell.
      const cell = 64
      ctx.strokeStyle = light
      ctx.lineWidth = 1.6
      for (let y = 0; y <= size; y += cell) {
        for (let x = 0; x <= size; x += cell) {
          ctx.beginPath()
          ctx.moveTo(x, y + cell / 2)
          ctx.quadraticCurveTo(x + cell / 2, y, x + cell, y + cell / 2)
          ctx.quadraticCurveTo(x + cell / 2, y + cell, x, y + cell / 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x + cell / 2, y + cell / 2, 5, 0, Math.PI * 2)
          ctx.fillStyle = dark
          ctx.fill()
        }
      }
      ctx.strokeStyle = light
      ctx.lineWidth = 2.4
      for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
          ctx.beginPath()
          ctx.ellipse(x + 20, y + 22, 12, 7, 0.7, 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x + 24, y + 25, 2.6, 0, Math.PI * 2)
          ctx.fillStyle = dark
          ctx.fill()
        }
      }
      break
    }
    case 'embroidered': {
      // Thread-dense surface: satin-stitch bands, zari curls and gold sequins.
      ctx.strokeStyle = shade(base, 34)
      ctx.lineWidth = 7
      for (let y = 10; y < size; y += 34) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        for (let x = 0; x <= size; x += 16) {
          ctx.quadraticCurveTo(x + 4, y - 5, x + 8, y)
        }
        ctx.stroke()
      }
      for (let y = 60; y < size; y += 120) {
        for (let x = 40; x < size; x += 120) {
          sequin(ctx, x, y, 6)
          sequin(ctx, x + 24, y + 18, 4)
          sequin(ctx, x - 18, y + 24, 3.5)
        }
      }
      break
    }
    default: {
      // Unknown pattern: keep the fabric plain rather than inventing a texture.
      break
    }
  }

  weave(ctx, size, colour)
  // Extra metallic sheen only on embroidered surfaces.
  if (pattern === 'embroidered') {
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.strokeStyle = deeper
    ctx.lineWidth = 1
    for (let index = 0; index < size; index += 8) {
      ctx.beginPath()
      ctx.moveTo(index, 0)
      ctx.lineTo(index, size)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** Cached data URL of a fabric pattern tile (null for plain fabric). */
export function fabricPatternDataUrl(pattern: string, colour: string, size = 192): string | null {
  if (!pattern || pattern === 'solid') return null
  if (typeof document === 'undefined') return null
  const key = `${pattern}:${colour}:${size}`
  const cached = dataUrlCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawFabricPattern(ctx, pattern, colour, size)
  const url = canvas.toDataURL('image/png')
  dataUrlCache.set(key, url)
  return url
}
