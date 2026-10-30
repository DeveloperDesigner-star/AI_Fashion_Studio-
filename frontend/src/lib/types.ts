/** Shared API types, mirroring the FastAPI Pydantic schemas. */

export type UserRole = 'user' | 'designer' | 'business' | 'admin'
export type GenderStyle = 'womenswear' | 'menswear' | 'unisex'
export type DesignStatus = 'draft' | 'saved' | 'archived'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  is_verified: boolean
  marketing_opt_in: boolean
  onboarded_at: string | null
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface Measurement {
  id: string
  unit_system: 'metric' | 'imperial'
  source: string
  bust_cm: number | null
  underbust_cm: number | null
  waist_cm: number | null
  hips_cm: number | null
  shoulder_cm: number | null
  neck_cm: number | null
  sleeve_cm: number | null
  inseam_cm: number | null
  thigh_cm: number | null
  calf_cm: number | null
  shoe_size_eu: number | null
  notes: string | null
  updated_at: string
}

export type MeasurementInput = Partial<Omit<Measurement, 'id' | 'updated_at'>> & {
  unit_system?: 'metric' | 'imperial'
}

export interface SizeRecommendation {
  available: boolean
  size: {
    label: string
    eu: string
    uk: string
    us: string
    band: Record<string, number[]>
  } | null
  alternate?: { label: string; eu: string } | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  notes: string[]
  method: string
  gender_style: string
  reason?: string | null
}

export type PreferredFit = 'slim' | 'regular' | 'loose'

export interface Profile {
  id: string
  user_id: string
  email: string
  full_name: string
  display_name: string | null
  bio: string | null
  style_gender: GenderStyle
  age: number | null
  height_cm: number | null
  weight_kg: number | null
  body_shape: string | null
  skin_tone: string | null
  hair_color: string | null
  hair_style: string | null
  city: string | null
  country: string | null
  preferred_sizes: string | null
  preferred_fit: PreferredFit
  fashion_styles: string[]
  preferred_colors: string[]
  profile_photo_id: string | null
  share_measurements: boolean
  allow_photo_analysis: boolean
  photo_consent_at: string | null
  photo_consent_version: string | null
  measurements: Measurement | null
  size_recommendation: SizeRecommendation | null
  updated_at: string
}

export interface AvatarAdjustments {
  height: number
  build: number
  shoulder: number
  torso: number
  leg: number
}

export interface AvatarBaseModel {
  id: string
  label: string
  presentation: 'feminine' | 'masculine' | 'neutral'
  build: string
  description: string
  asset_url: string
  default_height_cm: number
  highlights: string[]
}

export interface AvatarParameters {
  height_m: number
  head_height: number
  neck_width: number
  shoulder_width: number
  chest_width: number
  chest_depth: number
  waist_width: number
  waist_depth: number
  hip_width: number
  hip_depth: number
  torso_length: number
  leg_length: number
  thigh_width: number
  calf_width: number
  arm_length: number
  shoulder_slope: number
  posture: string
  preset: string
  gender_presentation: string
  bmi_estimate: number | null
  derived_body_shape: string | null
  fabric_drape: string
}

