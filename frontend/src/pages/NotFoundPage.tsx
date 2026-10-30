import { Link } from 'react-router-dom'
import { LinkButton } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="shell flex min-h-[70vh] flex-col justify-center py-16">
      <p className="eyebrow">404</p>
      <h1 className="display-xl mt-3 max-w-2xl">
        This pattern does not exist in the archive.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
        The page may have been renamed, or the garment was unpublished. The studio and the catalogue
        are still open.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton to="/studio/women">Browse womenswear</LinkButton>
        <LinkButton to="/studio/men" variant="outline">
          Browse menswear
        </LinkButton>
      </div>
      <nav className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
        {[
          { to: '/', label: 'Home' },
          { to: '/outfits', label: 'Outfits' },
          { to: '/fitting-room', label: 'Fitting room' },
          { to: '/assistant', label: 'Stylist' },
          { to: '/marketplace', label: 'Marketplace' },
        ].map((item) => (
          <Link key={item.to} to={item.to} className="hover:text-ink">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
