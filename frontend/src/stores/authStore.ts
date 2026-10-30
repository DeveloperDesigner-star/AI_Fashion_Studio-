import { create } from 'zustand'
import { ApiError, api, refreshSession, setAccessToken } from '@/lib/api'
import type { AuthResponse, User } from '@/lib/types'

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous'

interface AuthState {
  user: User | null
  status: AuthStatus
  error: string | null
  bootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (input: {
    email: string
    password: string
    full_name: string
    accept_terms: boolean
    marketing_opt_in?: boolean
  }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  patchUser: (user: User) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',
  error: null,

  bootstrap: async () => {
    if (get().status === 'loading') return
    set({ status: 'loading' })
    try {
      const refreshed = await refreshSession()
      if (!refreshed) {
        set({ status: 'anonymous', user: null })
        return
      }
      const user = await api.get<User>('/auth/me')
      set({ status: 'authenticated', user })
    } catch {
      setAccessToken(null)
      set({ status: 'anonymous', user: null })
    }
  },

  login: async (email, password) => {
    set({ error: null })
    try {
      const payload = await api.post<AuthResponse>(
        '/auth/login',
        { email, password },
        { skipRefresh: true },
      )
      setAccessToken(payload.access_token)
      set({ user: payload.user, status: 'authenticated' })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Sign-in failed. Please try again.'
      set({ error: message })
      throw error
    }
  },

  register: async (input) => {
    set({ error: null })
    try {
      const payload = await api.post<AuthResponse>('/auth/register', input, { skipRefresh: true })
      setAccessToken(payload.access_token)
      set({ user: payload.user, status: 'authenticated' })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Registration failed. Please try again.'
      set({ error: message })
      throw error
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      /* the local session is cleared regardless */
    }
    setAccessToken(null)
    set({ user: null, status: 'anonymous', error: null })
  },

  refreshUser: async () => {
    try {
      const user = await api.get<User>('/auth/me')
      set({ user, status: 'authenticated' })
    } catch {
      set({ status: 'anonymous', user: null })
    }
  },

  patchUser: (user) => set({ user }),
  clearError: () => set({ error: null }),
}))
