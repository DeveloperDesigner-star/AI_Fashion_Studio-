import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Spinner } from '@/components/ui/Button'

interface ProtectedRouteProps {
  children: ReactNode
  requireAdmin?: boolean
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { status, user } = useAuthStore()
  const location = useLocation()

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
        <span className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-ink-muted">
          <Spinner className="size-4" /> Restoring your studio
        </span>
      </div>
    )
  }

  if (status === 'anonymous' || !user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  if (requireAdmin && user.role !== 'admin') {
    return (
      <div className="shell py-24 text-center">
        <p className="eyebrow">Restricted</p>
        <h1 className="display-md mt-3">Administrator access required</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
          This area is limited to studio administrators. If you believe you should have access, ask
          an existing administrator to update your role.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
