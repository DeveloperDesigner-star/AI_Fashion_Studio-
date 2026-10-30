import { api } from '@/lib/api'
import type {
  AICapabilities,
  AdminList,
  AdminStats,
  AdminUser,
  AuditLogEntry,
  AssistantResponse,
  Avatar,
  Design,
  Garment,
  GarmentList,
  Look,
  MediaList,
  NotificationList,
  Outfit,
  OutfitComparison,
  Profile,
  ProviderSetting,
  ProviderStatus,
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
  garment: (slug: string) => ['garment', slug] as const,
  looks: (gender?: string) => ['looks', gender ?? 'all'] as const,
  designs: ['designs'] as const,
  design: (id: string) => ['design', id] as const,
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
  adminBusinesses: ['admin', 'businesses'] as const,
  aiUsage: ['admin', 'ai-usage'] as const,
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
  looks: (gender?: string) =>
    api.get<{ items: Look[] }>(`/catalog/looks${gender ? `?gender=${gender}` : ''}`),
  designs: () => api.get<{ items: Design[]; total: number }>('/designs'),
  outfits: () => api.get<{ items: Outfit[]; total: number }>('/outfits'),
  outfit: (id: string) => api.get<Outfit>(`/outfits/${id}`),
  compare: (ids: string[]) => api.get<OutfitComparison>(`/outfits/compare?ids=${ids.join(',')}`),
  media: () => api.get<MediaList>('/media'),
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
  aiUsage: () => api.get<Record<string, unknown>>('/admin/ai-usage'),
  assistant: (payload: {
    message: string
    history?: { role: 'user' | 'assistant'; content: string }[]
    gender_style?: string
    occasion?: string
  }) => api.post<AssistantResponse>('/ai/assistant', payload),
}