export interface Avatar {
  id: string
  name: string
  preset: string
  gender_presentation: 'feminine' | 'masculine' | 'neutral'
  skin_tone: string
  hair_color: string
  hair_style: string
  base_model: string
  adjustments: AvatarAdjustments
  source: 'measurements' | 'regenerated' | 'manual'
  version: number
  photo_asset_ids: string[]
  parameters: AvatarParameters
  measurements_snapshot: Record<string, number | null>
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface GarmentComponent {
  id: string
  label: string
  description?: string | null
  fabrics: string[]
  allows_print: boolean
}

export interface Garment {
  id: string
  slug: string
  name: string
  brand: string
  gender: GenderStyle
  category: string
  slot: string
  description: string
  story: string | null
  base_price_cents: number
  currency: string
  default_fabric: string
  default_color: string
  season: string
  tags: string[]
  components: GarmentComponent[]
  silhouette: string
  palette: { primary?: string; secondary?: string; accent?: string }
  is_featured: boolean
  created_at: string
}

export interface GarmentList {
  items: Garment[]
  total: number
  page: number
  page_size: number
  facets: {
    categories?: Record<string, number>
    fabrics?: string[]
    slots?: string[]
  }
}

export interface Look {
  id: string
  slug: string
  name: string
  gender: GenderStyle
  occasion: string
  description: string
  garment_slugs: string[]
  palette: Record<string, string>
  is_featured: boolean
  garments: Garment[]
}

export interface ComponentCustomisation {
  color: string
  fabric: string
  pattern: string
  embroidery: string
  print_asset_id?: string | null
  notes?: string | null
}

export interface Design {
  id: string
  garment_id: string
  name: string
  status: DesignStatus
  components: Record<string, ComponentCustomisation>
  fit: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
  garment?: Garment | null
}

export interface OutfitItem {
  id: string
  garment_id: string
  design_id: string | null
  slot: string
  sort_order: number
  garment?: Garment | null
  design?: Design | null
}

export interface Outfit {
  id: string
  name: string
  gender: string
  occasion: string
  notes: string | null
  is_favorite: boolean
  cover: Record<string, unknown>
  created_at: string
  updated_at: string
  items: OutfitItem[]
}

export interface OutfitComparison {
  outfits: Outfit[]
  shared_garments: string[]
  differences: { slot: string; by_outfit: Record<string, string | null>; differs: boolean }[]
  price_totals: Record<string, number>
}

export interface MediaAsset {
  id: string
  kind: string
  photo_view: string | null
  original_filename: string
  mime_type: string
  byte_size: number
  width: number
  height: number
  created_at: string
  url: string | null
  thumbnail_url: string | null
}

export interface MediaList {
  items: MediaAsset[]
  total: number
  storage_used_bytes: number
  storage_limit_bytes: number
}

export interface PhotoMetrics {
  width: number
  height: number
  aspect_ratio: number
  orientation: string
  sharpness: number
  brightness_pct: number
  contrast: number
  saturation_pct: number
  colorfulness: number
  score: number
  checks: { name: string; passed: boolean; message: string }[]
  method: string
  disclaimer: string
}

export interface PaletteColor {
  hex: string
  rgb: number[]
  share_pct: number
}

export interface ProviderStatus {
  name: 'gemini' | 'groq' | 'openai'
  label: string
  role: 'primary' | 'secondary' | 'tertiary'
  configured: boolean
  enabled: boolean
  usable: boolean
  text_model: string | null
  vision_model: string | null
  supports_vision: boolean
  free_tier: boolean
  reason: string | null
}

export interface AICapabilities {
  providers: ProviderStatus[]
  assistant_mode: 'model' | 'rule_based'
  vision_available: boolean
  daily_quota: {
    requests_used: number
    requests_limit: number
    tokens_used: number
    tokens_limit: number
    resets_at: string
    remaining_requests: number
  }
  notice: string
}

export interface AssistantResponse {
  mode: 'model' | 'rule_based'
  provider: string
  model: string | null
  text: string
  looks: { name: string; occasion: string; items: { slug: string; name: string; slot: string }[] }[]
  disclaimer: string | null
  quota: AICapabilities['daily_quota']
  fallback_reason: string | null
}

export interface DesignAnalysis {
  asset_id: string
  mode: 'model' | 'unavailable'
  provider: string | null
  model: string | null
  summary: string
  observations: string[]
  palette: PaletteColor[]
  local_metrics: PhotoMetrics | null
  notice: string | null
}

export interface Business {
  id: string
  name: string
  slug: string
  type: 'tailor' | 'printing' | 'fabric' | 'brand' | 'atelier'
  description: string
  city: string
  country: string
  services: string[]
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  price_from_cents: number | null
  currency: string
  rating: number
  is_verified: boolean
  is_active: boolean
}

export interface Quote {
  id: string
  business_id: string
  amount_cents: number
  currency: string
  lead_time_days: number | null
  notes: string | null
  status: 'offered' | 'accepted' | 'declined' | 'withdrawn'
  created_at: string
}

export interface QuoteMessage {
  id: string
  author_id: string
  body: string
  created_at: string
}

export interface QuoteRequest {
  id: string
  reference_code: string
  title: string
  description: string
  service_type: string
  quantity: number
  target_date: string | null
  budget_cents: number | null
  currency: string
  status: string
  specs: Record<string, unknown>
  business: Business | null
  quotes: Quote[]
  messages: QuoteMessage[]
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  kind: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationList {
  items: Notification[]
  unread: number
}

export interface AdminStats {
  users_total: number
  users_new_7d: number
  designs_total: number
  outfits_total: number
  garments_total: number
  businesses_total: number
  orders_open: number
  ai_requests_24h: number
  ai_by_provider: Record<string, number>
  media_storage_bytes: number
}

export interface PublicConfig {
  app_name: string
  version: string
  environment: string
  limits: Record<string, number>
  features: Record<string, boolean>
  providers: { name: string; label: string; role: string; usable: boolean; reason: string | null }[]
  privacy: Record<string, boolean>
}

export interface AdminUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  is_verified: boolean
  created_at: string
  last_login_at: string | null
}

export interface ProviderSetting {
  provider: string
  enabled: boolean
  default_text_model: string | null
  default_vision_model: string | null
  notes: string | null
  configured: boolean
  usable: boolean
}

export interface AuditLogEntry {
  id: string
  user_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  ip_address: string | null
  user_agent: string | null
  detail: Record<string, unknown>
  created_at: string
}

export interface AdminList<T> {
  items: T[]
  total: number
}
