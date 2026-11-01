import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Checkbox, Input } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Primitives'
import { ApiError } from '@/lib/api'

const passwordRules = [
  { label: 'At least 10 characters', test: (value: string) => value.length >= 10 },
  { label: 'Upper and lower case', test: (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: 'At least one number', test: (value: string) => /\d/.test(value) },
]

export function RegisterPage() {
  const register = useAuthStore((state) => state.register)
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)
    try {
      await register({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        accept_terms: acceptTerms,
        marketing_opt_in: marketing,
      })
      navigate('/onboarding', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(Object.fromEntries(caught.fields.map((field) => [field.field, field.message])))
      } else {
        setError('Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-[78vh] lg:grid-cols-[1fr_1fr]">
      <aside className="relative hidden flex-col justify-between border-r border-line bg-ink p-12 text-paper lg:flex">
        <div>
          <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-paper/55">Free account</p>
          <h1 className="display-lg mt-4 max-w-sm">
            Build the wardrobe you have been sketching in your head.
          </h1>
        </div>
        <ul className="space-y-4 text-sm text-paper/70">
          {[
            'Personal avatar from your measurements',
            'Per-component garment customisation',
            '3D fitting room with walking animation',
            'Print proofs and technical packs',
            'Direct quotes from ateliers and printers',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span className="mt-1.5 size-1 shrink-0 bg-clay-soft" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-[0.6875rem] uppercase tracking-[0.16em] text-paper/40">
          No card required · no subscription tiers
        </p>
      </aside>

      <section className="flex items-center justify-center px-5 py-14 sm:px-10">
        <div className="w-full max-w-sm">
          <p className="eyebrow">Create account</p>
          <h2 className="display-md mt-2">Start your studio</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Takes about two minutes. You will add measurements in the next step.
          </p>

          {error && (
            <div className="mt-5">
              <Notice tone="warn" title="Could not create the account">
                {error}
              </Notice>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Input
              label="Full name"
              autoComplete="name"
              required
              value={fullName}
              error={fieldErrors.full_name}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Amina Rahman"
            />
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
              autoComplete="new-password"
              required
              value={password}
              error={fieldErrors.password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a strong password"
            />
            <ul className="space-y-1" aria-label="Password requirements">
              {passwordRules.map((rule) => {
                const passed = rule.test(password)
                return (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-2 text-xs ${passed ? 'text-olive' : 'text-ink-muted'}`}
                  >
                    <span aria-hidden="true">{passed ? '✓' : '·'}</span>
                    {rule.label}
                  </li>
                )
              })}
            </ul>

            <div className="space-y-3 border-t border-line pt-4">
              <Checkbox
                label={
                  <>
                    I accept the studio terms and privacy notice{' '}
                    <span className="text-ink-muted">(measurements stay private to my account)</span>
                  </>
                }
                checked={acceptTerms}
                onChange={(event) => setAcceptTerms(event.target.checked)}
              />
              <Checkbox
                label="Send me occasional studio notes"
                hint="Optional. No third-party marketing; remove anytime in your profile."
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
              />
            </div>

            <Button type="submit" size="lg" block loading={loading} disabled={!acceptTerms}>
              Create account
            </Button>
          </form>

          <p className="mt-5 text-sm text-ink-muted">
            Already have an account?{' '}
            <Link to="/login" className="border-b border-ink text-ink hover:text-clay">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
