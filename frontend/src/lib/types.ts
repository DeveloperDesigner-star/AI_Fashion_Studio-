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
  /** Pattern-piece shape the design studio draws for this component. */
  kind?: string
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
  styles: string[]
  occasions: string[]
  sizes: string[]
  fit: string
  tags: string[]
  components: GarmentComponent[]
  silhouette: string
  palette: { primary?: string; secondary?: string; accent?: string }
  is_featured: boolean
  is_active: boolean
  is_favorite: boolean
  created_at: string
}

export interface GarmentFacets {
  categories?: Record<string, number>
  category_labels?: Record<string, string>
  styles?: Record<string, number>
  style_labels?: Record<string, string>
  occasions?: Record<string, number>
  occasion_labels?: Record<string, string>
  seasons?: Record<string, number>
  season_labels?: Record<string, string>
  fabrics?: string[]
  slots?: string[]
  fits?: string[]
  price_range?: { min_cents: number; max_cents: number }
  favorites?: number
  active?: number
  inactive?: number
}

export interface GarmentList {
  items: Garment[]
  total: number
  page: number
  page_size: number
  facets: GarmentFacets
}

export interface CatalogOption {
  value: string
  label: string
  count?: number
}

export interface CatalogCategoryGroup {
  id: string
  label: string
  description: string
  categories: CatalogOption[]
}

export interface CatalogTaxonomy {
  genders: string[]
  categories: CatalogOption[]
  category_groups: CatalogCategoryGroup[]
  slots: string[]
  styles: CatalogOption[]
  occasions: CatalogOption[]
  seasons: CatalogOption[]
  fits: string[]
  fabrics: string[]
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

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light'

export interface LayerTransform {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  flip_x: boolean
}

export interface LayerCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface LayerAdjustments {
  brightness: number
  contrast: number
  saturation: number
  hue: number
}

/** One piece of artwork inside a component. Never merged with the design. */
export interface DesignLayer {
  id: string
  name: string
  asset_id: string
  transform: LayerTransform
  crop: LayerCrop
  adjustments: LayerAdjustments
  blend_mode: BlendMode
  visible: boolean
  locked: boolean
  z_index: number
}

export interface ComponentCustomisation {
  color: string
  fabric: string
  pattern: string
  embroidery: string
  print_asset_id?: string | null
  notes?: string | null
  layers?: DesignLayer[]
  pattern_scale?: number
  pattern_rotation?: number
  texture_tint?: string | null
}

export interface Design {
  id: string
  garment_id: string
  name: string
  status: DesignStatus
  components: Record<string, ComponentCustomisation>
  fit: Record<string, unknown>
  notes: string | null
  revision: number
  source_design_id?: string | null
  proof_asset_id?: string | null
  created_at: string
  updated_at: string
  garment?: Garment | null
}

export interface PatternOption {
  id: string
  family: string
  label: string
  description: string
}

export interface DesignLibrary {
  patterns: PatternOption[]
  families: string[]
  fabrics: string[]
  embroideries: string[]
  blend_modes: BlendMode[]
  component_kinds: string[]
  limits: {
    layers_per_component: number
    layers_per_design: number
    components_per_design: number
  }
}

export interface DerivedAsset {
  asset: MediaAsset
  meta: Record<string, unknown>
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
  paid: boolean
  priority: number
  capabilities: string[]
  env_key: string | null
  reason: string | null
  status: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_latency_ms: number | null
  last_test_error: string | null
}

export interface AITaskCapability {
  key: string
  label: string
  description: string
  modality: 'text' | 'vision'
  providers: string[]
  available: boolean
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
    estimated_cost_usd: number
    resets_at: string
    remaining_requests: number
  }
  notice: string
  tasks: AITaskCapability[]
  provider_order: string[]
  paid_usage_enabled: boolean
  retry_policy: {
    max_provider_attempts: number
    provider_retries: number
    timeout_seconds: number
  }
}

