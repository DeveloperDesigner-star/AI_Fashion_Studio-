import type { ReactNode } from 'react'
import { cn } from '@/lib/format'
import { Spinner } from '@/components/ui/Button'

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'ink' | 'clay' | 'olive' | 'gold' | 'danger'
  className?: string
}) {
  const tones = {
    neutral: 'bg-bone text-ink-soft border-line',
    ink: 'bg-ink text-paper border-ink',
    clay: 'bg-clay/10 text-clay border-clay/25',
    olive: 'bg-olive/10 text-olive border-olive/25',
    gold: 'bg-gold/12 text-[#7a5f31] border-gold/30',
    danger: 'bg-danger/10 text-danger border-danger/25',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.14em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'article' | 'section' | 'li'
}) {
  return <Tag className={cn('border border-line bg-paper', className)}>{children}</Tag>
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden="true" />
}

export function LoadingBlock({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={index === 0 ? 'h-6 w-1/3' : 'h-4 w-full'} />
      ))}
    </div>
  )
}

export function InlineSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-muted" role="status">
      <Spinner className="size-3.5" />
      {label}
    </span>
  )
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 border border-dashed border-line bg-bone/40 px-6 py-14 text-center',
        className,
      )}
    >
      <span className="eyebrow">Nothing here yet</span>
      <h3 className="display-md max-w-md">{title}</h3>
      {description && <p className="max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="border border-danger/30 bg-danger/5 px-5 py-6" role="alert">
      <p className="label-xs text-danger">Error</p>
      <p className="mt-1 text-sm font-medium">{title}</p>
      {message && <p className="mt-1 text-sm text-ink-muted">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 border-b border-ink text-xs uppercase tracking-[0.12em] hover:text-clay"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display-lg">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="border border-line bg-paper p-4">
      <p className="label-xs">{label}</p>
      <p className="mt-2 font-display text-3xl leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export function Progress({
  value,
  max = 100,
  label,
  format,
}: {
  value: number
  max?: number
  label?: string
  format?: (value: number) => string
}) {
  const render = format ?? ((input: number) => String(input))
  const percent = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100))
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex justify-between text-xs text-ink-muted">
          <span>{label}</span>
          <span>
            {render(value)} / {render(max)}
          </span>
        </div>
      )}
      <div className="h-1 w-full bg-sand" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className="h-full bg-ink transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'success'
  title?: string
  children: ReactNode
}) {
  const tones = {
    info: 'border-line bg-bone/60 text-ink-soft',
    warn: 'border-gold/40 bg-gold/10 text-[#6a5228]',
    success: 'border-olive/30 bg-olive/10 text-olive',
  }
  return (
    <div className={cn('border px-4 py-3 text-sm leading-relaxed', tones[tone])}>
      {title && <p className="mb-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em]">{title}</p>}
      <div>{children}</div>
    </div>
  )
}
