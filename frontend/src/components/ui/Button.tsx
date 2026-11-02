import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-sm font-semibold transition-[background-color,border-color,box-shadow,color] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-paper ring-1 ring-inset ring-ink hover:bg-ink-soft',
  secondary: 'bg-paper text-ink ring-1 ring-inset ring-line hover:bg-bone hover:ring-line-strong',
  ghost: 'bg-transparent text-ink-soft hover:bg-bone hover:text-ink',
  outline: 'bg-transparent text-ink ring-1 ring-inset ring-line-strong hover:bg-ink hover:text-paper hover:ring-ink',
  danger: 'bg-danger text-white ring-1 ring-inset ring-danger hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[0.8125rem]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[0.9375rem]',
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
