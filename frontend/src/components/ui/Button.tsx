import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-paper border-ink hover:bg-ink-soft',
  secondary: 'bg-bone text-ink border-line hover:bg-sand',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-bone',
  outline: 'bg-transparent text-ink border-ink hover:bg-ink hover:text-paper',
  danger: 'bg-danger text-paper border-danger hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[0.75rem] tracking-[0.06em] uppercase',
  md: 'h-11 px-5 text-[0.8125rem] tracking-[0.08em] uppercase',
  lg: 'h-13 px-7 text-[0.875rem] tracking-[0.1em] uppercase',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  )
}

interface LinkButtonProps {
  to: string
  children: ReactNode
  variant?: Variant
  size?: Size
  className?: string
  block?: boolean
}

export function LinkButton({ to, children, variant = 'primary', size = 'md', className, block }: LinkButtonProps) {
  return (
    <Link
      to={to}
      className={cn(base, variants[variant], sizes[size], block && 'w-full text-center', className)}
    >
      {children}
    </Link>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