export interface AITaskResult {
  task: string
  label: string
  mode: 'model' | 'unavailable'
  provider: string | null
  model: string | null
  text: string
  notice: string | null
  fallback_used: boolean
  attempts: number
  prompt_tokens: number | null
  completion_tokens: number | null
  estimated_cost_usd: number | null
  quota: AICapabilities['daily_quota']
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

export type BusinessType =
  | 'tailor'
  | 'printing'
  | 'fabric'
  | 'brand'
  | 'atelier'
  | 'designer'
  | 'manufacturer'

export interface Business {
  id: string
  name: string
  slug: string
  type: BusinessType
  tagline: string
  description: string
  city: string
  country: string
  address_line: string
  postal_code: string
  services: string[]
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  price_from_cents: number | null
  currency: string
  response_time_hours: number | null
  min_order_cents: number | null
  lead_time_days: number | null
  rating: number
  review_count: number
  is_verified: boolean
  is_active: boolean
}

export type OfferingKind = 'service' | 'product'
export type PricingMode = 'fixed' | 'from' | 'per_unit' | 'quote'

export interface BusinessOffering {
  id: string
  business_id: string
  kind: OfferingKind
  name: string
  description: string
  category: string
  pricing_mode: PricingMode
  price_cents: number | null
  currency: string
  unit: string
  min_quantity: number
  lead_time_days: number | null
  is_active: boolean
  sort_order: number
}

export interface BusinessServiceArea {
  id: string
  label: string
  city: string
  country: string
  radius_km: number | null
  remote: boolean
  notes: string | null
}

export interface BusinessPortfolioItem {
  id: string
  business_id: string
  title: string
  description: string
  media_asset_id: string | null
  project_date: string | null
  sort_order: number
  image_url: string | null
}

export interface BusinessReview {
  id: string
  business_id: string
  order_id: string
  user_id: string
  rating: number
  title: string
  body: string
  business_reply: string | null
  created_at: string
  reviewer_name: string | null
}

export interface BusinessDetail extends Business {
  offerings: BusinessOffering[]
  service_areas: BusinessServiceArea[]
  portfolio: BusinessPortfolioItem[]
  reviews: BusinessReview[]
}

export type ProductionStatus =
  | 'order_received'
  | 'quote_pending'
  | 'quote_approved'
  | 'design_approved'
  | 'production_pending'
  | 'printing_in_progress'
  | 'quality_checking'
  | 'ready_for_delivery'
  | 'completed'
  | 'cancelled'

export type PrintPackageStatus = 'draft' | 'in_review' | 'approved' | 'changes_requested'

export interface PrintFile {
  id: string
  component_id: string
  label: string
  width_px: number
  height_px: number
  target_width_cm: number
  target_height_cm: number
  effective_dpi: number
  dpi_ok: boolean
  has_transparency: boolean
  color_space: string
  color_profile: string
  warnings: string[]
  content_url: string | null
  preview_url: string | null
  source: 'print_artwork' | 'solid_colour' | string
}

export interface PrintPackage {
  id: string
  user_id: string
  design_id: string | null
  name: string
  status: PrintPackageStatus
  width_cm: number
  height_cm: number
  bleed_mm: number
  dpi: number
  color_profile: string
  transparent_background: boolean
  notes: string | null
  approved_at: string | null
  rejection_reason: string | null
  manifest: Record<string, unknown>
  files: PrintFile[]
  pdf_url: string | null
  zip_url: string | null
  is_ai_preview: boolean
  created_at: string
  updated_at: string
}

export interface PrintCapabilities {
  dpi: { min: number; max: number; recommended: number }
  color_profiles: string[]
  color_management: string
  transparent_background: boolean
  exports: string[]
  pdf: string
  component_files: boolean
  printer_connection: boolean
  printer_integrations: string[]
  integration_mode: string
  note: string
}

export interface OrderEvent {
  id: string
  from_status: string | null
  to_status: string
  note: string | null
  created_at: string
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
  user_id: string
  reference_code: string
  title: string
  description: string
  service_type: string
  quantity: number
  target_date: string | null
  budget_cents: number | null
  currency: string
  status: string
  production_status: ProductionStatus
  agreed_amount_cents: number | null
  agreed_currency: string | null
  design_approved_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  print_package_id: string | null
  print_package: PrintPackage | null
  specs: Record<string, unknown>
  business: Business | null
  quotes: Quote[]
  messages: QuoteMessage[]
  events: OrderEvent[]
  review: BusinessReview | null
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
  label: string
  role: string
  enabled: boolean
  priority: number
  default_text_model: string | null
  default_vision_model: string | null
  notes: string | null
  configured: boolean
  usable: boolean
  paid: boolean
  free_tier: boolean
  supports_vision: boolean
  capabilities: string[]
  env_key: string | null
  reason: string | null
  status: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_latency_ms: number | null
  last_test_error: string | null
}

export interface ProviderTestResult {
  ok: boolean
  skipped: boolean
  provider: string
  model: string | null
  latency_ms: number | null
  error: string | null
  retryable: boolean | null
  sample: string | null
}

export interface AIProviderUsage {
  provider: string
  attempts: number
  successes: number
  errors: number
  skipped: number
  tokens: number
  estimated_cost_usd: number
  avg_latency_ms: number | null
}

export interface AIUsage {
  window_days: number
  providers: AIProviderUsage[]
  by_kind: { kind: string; requests: number; estimated_cost_usd: number }[]
  daily: { date: string; provider: string; attempts: number }[]
  fallback_events: number
  totals: { attempts: number; tokens: number; estimated_cost_usd: number }
  limits: {
    daily_requests_per_user: number
    daily_tokens_per_user: number
    max_provider_attempts: number
    provider_retries: number
    request_timeout_seconds: number
    paid_usage_enabled: boolean
  }
  note: string
}

export interface AIErrorEntry {
  id: string
  provider: string
  kind: string
  model: string | null
  status: string
  retryable: boolean
  error_code: string | null
  error: string | null
  created_at: string | null
}

export interface AIFallbackEntry {
  id: string
  kind: string
  from_provider: string
  to_provider: string
  reason: string
  retryable: boolean
  status_code: number | null
  created_at: string | null
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

// --------------------------------------------------------------------------- //
// Virtual try-on
// --------------------------------------------------------------------------- //
export interface TryOnCheck {
  id: string
  label: string
  ok: boolean
  detail: string
}

export interface TryOnModel {
  name: string
  license: string
  license_url: string
  repository: string
  paper: string
  attribution: string
  requirements: string[]
  limitations: string[]
  commercial_use: boolean
}

export interface TryOnCapabilities {
  available: boolean
  status: 'ready' | 'unavailable' | string
  provider: string
  reason: string
  checks: TryOnCheck[]
  model: TryOnModel
  worker: {
    model?: string | null
    revision?: string | null
    gpu?: { name?: string | null; vram_gb?: number | null }
    latency_ms?: number | null
    url?: string
    license_url?: string
  }
  disclaimer: string
  supported_slots: string[]
  environment: {
    api_runs_inference: boolean
    requires_self_hosted_worker: boolean
    worker_configured: boolean
    worker_url_exposed: boolean
  }
}

export interface TryOnItem {
  id: string
  garment_id: string | null
  design_id: string | null
  garment_name: string
  garment_slug: string
  design_name: string | null
  slot: string
  size: string | null
  fabric: string
  color: string
  sort_order: number
}

export interface TryOnComparison {
  available: boolean
  original_url: string | null
  customised_url: string | null
  original_label: string
  customised_label: string
  note: string
  approximate: boolean
}

export interface TryOnSession {
  id: string
  name: string
  mode: 'photo' | 'avatar'
  status: 'draft' | 'ready' | 'unavailable' | 'failed' | string
  avatar_id: string | null
  photo_asset_id: string | null
  garment_asset_id: string | null
  result_asset_id: string | null
  preview_asset_id: string | null
  provider: string | null
  model_name: string | null
  model_license: string | null
  model_license_url: string | null
  model_revision: string | null
  inference_ms: number | null
  generated_at: string | null
  error: string | null
  approximate: boolean
  consent_version: string | null
  consented_at: string | null
  training_opt_in: boolean
  metadata: Record<string, unknown>
  items: TryOnItem[]
  original_url: string | null
  result_url: string | null
  preview_url: string | null
  result_thumbnail_url: string | null
  preview_thumbnail_url: string | null
  comparison: TryOnComparison
  disclaimer: string
  created_at: string
  updated_at: string
}

export interface TryOnList {
  items: TryOnSession[]
  total: number
}

export interface TryOnSessionCreate {
  name?: string
  mode: 'photo' | 'avatar'
  photo_asset_id?: string | null
  avatar_id?: string | null
  items: {
    garment_id: string
    design_id?: string | null
    size?: string | null
    fabric?: string | null
    color?: string | null
  }[]
  photo_processing_consent?: boolean
  training_opt_in?: boolean
}
