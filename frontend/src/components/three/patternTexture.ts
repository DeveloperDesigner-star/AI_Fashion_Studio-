import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()

function lighten(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  if (Number.isNaN(value)) return hex
  const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)))
  const r = clamp(((value >> 16) & 255) + amount)
  const g = clamp(((value >> 8) & 255) + amount)
  const b = clamp((value & 255) + amount)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/**
 * Build (and cache) a procedural fabric pattern texture.
 * Only Canvas API drawing — no external images or texture downloads.
 */
export function getPatternTexture(pattern: string, colour: string): THREE.CanvasTexture | null {
  if (!pattern || pattern === 'solid') return null
  const key = `${pattern}:${colour}`
  const cached = cache.get(key)
  if (cached) return cached

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const base = colour
  const contrast = lighten(colour, 58)
  const dark = lighten(colour, -46)

  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  switch (pattern) {
    case 'stripes': {
      ctx.fillStyle = contrast
      for (let x = 0; x < size; x += 32) ctx.fillRect(x, 0, 12, size)
      break
    }
    case 'checks': {
      ctx.fillStyle = contrast
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
      ctx.fillStyle = contrast
      const step = 32
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          if ((x / step + y / step) % 2 === 0) {
            ctx.beginPath()
            ctx.moveTo(x, y)
            ctx.lineTo(x + step, y)
            ctx.lineTo(x, y + step)
            ctx.closePath()
            ctx.fill()
          } else {
            ctx.beginPath()
            ctx.moveTo(x + step, y)
            ctx.lineTo(x + step, y + step)
            ctx.lineTo(x, y + step)
            ctx.closePath()
            ctx.fill()
          }
        }
      }
      break
    }
    case 'polka': {
      ctx.fillStyle = contrast
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
          ctx.fillStyle = contrast
          for (let petal = 0; petal < 5; petal += 1) {
            const angle = (petal / 5) * Math.PI * 2
            ctx.beginPath()
            ctx.ellipse(x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, 7, 4, angle, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.fillStyle = dark
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    }
    case 'paisley': {
      ctx.strokeStyle = contrast
      ctx.lineWidth = 3
      for (let y = 20; y < size; y += 60) {
        for (let x = 20; x < size; x += 60) {
          ctx.beginPath()
          ctx.ellipse(x, y, 20, 12, 0.6, 0, Math.PI * 2)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x + 6, y + 4, 4, 0, Math.PI * 2)
          ctx.fillStyle = contrast
          ctx.fill()
        }
      }
      break
    }
    case 'geometric': {
      ctx.fillStyle = contrast
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
      break
    }
    case 'animal': {
      ctx.fillStyle = contrast
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
      gradient.addColorStop(0.5, contrast)
      gradient.addColorStop(1, dark)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, size, size)
      break
    }
    default: {
      ctx.fillStyle = contrast
      for (let x = 0; x < size; x += 24) ctx.fillRect(x, 0, 8, size)
    }
  }

  // Fine weave for fabric texture without external maps.
  ctx.globalAlpha = 0.05
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  for (let index = 0; index < size; index += 4) {
    ctx.beginPath()
    ctx.moveTo(0, index)
    ctx.lineTo(size, index)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 3)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  cache.set(key, texture)
  return texture
}
