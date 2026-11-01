import { Component, Suspense, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LoadingBlock } from '@/components/ui/Primitives'

function PageLoading() {
  return (
    <div className="shell py-16">
      <LoadingBlock label="Loading page" rows={4} />
    </div>
  )
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Keep the failure visible in the console for support without exposing it in the UI.
    console.error('Page failed to load', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="shell max-w-xl py-16" role="alert">
        <p className="eyebrow">Connection problem</p>
        <h1 className="mt-3 font-display text-3xl leading-tight">This page didn’t load</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          The page may be too large for the current connection. Check your signal and try again — your
          saved work is not affected.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-11 border border-ink bg-ink px-5 text-sm text-paper"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
          <Link
            to="/studio"
            className="inline-flex min-h-11 items-center border border-line bg-paper px-5 text-sm"
          >
            Back to the studio
          </Link>
        </div>
      </section>
    )
  }
}

/**
 * Route-level suspension and failure handling for lazy pages. Keeping this around each route
 * means a slow phone only downloads the page it is opening, and a failed chunk produces a usable
 * message instead of a blank screen.
 */
export function AsyncBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <PageErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </PageErrorBoundary>
  )
}
