import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/format'

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  if (!toasts.length) return null

  const toneStyles = {
    success: 'border-olive/40 bg-[#f2f5ef]',
    error: 'border-danger/40 bg-[#fbf1ef]',
    info: 'border-line bg-paper',
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 border px-4 py-3 shadow-lift animate-fade-up',
            toneStyles[item.tone],
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{item.title}</p>
            {item.description && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{item.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            className="text-ink-muted hover:text-ink"
            aria-label="Dismiss notification"
          >
            <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
