import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { downloadFile } from '@/lib/download'
import {
  applyReducedMotion,
  getPreferredUnits,
  getReducedMotion,
  setPreferredUnits,
  setReducedMotion,
  type UnitSystem,
} from '@/lib/preferences'
import { Button, LinkButton } from '@/components/ui/Button'
import { Input, Toggle } from '@/components/ui/Field'
import { Badge, Notice, PageHeader, Progress } from '@/components/ui/Primitives'
import { formatBytes, formatDate, titleCase } from '@/lib/format'
import type { User } from '@/lib/types'

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, logout, refreshUser } = useAuthStore()

  const [fullName, setFullName] = useState('')
  const [marketing, setMarketing] = useState(false)
  const [units, setUnits] = useState<UnitSystem>(() => getPreferredUnits())
  const [reducedMotion, setReducedMotionState] = useState(() => getReducedMotion())
  const [exporting, setExporting] = useState(false)
  const [signingOutAll, setSigningOutAll] = useState(false)

  const media = useQuery({ queryKey: qk.media, queryFn: fetchers.media, enabled: Boolean(user) })
  const profile = useQuery({ queryKey: qk.profile, queryFn: fetchers.profile, enabled: Boolean(user) })

  useEffect(() => {
    if (!user) return
    setFullName(user.full_name)
    setMarketing(user.marketing_opt_in)
  }, [user])

  useEffect(() => {
    applyReducedMotion(reducedMotion)
  }, [reducedMotion])

  const saveAccount = useMutation({
    mutationFn: () =>
      api.patch<User>('/auth/me', {
        full_name: fullName.trim(),
        marketing_opt_in: marketing,
      }),
    onSuccess: async () => {
      await refreshUser()
      toast.success('Account updated')
    },
    onError: (error) =>
      toast.error('Could not save', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const changeUnits = (next: UnitSystem) => {
    if (next === units) return
    setUnits(next)
    setPreferredUnits(next)
    toast.success(
      'Units updated',
      next === 'metric' ? 'Measurements display in centimetres and kilograms.' : 'Measurements display in inches and pounds.',
    )
  }

  const changeMotion = (reduced: boolean) => {
    setReducedMotionState(reduced)
    setReducedMotion(reduced)
  }

  const downloadData = async () => {
    setExporting(true)
    try {
      await downloadFile('/profile/export', `ai-fashion-studio-export-${new Date().toISOString().slice(0, 10)}.json`)
      toast.success('Export downloaded', 'JSON with your profile, designs and outfits.')
    } catch (error) {
      toast.error('Export failed', error instanceof ApiError ? error.message : 'Try again.')
    } finally {
      setExporting(false)
    }
  }

  const signOutAll = async () => {
    if (!window.confirm('Sign out of every device? You will need to sign in again here.')) return
    setSigningOutAll(true)
    try {
      await api.post('/auth/logout-all')
      await logout()
      navigate('/login')
    } catch (error) {
      toast.error(
        'Could not sign out everywhere',
        error instanceof ApiError ? error.message : 'Try again.',
      )
    } finally {
      setSigningOutAll(false)
    }
  }

  if (!user) return null

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Settings"
        title="Account & preferences"
        description="Display preferences live in this browser. Account details, exports and sessions are handled by the API."
        actions={
          <LinkButton to="/profile" size="sm" variant="outline">
            Measurements & body
          </LinkButton>
        }
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-8">
          <section className="border border-line bg-paper p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl">Account</h2>
                <p className="text-xs text-ink-muted">
                  Member since {formatDate(user.created_at)} · {titleCase(user.role)}
                </p>
              </div>
              <Badge tone={user.is_verified ? 'olive' : 'neutral'}>
                {user.is_verified ? 'Verified' : 'Unverified'}
              </Badge>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                maxLength={120}
              />
              <Input
                label="Email"
                value={user.email}
                readOnly
                hint="Email changes need account support — the address is the login identifier."
              />
            </div>

            <div className="mt-2 border-t border-line">
              <Toggle
                checked={marketing}
                onChange={setMarketing}
                label="Product updates"
                description="Occasional notes about new collections and features. Transactional notices stay in-app regardless."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-xs text-ink-muted">
                {user.onboarded_at ? 'Onboarding completed.' : 'Onboarding not completed yet.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {!user.onboarded_at && (
                  <LinkButton to="/onboarding" size="sm" variant="ghost">
                    Finish onboarding
                  </LinkButton>
                )}
                <Button
                  size="sm"
                  onClick={() => saveAccount.mutate()}
                  loading={saveAccount.isPending}
                  disabled={fullName.trim().length < 2}
                >
                  Save account
                </Button>
              </div>
            </div>
          </section>

          <section className="border border-line bg-paper p-5">
            <h2 className="font-display text-xl">Display</h2>
            <p className="text-xs text-ink-muted">
              Applies to every measurement field in this browser. Stored values are always metric.
            </p>

            <div className="mt-4">
              <p className="label-xs mb-2">Measurement units</p>
              <div className="inline-flex border border-line text-[0.625rem] uppercase tracking-[0.12em]">
                {(['metric', 'imperial'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => changeUnits(option)}
                    aria-pressed={units === option}
                    className={`px-3 py-1.5 ${units === option ? 'bg-ink text-paper' : 'text-ink-muted'}`}
                  >
                    {option === 'metric' ? 'cm / kg' : 'in / lb'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 border-t border-line">
              <Toggle
                checked={reducedMotion}
                onChange={changeMotion}
                label="Reduce motion"
                description="Disables transitions and animation, including the fitting-room motion effects."
              />
            </div>

            <p className="border-t border-line pt-3 text-xs text-ink-muted">
              Catalogue focus and sizing preferences live in{' '}
              <Link to="/profile" className="border-b border-line hover:border-ink">
                profile & measurements
              </Link>
              .
            </p>
          </section>

          <section className="border border-line bg-paper p-5">
            <h2 className="font-display text-xl">Privacy & data</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p>Download my data</p>
                  <p className="text-xs text-ink-muted">
                    JSON copy of your profile, measurements, avatars, designs and outfits. Uploaded
                    images are excluded — download them individually.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={downloadData} loading={exporting}>
                  Export JSON
                </Button>
              </div>

              <div className="border-t border-line pt-4">
                <p className="label-xs">What is stored</p>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-ink-muted">
                  <li>· Account: name, email, hashed password, role, timestamps.</li>
                  <li>· Body data: measurements in centimetres, optional age and city.</li>
                  <li>· Studio data: designs, outfits, avatars and uploaded media (private).</li>
                  <li>· Operational logs: audit trail entries for security-sensitive actions.</li>
                </ul>
              </div>

              <div className="border-t border-line pt-4">
                <p className="label-xs">Account deletion</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Delete the account, with its designs, outfits and uploads, from the danger zone in
                  profile & measurements. Export anything you want to keep first.
                </p>
                <LinkButton to="/profile" size="sm" variant="ghost" className="mt-2">
                  Open profile
                </LinkButton>
              </div>
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="border border-line bg-paper p-4">
            <p className="label-xs">Storage</p>
            <div className="mt-3">
              <Progress
                value={media.data?.storage_used_bytes ?? 0}
                max={media.data?.storage_limit_bytes ?? 1}
                label="Private uploads"
                format={formatBytes}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-muted">
              {media.data?.items.length ?? 0} files stored. Quota protects the shared free infrastructure.
            </p>
          </section>

          <section className="border border-line bg-paper p-4">
            <p className="label-xs">Sessions</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Access tokens last 30 minutes and refresh cookies 14 days. Signing out everywhere
              revokes every refresh token immediately.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={signOutAll}
                loading={signingOutAll}
              >
                Sign out of all devices
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await logout()
                  navigate('/')
                }}
              >
                Sign out here
              </Button>
            </div>
          </section>

          <section className="border border-line bg-paper p-4">
            <p className="label-xs">Account status</p>
            <dl className="mt-2 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Plan</dt>
                <dd>Free · fair use</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Avatars</dt>
                <dd>{profile.data ? 'managed in profile' : '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Role</dt>
                <dd>{titleCase(user.role)}</dd>
              </div>
            </dl>
            {user.role === 'admin' && (
              <LinkButton to="/admin" size="sm" variant="ghost" className="mt-3">
                Admin dashboard
              </LinkButton>
            )}
          </section>

          <Notice tone="info" title="No email system">
            All notices (quote replies, verification, moderation) are delivered to the in-app
            notification inbox. This deployment does not send email.
          </Notice>
        </aside>
      </div>
    </div>
  )
}
