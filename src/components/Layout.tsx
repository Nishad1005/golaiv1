import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 bg-ink text-cream shadow-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <span className="text-lg font-bold tracking-wide">AKSURE</span>
          <span className="hidden text-xs text-tan sm:block">
            Aksure runs the floor. Your ERP runs the books.
          </span>
          <div className="ml-auto flex items-center gap-3">
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
