import * as THREE from 'three'
import { drawFabricPattern } from '@/lib/fabricTexture'

const cache = new Map<string, THREE.CanvasTexture>()

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
  drawFabricPattern(ctx, pattern, colour, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 3)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  cache.set(key, texture)
  return texture
}
