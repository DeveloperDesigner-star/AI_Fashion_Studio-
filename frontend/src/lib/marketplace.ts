import type { ProductionStatus } from '@/lib/types'

export type Tone = 'neutral' | 'ink' | 'clay' | 'olive' | 'gold' | 'danger'

/** The ten production states, in the order a print order normally moves. */
export const productionStages: ProductionStatus[] = [
  'order_received',
  'quote_pending',
  'quote_approved',
  'design_approved',
  'production_pending',
  'printing_in_progress',
  'quality_checking',
  'ready_for_delivery',
  'completed',
]

export const productionLabels: Record<ProductionStatus, string> = {
  order_received: 'Order received',
  quote_pending: 'Quote pending',
  quote_approved: 'Quote approved',
  design_approved: 'Design approved',
  production_pending: 'Production pending',
  printing_in_progress: 'Printing in progress',
  quality_checking: 'Quality checking',
  ready_for_delivery: 'Ready for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const productionTones: Record<ProductionStatus, Tone> = {
  order_received: 'neutral',
  quote_pending: 'gold',
  quote_approved: 'clay',
  design_approved: 'clay',
  production_pending: 'ink',
  printing_in_progress: 'ink',
  quality_checking: 'olive',
  ready_for_delivery: 'olive',
  completed: 'olive',
  cancelled: 'danger',
}

export function productionLabel(status: string): string {
  return productionLabels[status as ProductionStatus] ?? status.replace(/_/g, ' ')
}

export function productionTone(status: string): Tone {
  return productionTones[status as ProductionStatus] ?? 'neutral'
}

export function stageIndex(status: string): number {
  return productionStages.indexOf(status as ProductionStatus)
}

export const printStatusLabels: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
}

export const pricingLabels: Record<string, string> = {
  fixed: 'Fixed price',
  from: 'From',
  per_unit: 'Per unit',
  quote: 'Quote on request',
}

export function offeringPriceLabel(offering: {
  pricing_mode: string
  price_cents: number | null
  currency: string
  unit: string
}): string {
  const money = (cents: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: offering.currency || 'USD',
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100)
  if (offering.price_cents === null || offering.pricing_mode === 'quote') return 'Quote on request'
  if (offering.pricing_mode === 'from') return `From ${money(offering.price_cents)}`
  if (offering.pricing_mode === 'per_unit') return `${money(offering.price_cents)} / ${offering.unit}`
  return money(offering.price_cents)
}

export const dpiGuidance =
  'Most textile work needs at least 300 DPI at the final print size. Files are never upscaled — a low-resolution panel is reported instead of silently stretched.'
