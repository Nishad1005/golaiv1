import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from './stores/auth'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { ComingSoon } from './pages/ComingSoon'
import { SecurityHome } from './pages/home/SecurityHome'
import { StorekeeperHome } from './pages/home/StorekeeperHome'
import { PlannerHome } from './pages/home/PlannerHome'
import { ManagerHome } from './pages/home/ManagerHome'
import { AdminHome } from './pages/home/AdminHome'
import { ZonesShelves } from './pages/admin/ZonesShelves'
import { Items } from './pages/admin/Items'
import { Parties } from './pages/admin/Parties'
import { Users } from './pages/admin/Users'
import type { UserRole } from './lib/types'

/** Each role lands on its own home screen on login (PRD 3, 7.4). */
const HOME_BY_ROLE: Record<UserRole, () => JSX.Element> = {
  security: SecurityHome,
  storekeeper: StorekeeperHome,
  planner: PlannerHome,
  manager: ManagerHome,
  admin: AdminHome,
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-tan-dark" />
    </div>
  )
}

export default function App() {
  const { session, profile, loading, initialize } = useAuth()

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (loading) return <FullScreenSpinner />

  if (!session) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    )
  }

  if (!profile) {
    // Authenticated but no profile row yet — needs Admin to assign tenant/role.
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div className="card max-w-sm">
          <p className="font-semibold">Account not set up</p>
          <p className="mt-1 text-sm text-ink-400">
            Your login works, but no Aksure profile exists yet. Ask your Admin to add you to a
            warehouse and assign your role.
          </p>
          <button className="btn-secondary mt-4 w-full" onClick={() => void useAuth.getState().signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const Home = HOME_BY_ROLE[profile.role]
  const isAdminish = profile.role === 'admin' || profile.role === 'manager'

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          {isAdminish && (
            <>
              <Route path="/admin/zones" element={<ZonesShelves />} />
              <Route path="/admin/items" element={<Items />} />
              <Route path="/admin/parties" element={<Parties />} />
              {profile.role === 'admin' && <Route path="/admin/users" element={<Users />} />}
            </>
          )}
          <Route path="*" element={<ComingSoon />} />
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
