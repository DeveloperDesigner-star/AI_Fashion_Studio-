/**
 * Typed API client.
 *
 * - The access token lives only in memory (never localStorage), so a stolen
 *   storage snapshot cannot impersonate the user.
 * - The refresh token is an httpOnly cookie issued by the API; on page load the
 *   app trades it for a fresh access token (`bootstrapSession`).
 * - A single refresh attempt is shared across concurrent 401s.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1'

let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export interface ApiFieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  status: number
  code: string
  fields: ApiFieldError[]
  retryAfter?: number

  constructor(
    message: string,
    options: { status: number; code?: string; fields?: ApiFieldError[]; retryAfter?: number },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code ?? 'error'
    this.fields = options.fields ?? []
    this.retryAfter = options.retryAfter
  }
}

const NETWORK_MESSAGE =
  'The studio server could not be reached. Check that the API is running and try again.'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  formData?: FormData
  signal?: AbortSignal
  skipRefresh?: boolean
  raw?: boolean
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'error'
  let message = response.statusText || 'Request failed'
  let fields: ApiFieldError[] = []
  try {
    const payload = await response.json()
    const detail = payload?.detail
    if (typeof detail === 'string') {
      message = detail
    } else if (detail && typeof detail === 'object') {
      code = detail.code ?? code
      message = detail.message ?? message
      fields = Array.isArray(detail.fields) ? detail.fields : []
    }
  } catch {
    /* non-JSON error body */
  }
  const retryAfter = Number(response.headers.get('retry-after')) || undefined
  return new ApiError(message, { status: response.status, code, fields, retryAfter })
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
      credentials: 'include',
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError(NETWORK_MESSAGE, { status: 0, code: 'network_error' })
  }

  if (response.status === 401 && !options.skipRefresh) {
    const refreshed = await refreshSession()
    if (refreshed) {
      return request<T>(path, { ...options, skipRefresh: true })
    }
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) return undefined as T

  if (options.raw) return response as unknown as T
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

let refreshInFlight: Promise<boolean> | null = null

export async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          accessToken = null
          return false
        }
        const payload = (await response.json()) as { access_token: string }
        accessToken = payload.access_token
        return true
      } catch {
        accessToken = null
        return false
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
  deleteWithBody: <T = void>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body }),
  upload: <T>(path: string, file: File, fields: Record<string, string>) => {
    const form = new FormData()
    form.append('file', file)
    Object.entries(fields).forEach(([key, value]) => form.append(key, value))
    return request<T>(path, { method: 'POST', formData: form })
  },
  raw: (path: string) => request<Response>(path, { raw: true }),
}

export const apiBaseUrl = BASE_URL
