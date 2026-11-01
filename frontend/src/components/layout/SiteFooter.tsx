import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'

export function SiteFooter() {
  const config = useQuery({ queryKey: qk.config, queryFn: fetchers.config, staleTime: 300_000 })

  return (
    <footer className="mt-24 border-t border-line bg-bone/40">
      <div className="shell grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-display text-2xl leading-none">AI Fashion Studio</p>
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">
            A virtual atelier: design each garment component, fit it on your own avatar, and send
            the finished technical pack to a tailor or printer.
          </p>
          <p className="text-[0.625rem] uppercase tracking-[0.18em] text-ink-muted">
            Free to use · fair-use limits apply
          </p>
        </div>

        <div className="space-y-2">
          <p className="label-xs">Studio</p>
          {[
            { to: '/studio', label: 'Studio overview' },
            { to: '/studio/women', label: 'Womenswear' },
            { to: '/studio/men', label: 'Menswear' },
            { to: '/studio/accessories', label: 'Shoes & accessories' },
            { to: '/fitting-room', label: 'Fitting room' },
            { to: '/assistant', label: 'AI stylist' },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="block text-sm text-ink-soft hover:text-clay">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="space-y-2">
          <p className="label-xs">Production</p>
          {[
            { to: '/marketplace', label: 'Ateliers & printers' },
            { to: '/designs', label: 'Design library' },
            { to: '/outfits', label: 'Outfit library' },
            { to: '/orders', label: 'Requests & quotes' },
            { to: '/profile', label: 'Measurements' },
            { to: '/settings', label: 'Settings' },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="block text-sm text-ink-soft hover:text-clay">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="space-y-2">
          <p className="label-xs">Platform</p>
          <p className="text-sm text-ink-soft">
            {config.data?.providers.find((provider) => provider.usable)?.label ?? 'Offline rule engine'}
            <span className="block text-xs text-ink-muted">
              {config.data?.providers.find((provider) => provider.usable)
                ? 'AI provider connected'
                : 'No AI key configured'}
            </span>
          </p>
          <p className="text-xs text-ink-muted">Version {config.data?.version ?? '1.0.0'}</p>
          <p className="text-xs leading-relaxed text-ink-muted">
            Uploads stay private. Nothing is shared with third parties; no analytics scripts.
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="shell flex flex-col gap-2 py-5 text-[0.625rem] uppercase tracking-[0.16em] text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} AI Fashion Studio</span>
          <span>Designed for real production, not just previews</span>
        </div>
      </div>
    </footer>
  )
}
