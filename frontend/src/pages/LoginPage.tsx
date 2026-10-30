import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Primitives'
import { ApiError } from '@/lib/api'

export function LoginPage() {
  const login = useAuthStore((state) => state.login)
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  if (user) {
    navigate(next ?? '/studio/women', { replace: true })
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)
    try {
      await login(email.trim(), password)
      const current = useAuthStore.getState().user
      navigate(next ?? (current?.onboarded_at ? '/studio/women' : '/onboarding'), { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(Object.fromEntries(caught.fields.map((field) => [field.field, field.message])))
      } else {
        setError('Sign-in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-[78vh] lg:grid-cols-[1fr_1fr]">
      <aside className="relative hidden flex-col justify-between border-r border-line bg-bone/60 p-12 lg:flex">
        <div>
          <p className="eyebrow">Members’ entrance</p>
          <h1 className="display-lg mt-4 max-w-sm">
            Your measurements, your palette, your <span className="italic text-clay">atelier</span>.
          </h1>
        </div>
        <div className="space-y-6">
          <blockquote className="max-w-md border-l border-clay/40 pl-5 font-display text-xl leading-snug text-ink-soft">
            “The fittings I used to schedule three weeks out now happen in the browser before the
            fabric is even cut.”
          </blockquote>
          <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted">
            Studio note · made-to-measure workflow
          </p>
          <div className="grid grid-cols-3 gap-4 border-t border-line pt-5 text-xs text-ink-muted">
            <div>
              <p className="font-display text-lg text-ink">25+</p>
              catalogue pieces
            </div>
            <div>
              <p className="font-display text-lg text-ink">4–5</p>
              parts per garment
            </div>
            <div>
              <p className="font-display text-lg text-ink">300</p>
              print DPI
            </div>
          </div>
        </div>
      </aside>

      <section className="flex items-center justify-center px-5 py-14 sm:px-10">
        <div className="w-full max-w-sm">
          <p className="eyebrow">Sign in</p>
          <h2 className="display-md mt-2">Welcome back</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Continue your fittings, saved designs and production requests.
          </p>

          {error && (
            <div className="mt-5">
              <Notice tone="warn" title="Could not sign in">
                {error}
              </Notice>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              error={fieldErrors.email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@studio.com"
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              error={fieldErrors.password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••"
            />
            <Button type="submit" size="lg" block loading={loading}>
              Enter the studio
            </Button>
          </form>

          <p className="mt-5 text-sm text-ink-muted">
            New here?{' '}
            <Link to="/register" className="border-b border-ink text-ink hover:text-clay">
              Create a free account
            </Link>
          </p>

          <div className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
            Sessions use a short-lived access token plus an httpOnly refresh cookie. Your
            measurements and uploads are private to your account.
          </div>
        </div>
      </section>
    </div>
  )
}
