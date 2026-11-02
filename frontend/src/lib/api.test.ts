import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 500 ? 'Internal Server Error' : '',
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('api base URL', () => {
  it('falls back to the relative development path', async () => {
    const { apiBaseUrl } = await import('./api')
    expect(apiBaseUrl).toBe('/api/v1')
  })

  it('removes a trailing slash from the production URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://ai-fashion-studio-2kct.vercel.app/api/v1/')
    const { apiBaseUrl } = await import('./api')
    expect(apiBaseUrl).toBe('https://ai-fashion-studio-2kct.vercel.app/api/v1')
  })
})

describe('registration request', () => {
  it('posts the expected body to the exact backend path', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://ai-fashion-studio-2kct.vercel.app/api/v1')
    fetchMock.mockResolvedValue(
      response(201, {
        access_token: 'token',
        token_type: 'bearer',
        expires_in: 900,
        user: { id: 'u1', email: 'amina@example.com' },
      }),
    )
    const { api } = await import('./api')
    const input = {
      email: 'amina@example.com',
      password: 'StudioPass123',
      full_name: 'Amina Studio',
      accept_terms: true,
      marketing_opt_in: false,
    }
    await api.post('/auth/register', input)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://ai-fashion-studio-2kct.vercel.app/api/v1/auth/register')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body as string)).toEqual(input)
  })

  it('does not duplicate a leading slash in a caller path', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1')
    fetchMock.mockResolvedValue(response(200, { ok: true }))
    const { api } = await import('./api')
    await api.get('auth/me')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/v1/auth/me')
  })
})

describe('HTTP error handling', () => {
  it('keeps validation messages and field errors', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1')
    fetchMock.mockResolvedValue(
      response(
        422,
        {
          detail: {
            code: 'validation_error',
            message: 'Some fields need your attention.',
            fields: [{ field: 'email', message: 'Enter a valid email.' }],
          },
        },
        { 'x-request-id': 'req-123' },
      ),
    )
    const { api, ApiError } = await import('./api')
    await expect(
      api.post('/auth/register', { email: 'bad' }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'validation_error',
      message: 'Some fields need your attention.',
      fields: [{ field: 'email', message: 'Enter a valid email.' }],
      requestId: 'req-123',
    })
    await expect(api.post('/auth/register', { email: 'bad' })).rejects.toBeInstanceOf(ApiError)
  })

  it('shows the server message for a readable HTTP 500', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1')
    fetchMock.mockResolvedValue(
      response(500, {
        detail: {
          code: 'database_unavailable',
          message: 'The studio database is not ready yet. Please try again shortly.',
        },
      }),
    )
    const { api } = await import('./api')
    await expect(api.post('/auth/register', {})).rejects.toMatchObject({
      status: 500,
      code: 'database_unavailable',
      message: 'The studio database is not ready yet. Please try again shortly.',
    })
  })

  it('falls back to an HTTP message for a non-JSON server error', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: '',
      headers: new Headers(),
      json: async () => {
        throw new SyntaxError('not json')
      },
    } as unknown as Response)
    const { api } = await import('./api')
    await expect(api.get('/health')).rejects.toMatchObject({
      status: 503,
      message: 'The studio server is temporarily unavailable. Please try again.',
    })
  })

  it('uses the network message only when fetch itself fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { api } = await import('./api')
    await expect(api.post('/auth/register', {})).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
      message:
        'The studio server could not be reached. Check that the API is running and try again.',
    })
  })
})
