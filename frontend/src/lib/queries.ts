import { api } from '@/lib/api'
import type {
  AICapabilities,
  AIErrorEntry,
  AIFallbackEntry,
  AITaskResult,
  AIUsage,
  AdminList,
  AdminStats,
  AdminUser,
  AuditLogEntry,
  AssistantResponse,
  Avatar,
  CatalogTaxonomy,
  Design,
  DesignLibrary,
  Garment,
  GarmentList,
  Look,
  MediaList,
  NotificationList,
  Outfit,
  OutfitComparison,
  Profile,
  ProviderSetting,
  TryOnCapabilities,
  TryOnList,
  TryOnSession,
  ProviderStatus,
  ProviderTestResult,
  PublicConfig,
  QuoteRequest,
  Business,
  User,
} from '@/lib/types'

export const qk = {
  config: ['config'] as const,
  profile: ['profile'] as const,
  avatars: ['avatars'] as const,
  garments: (params: Record<string, string | number | boolean | undefined>) =>
    ['garments', params] as const,
  taxonomy: ['catalog', 'taxonomy'] as const,
  favorites: ['catalog', 'favorites'] as const,
  garment: (slug: string) => ['garment', slug] as const,
  looks: (gender?: string) => ['looks', gender ?? 'all'] as const,
  designs: (params: { status?: string; limit?: number } = {}) => ['designs', params] as const,
  design: (id: string) => ['design', id] as const,
  designLibrary: ['designs', 'library'] as const,
  outfits: ['outfits'] as const,
  outfit: (id: string) => ['outfit', id] as const,
  media: ['media'] as const,
  capabilities: ['ai', 'capabilities'] as const,
  providers: ['ai', 'providers'] as const,
  businesses: (params: Record<string, string | undefined>) => ['businesses', params] as const,
  requests: (scope: string) => ['requests', scope] as const,
  request: (id: string) => ['request', id] as const,
  notifications: ['notifications'] as const,
  adminStats: ['admin', 'stats'] as const,
  adminUsers: (params: { q?: string; role?: string } = {}) => ['admin', 'users', params] as const,
  adminProviders: ['admin', 'providers'] as const,
  adminAudit: ['admin', 'audit'] as const,
  adminRequests: ['admin', 'requests'] as const,
  adminCatalog: (params: { q?: string; status?: string; page?: number } = {}) =>
    ['admin', 'catalog', params] as const,
  adminBusinesses: ['admin', 'businesses'] as const,
  aiUsage: ['admin', 'ai-usage'] as const,
  aiErrors: ['admin', 'ai-errors'] as const,
  aiFallbacks: ['admin', 'ai-fallbacks'] as const,
  tryOnCapabilities: ['try-on', 'capabilities'] as const,
  tryOnSessions: ['try-on', 'sessions'] as const,
  tryOnSession: (id: string) => ['try-on', 'session', id] as const,
}

export const fetchers = {
  config: () => api.get<PublicConfig>('/meta/config'),
  me: () => api.get<User>('/auth/me'),
  profile: () => api.get<Profile>('/profile'),
  avatars: () => api.get<Avatar[]>('/avatars'),
  garments: (params: Record<string, string | number | boolean | undefined> = {}) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== false) search.set(key, String(value))
    })
    return api.get<GarmentList>(`/catalog/garments?${search.toString()}`)
  },
  garment: (slug: string) => api.get<Garment>(`/catalog/garments/${slug}`),
  taxonomy: () => api.get<CatalogTaxonomy>('/catalog/taxonomy'),
  favorites: () => api.get<{ items: Garment[]; total: number }>('/catalog/favorites'),
  addFavorite: (slug: string) =>
    api.put<{ slug: string; is_favorite: boolean }>(`/catalog/favorites/${slug}`),
  removeFavorite: (slug: string) => api.delete(`/catalog/favorites/${slug}`),
  looks: (gender?: string) =>
    api.get<{ items: Look[] }>(`/catalog/looks${gender ? `?gender=${gender}` : ''}`),
  designs: (params: { status?: string; limit?: number } = {}) => {
    const search = new URLSearchParams()
    if (params.status) search.set('status', params.status)
    if (params.limit) search.set('limit', String(params.limit))
    return api.get<{ items: Design[]; total: number }>(`/designs?${search.toString()}`)
  },
  design: (id: string) => api.get<Design>(`/designs/${id}`),
  designLibrary: () => api.get<DesignLibrary>('/designs/library'),
  outfits: () => api.get<{ items: Outfit[]; total: number }>('/outfits'),
  outfit: (id: string) => api.get<Outfit>(`/outfits/${id}`),
  compare: (ids: string[]) => api.get<OutfitComparison>(`/outfits/compare?ids=${ids.join(',')}`),
  media: () => api.get<MediaList>('/media'),
  tryOnCapabilities: () => api.get<TryOnCapabilities>('/try-on/capabilities'),
  tryOnSessions: () => api.get<TryOnList>('/try-on/sessions?limit=40'),
  tryOnSession: (id: string) => api.get<TryOnSession>(`/try-on/sessions/${id}`),
  capabilities: () => api.get<AICapabilities>('/ai/capabilities'),
  providers: () => api.get<ProviderStatus[]>('/ai/providers'),
  businesses: (params: Record<string, string | undefined> = {}) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value)
    })
    return api.get<{ items: Business[]; total: number }>(`/marketplace/businesses?${search.toString()}`)
  },
  requests: (scope: 'outgoing' | 'incoming' = 'outgoing') =>
    api.get<{ items: QuoteRequest[]; total: number }>(`/marketplace/requests?scope=${scope}`),
  request: (id: string) => api.get<QuoteRequest>(`/marketplace/requests/${id}`),
  notifications: () => api.get<NotificationList>('/notifications'),
  adminStats: () => api.get<AdminStats>('/admin/stats'),
  adminUsers: (params: { q?: string; role?: string } = {}) => {
    const search = new URLSearchParams()
    if (params.q) search.set('q', params.q)
    if (params.role) search.set('role', params.role)
    return api.get<AdminList<AdminUser>>(`/admin/users?${search.toString()}`)
  },
  adminProviders: () => api.get<ProviderSetting[]>('/admin/providers'),
  adminAudit: () => api.get<AdminList<AuditLogEntry>>('/admin/audit-logs?limit=50'),
  adminRequests: () =>
    api.get<{ items: QuoteRequest[]; total: number }>('/admin/requests'),
  adminBusinesses: () =>
    api.get<{ items: Business[]; total: number }>('/admin/businesses'),
  aiUsage: () => api.get<AIUsage>('/admin/ai-usage'),
  aiErrors: () => api.get<{ items: AIErrorEntry[]; total: number }>('/admin/ai-errors'),
  aiFallbacks: () => api.get<{ items: AIFallbackEntry[]; total: number }>('/admin/ai-fallbacks'),
  testProvider: (provider: string) =>
    api.post<ProviderTestResult>(`/admin/providers/${provider}/test`),
  reorderProviders: (order: string[]) =>
    api.put<ProviderSetting[]>('/admin/providers-order', { order }),
  assistant: (payload: {
    message: string
    history?: { role: 'user' | 'assistant'; content: string }[]
    gender_style?: string
    occasion?: string
  }) => api.post<AssistantResponse>('/ai/assistant', payload),
  aiTask: (
    task: string,
    payload: {
      prompt: string
      context?: Record<string, unknown>
      image_asset_id?: string
      max_tokens?: number
    },
  ) => api.post<AITaskResult>(`/ai/tasks/${task}`, payload),
}
