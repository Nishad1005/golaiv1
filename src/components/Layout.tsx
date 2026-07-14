import { Link, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-navy text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <img src="/logo.svg" alt="Golai" className="h-9 w-9 rounded-xl shadow-sm" />
          <div className="leading-none">
            <span className="text-lg font-bold tracking-tight">Golai</span>
            <span className="ml-2 hidden text-xs font-medium text-ink-300 sm:inline">
              runs the floor. Your ERP runs the books.
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/alerts"
              className="relative flex h-11 w-11 items-center justify-center rounded-xl text-ink-200 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Alerts"
            >
              <Bell className="h-5 w-5" />
              {(unread ?? 0) > 0 && (
                <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-navy">
                  {unread! > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
            {profile && (
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-semibold">{profile.full_name}</div>
                <div className="text-xs text-ink-300">{ROLE_LABELS[profile.role]}</div>
              </div>
            )}
            <button
              onClick={() => void signOut()}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-200 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <OfflineBanner />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 animate-fade-in">
        <Outlet />
      </main>
    </div>
  )
}
