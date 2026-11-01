import { useEffect, useState } from 'react'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

async function loadMedia(path: string): Promise<string> {
  const cached = cache.get(path)
  if (cached) return cached
  const existing = inflight.get(path)
  if (existing) return existing

  const promise = (async () => {
    const base = apiBaseUrl.replace(/\/$/, '')
    const url = path.startsWith('/api') ? path : `${base}${path.replace(/^\/api\/v1/, '')}`
    const response = await fetch(url, {
      headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
      credentials: 'include',
    })
    if (!response.ok) throw new Error('Unable to load the private file')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    cache.set(path, objectUrl)
    return objectUrl
  })()

  inflight.set(path, promise)
  try {
    return await promise
  } finally {
    inflight.delete(path)
  }
}

/** Load an authenticated media file as an object URL. */
export function useMediaUrl(path: string | null | undefined): {
  url: string | null
  loading: boolean
  error: string | null
} {
  const [url, setUrl] = useState<string | null>(path ? cache.get(path) ?? null : null)
  const [loading, setLoading] = useState<boolean>(Boolean(path && !cache.get(path)))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!path) {
      setUrl(null)
      setLoading(false)
      return
    }
    const cached = cache.get(path)
    if (cached) {
      setUrl(cached)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    loadMedia(path)
      .then((objectUrl) => {
        if (active) {
          setUrl(objectUrl)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError('This file could not be loaded.')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [path])

  return { url, loading, error }
}

export function clearMediaCache(): void {
  cache.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
  cache.clear()
}
