import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, LogOut, Menu, Rocket, Settings, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { useTenant, logoPublicUrl } from '../lib/tenant'
import { navForRole } from '../lib/nav'
import { OfflineBanner } from './OfflineBanner'

const ROLE_LABELS: Record<string, string> = {
  security: 'Security',
  storekeeper: 'Storekeeper',
  planner: 'Production Planner',
  manager: 'Manager',
  admin: 'Admin',
}

export function Layout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data: tenant } = useTenant()
  const logoUrl = logoPublicUrl(tenant?.logo_url ?? null)
  const companyName = tenant?.name ?? 'Golai'

  const { data: unread } = useQuery({
    queryKey: ['alerts-unread'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'UNREAD')
      if (error) return 0
      return count ?? 0
    },
  })

  const nav = profile ? [...navForRole(profile.role)] : []
  // DBBS platform admins get the cross-tenant "Provision Client" destination.
  if (profile?.is_platform_admin) {
    nav.push({ label: 'Provision Client', to: '/provision', icon: Rocket })
  }

  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/')

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = isActive(item.to)
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={
              'flex min-h-tap items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ' +
              (active
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-ink-300 hover:bg-white/10 hover:text-white')
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{item.label}</span>
            {item.to === '/alerts' && (unread ?? 0) > 0 && (
              <span
                className={
                  'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ' +
                  (active ? 'bg-white text-brand-600' : 'bg-brand-500 text-white')
                }
              >
                {unread! > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
        )
      })}
    </nav>
  )

  // Company branding: the logged-in tenant's logo + name (falls back to Golai).
  const SidebarHeader = (
    <Link to="/" className="flex items-center gap-2.5" onClick={() => setDrawerOpen(false)}>
      {logoUrl ? (
        <img src={logoUrl} alt={companyName} className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain shadow-sm" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white shadow-sm">
          {companyName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <div className="truncate text-lg font-bold tracking-tight text-white">{companyName}</div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-ink-300">Powered by Golai</div>
      </div>
    </Link>
  )

  return (
    <div className="flex min-h-dvh bg-cream">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-navy px-3 py-4 lg:flex">
        <div className="px-2 pb-5">{SidebarHeader}</div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        {profile && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2">
              <Link
                to="/account"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/10"
                title="My account — change password"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                  {profile.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-semibold text-white">{profile.full_name}</div>
                  <div className="text-xs text-ink-300">{ROLE_LABELS[profile.role]}</div>
                </div>
                <Settings className="ml-auto h-4 w-4 shrink-0 text-ink-300" />
              </Link>
              <button
                onClick={() => void signOut()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white"
                aria-label="Sign out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-navy px-3 py-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between px-2 pb-5">
              {SidebarHeader}
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
              <Link
                to="/account"
                onClick={() => setDrawerOpen(false)}
                className="flex min-h-tap items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-300 hover:bg-white/10 hover:text-white"
              >
                <UserRound className="h-5 w-5 shrink-0" />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-white">My Account</span>
                  <span className="block text-xs text-ink-300">Change password</span>
                </span>
              </Link>
              <button
                onClick={() => void signOut()}
                className="flex min-h-tap w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-300 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-5 w-5" /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
                {companyName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="truncate text-lg font-bold tracking-tight text-navy">{companyName}</span>
          </Link>
          <Link
            to="/alerts"
            className="relative ml-auto flex h-11 w-11 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100"
            aria-label="Alerts"
          >
            <Bell className="h-5 w-5" />
            {(unread ?? 0) > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {unread! > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
        </header>

        <OfflineBanner />

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
