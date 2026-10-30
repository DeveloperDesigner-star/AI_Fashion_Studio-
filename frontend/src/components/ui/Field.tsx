import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/format'

const control =
  'w-full border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 transition-colors focus:border-ink focus:outline-none disabled:bg-bone disabled:text-ink-muted'

interface FieldShellProps {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
  action?: ReactNode
}

export function FieldShell({ label, htmlFor, hint, error, required, children, className, action }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="label-xs">
          {label}
          {required && <span className="text-clay"> *</span>}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  suffix?: string
}

export function Input({ label, hint, error, suffix, className, id, required, ...rest }: InputProps) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <FieldShell label={label} htmlFor={inputId} hint={hint} error={error} required={required}>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          required={required}
          className={cn(control, suffix && 'pr-12', error && 'border-danger', className)}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-muted">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
}

export function Textarea({ label, hint, error, className, id, required, ...rest }: TextareaProps) {
  const generated = useId()
  const textareaId = id ?? generated
  return (
    <FieldShell label={label} htmlFor={textareaId} hint={hint} error={error} required={required}>
      <textarea
        id={textareaId}
        aria-invalid={Boolean(error)}
        className={cn(control, 'min-h-28 resize-y leading-relaxed', error && 'border-danger', className)}
        {...rest}
      />
    </FieldShell>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string
  options: { value: string; label: string }[]
}

export function Select({ label, hint, error, options, className, id, required, ...rest }: SelectProps) {
  const generated = useId()
  const selectId = id ?? generated
  return (
    <FieldShell label={label} htmlFor={selectId} hint={hint} error={error} required={required}>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={Boolean(error)}
          className={cn(control, 'appearance-none pr-9', className)}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2"
          viewBox="0 0 12 8"
          fill="none"
          aria-hidden="true"
        >
          <path d="M1 1.5 6 6.5l5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
    </FieldShell>
  )
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  hint?: string
}

export function Checkbox({ label, hint, className, id, ...rest }: CheckboxProps) {
  const generated = useId()
  const checkboxId = id ?? generated
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 appearance-none border border-line bg-paper checked:border-ink checked:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
        {...rest}
      />
      <div className="space-y-0.5">
        <label htmlFor={checkboxId} className="text-sm leading-snug">
          {label}
        </label>
        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      </div>
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="h-5 w-9 rounded-full border border-line bg-bone transition-colors peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-clay" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-paper transition-transform peer-checked:translate-x-4 peer-checked:bg-paper" />
      </span>
    </label>
  )
}
