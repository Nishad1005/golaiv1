import { Link, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

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
      <header className="sticky top-0 z-10 bg-ink text-cream shadow-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <span className="text-lg font-bold tracking-wide">AKSURE</span>
          <span className="hidden text-xs text-tan sm:block">
            Aksure runs the floor. Your ERP runs the books.
          </span>
          <div className="ml-auto flex items-center gap-3">
            <Link
              to="/alerts"
              className="relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-ink-700"
              aria-label="Alerts"
            >
              <Bell className="h-5 w-5" />
              {(unread ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread! > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
            {profile && (
              <div className="text-right leading-tight">
                <div className="text-sm font-medium">{profile.full_name}</div>
                <div className="text-xs text-tan">{ROLE_LABELS[profile.role]}</div>
              </div>
            )}
            <button
              onClick={() => void signOut()}
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-ink-700"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
