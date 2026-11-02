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
    neutral: 'bg-bone text-ink-soft ring-line',
    ink: 'bg-ink text-paper ring-ink',
    clay: 'bg-clay/8 text-clay ring-clay/20',
    olive: 'bg-olive/8 text-olive ring-olive/20',
    gold: 'bg-gold/10 text-[#7a5f31] ring-gold/25',
    danger: 'bg-danger/8 text-danger ring-danger/20',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium leading-none ring-1 ring-inset',
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
  return <Tag className={cn('panel', className)}>{children}</Tag>
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
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong bg-paper px-6 py-14 text-center',
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
    <div className="rounded-md border border-danger/25 bg-danger/5 px-5 py-6" role="alert">
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
      <div className="space-y-2.5">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display-lg">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  )
}

export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.8125rem] font-medium text-ink-muted">{label}</p>
        {icon && <span className="text-ink-muted">{icon}</span>}
      </div>
      <p className="mt-2.5 font-display text-[1.75rem] font-semibold leading-none tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p>}
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
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-sand"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${percent}%` }} />
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
    info: 'border-line bg-bone text-ink-soft',
    warn: 'border-gold/35 bg-gold/10 text-[#6a5228]',
    success: 'border-olive/25 bg-olive/8 text-olive',
  }
  return (
    <div className={cn('rounded-md border px-4 py-3 text-sm leading-relaxed', tones[tone])}>
      {title && <p className="mb-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em]">{title}</p>}
      <div>{children}</div>
    </div>
  )
}
