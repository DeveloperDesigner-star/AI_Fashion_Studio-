import { useState } from 'react'
import { cn } from '@/lib/format'
import type { MockupView } from '@/lib/mockups'

/**
 * A photographed blank garment with honest loading behaviour.
 *
 * Product photography is the heaviest thing on the page, so every image is
 * lazy-loaded, given explicit intrinsic dimensions to avoid layout shift, and
 * has a real loading and failure state rather than a blank frame.
 */
export function MockupImage({
  view,
  alt,
  className,
  sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 45vw, 90vw',
  priority = false,
  children,
}: {
  view: Pick<MockupView, 'src' | 'width' | 'height' | 'label'>
  alt: string
  className?: string
  sizes?: string
  priority?: boolean
  children?: React.ReactNode
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  return (
    <div className={cn('relative overflow-hidden bg-bone', className)}>
      {status === 'loading' && <div className="skeleton absolute inset-0" aria-hidden="true" />}

      {status === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-bone px-4 text-center">
          <p className="text-xs font-medium text-ink-soft">Image unavailable</p>
          <p className="text-[0.6875rem] leading-relaxed text-ink-muted">
            The product photograph could not be loaded.
          </p>
        </div>
      ) : (
        <img
          src={view.src}
          alt={alt}
          width={view.width}
          height={view.height}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          className={cn(
            'size-full object-cover transition-opacity duration-300',
            status === 'ready' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}

      {children}
    </div>
  )
}
