import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { fetchers, qk } from '@/lib/queries'
import { cn, initials } from '@/lib/format'
import { Badge } from '@/components/ui/Primitives'

const primaryNav: { to: string; label: string; end?: boolean }[] = [
  { to: '/catalogue', label: 'Catalogue' },
  { to: '/studio/women', label: 'Women' },
  { to: '/studio/men', label: 'Men' },
  { to: '/fitting-room', label: 'Fitting room' },
  { to: '/inspiration', label: 'Inspiration' },
  { to: '/designs', label: 'Projects' },
  { to: '/marketplace', label: 'Print partners' },
]

export function SiteHeader() {
  const { user, status, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

  const notifications = useQuery({
    queryKey: qk.notifications,
    queryFn: fetchers.notifications,
    enabled: Boolean(user),
    refetchInterval: 60_000,
  })

  useEffect(() => {
    setMenuOpen(false)
    setAccountOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!accountOpen) return
    const onClick = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [accountOpen])

  const unread = notifications.data?.unread ?? 0

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-sm">
      <div className="shell flex h-16 items-center justify-between gap-6">
        <Link to="/" className="group flex items-baseline gap-2" aria-label="AI Fashion Studio home">
          <span className="font-display text-[1.35rem] leading-none tracking-tight">AI Fashion</span>
          <span className="hidden text-[0.625rem] uppercase tracking-[0.28em] text-ink-muted sm:inline">Studio</span>
        </Link>

        <nav className="hidden items-center gap-4 lg:flex xl:gap-6" aria-label="Main">
          {primaryNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'text-[0.8125rem] font-medium transition-colors hover:text-clay',
                  isActive ? 'text-ink' : 'text-ink-muted',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <Link
                to="/notifications"
                className="relative flex size-9 items-center justify-center text-ink-soft hover:text-ink"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              >
                <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
                  <path
                    d="M5 8a5 5 0 0 1 10 0v3l1.5 2.5h-13L5 11V8Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path d="M8 16.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex size-3.5 items-center justify-center rounded-full bg-clay text-[0.5rem] font-medium text-paper">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>

              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((open) => !open)}
                  className="flex size-9 items-center justify-center rounded-full border border-line bg-bone text-[0.6875rem] font-medium tracking-wide hover:border-ink"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                >
                  {initials(user.full_name)}
                </button>
                {accountOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-11 w-60 border border-line bg-paper p-1.5 shadow-lift"
                  >
                    <div className="border-b border-line px-3 py-2.5">
                      <p className="truncate text-sm">{user.full_name}</p>
                      <p className="truncate text-xs text-ink-muted">{user.email}</p>
                      <Badge className="mt-2" tone={user.role === 'admin' ? 'ink' : 'neutral'}>
                        {user.role}
                      </Badge>
                    </div>
                    {[
                      { to: '/dashboard', label: 'Dashboard' },
                      { to: '/designs', label: 'Saved designs' },
                      { to: '/avatar', label: 'Avatar studio' },
                      { to: '/try-on', label: 'Virtual try-on' },
                      { to: '/favorites', label: 'Saved pieces' },
                      { to: '/profile', label: 'Profile & measurements' },
                      { to: '/outfits', label: 'Saved outfits' },
                      { to: '/orders', label: 'Requests & orders' },
                      { to: '/print', label: 'Print packages' },
                      ...(user.role === 'business' || user.role === 'admin'
                        ? [{ to: '/business', label: 'Business dashboard' }]
                        : []),
                      { to: '/settings', label: 'Settings' },
                      ...(user.role === 'admin' ? [{ to: '/admin', label: 'Admin dashboard' }] : []),
                    ].map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        role="menuitem"
                        className="block px-3 py-2 text-xs text-ink-soft hover:bg-bone hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={async () => {
                        await logout()
                        navigate('/')
                      }}
                      className="mt-1 w-full border-t border-line px-3 py-2 text-left text-xs text-ink-soft hover:bg-bone hover:text-ink"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {status !== 'loading' && (
                <Link
                  to="/login"
                  className="hidden text-[0.6875rem] uppercase tracking-[0.16em] text-ink-muted hover:text-ink sm:block"
                >
                  Sign in
                </Link>
              )}
              <Link
                to="/register"
                className="border border-ink bg-ink px-3.5 py-2 text-[0.625rem] uppercase tracking-[0.16em] text-paper transition-colors hover:bg-ink-soft"
              >
                Start free
              </Link>
            </div>
          )}

          <button
            type="button"
            className="flex size-9 items-center justify-center lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-line bg-paper lg:hidden">
          <nav className="shell grid gap-1 py-3" aria-label="Mobile">
            {primaryNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="py-2.5 text-sm text-ink-soft hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            {user ? (
              <div className="mt-1 border-t border-line pt-2">
                {[
                  { to: '/dashboard', label: 'Dashboard' },
                  { to: '/avatar', label: 'Avatar studio' },
                  { to: '/favorites', label: 'Saved pieces' },
                  { to: '/outfits', label: 'Saved outfits' },
                  { to: '/profile', label: 'Profile & measurements' },
                  { to: '/settings', label: 'Settings' },
                ].map((item) => (
                  <Link key={item.to} to={item.to} className="block py-2 text-sm text-ink-soft hover:text-ink">
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link to="/login" className="py-2.5 text-sm text-ink-soft hover:text-ink">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
