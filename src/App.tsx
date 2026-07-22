import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from './stores/auth'
import { canAccess } from './lib/modules'
import { useOffline } from './lib/offline/queue'
import { refreshMasterCache } from './lib/offline/masters'
import { registerPush } from './lib/push'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Account } from './pages/Account'
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
import { CompanyProfile } from './pages/admin/CompanyProfile'
import { Settings } from './pages/admin/Settings'
import { ProvisionClient } from './pages/ProvisionClient'
import { Capture } from './pages/store/Capture'
import { Transfer } from './pages/store/Transfer'
import { Adjustments } from './pages/store/Adjustments'
import { AssignLocation } from './pages/store/AssignLocation'
import { FindItem } from './pages/FindItem'
import { ItemMovement } from './pages/ItemMovement'
import { GrnList } from './pages/grn/GrnList'
import { GateEntry } from './pages/grn/GateEntry'
import { GrnDetail } from './pages/grn/GrnDetail'
import { ReleaseRequestList } from './pages/release/ReleaseRequestList'
import { ReleaseRequestNew } from './pages/release/ReleaseRequestNew'
import { ReleaseRequestDetail } from './pages/release/ReleaseRequestDetail'
import { Returns } from './pages/release/Returns'
import { DispatchList } from './pages/dispatch/DispatchList'
import { DispatchNew } from './pages/dispatch/DispatchNew'
import { DispatchDetail } from './pages/dispatch/DispatchDetail'
import { QcHolds } from './pages/dispatch/QcHolds'
import { CountList } from './pages/counts/CountList'
import { CountDetail } from './pages/counts/CountDetail'
import { Alerts } from './pages/manager/Alerts'
import { SoMovement } from './pages/manager/SoMovement'
import { Export } from './pages/manager/Export'
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
      <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
    </div>
  )
}

export default function App() {
  const { session, profile, loading, initialize } = useAuth()

  useEffect(() => {
    void initialize()
    void useOffline.getState().init()
  }, [initialize])

  // Cache shelves + items locally for offline scan validation (PRD 7.5),
  // and register for push on native builds
  useEffect(() => {
    if (profile && navigator.onLine) {
      void refreshMasterCache().catch(() => {})
      void registerPush(profile.id).catch(() => {})
    }
  }, [profile])

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
            Your login works, but no Golai profile exists yet. Ask your Admin to add you to a
            warehouse and assign your role.
          </p>
          <button className="btn-secondary mt-4 w-full" onClick={() => void useAuth.getState().signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (profile.status !== 'active') {
    // Deactivated by an admin — login works but access is revoked. Their name
    // stays on their historical records; they just can't act anymore.
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div className="card max-w-sm">
          <p className="font-semibold">Account deactivated</p>
          <p className="mt-1 text-sm text-ink-400">
            Your Golai access has been turned off. Contact your Admin if this is a mistake.
          </p>
          <button className="btn-secondary mt-4 w-full" onClick={() => void useAuth.getState().signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const Home = HOME_BY_ROLE[profile.role]
  // Routes follow the same effective access as the sidebar: role default,
  // overridden per person by the admin's module checkboxes.
  const can = (key: string) => canAccess(profile, key)

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          {can('capture') && <Route path="/capture" element={<Capture />} />}
          {can('transfer') && <Route path="/transfer" element={<Transfer />} />}
          {can('adjust') && <Route path="/adjust" element={<Adjustments />} />}
          {can('assign') && <Route path="/assign" element={<AssignLocation />} />}
          {can('find') && <Route path="/find" element={<FindItem />} />}
          {can('find') && <Route path="/item/:id" element={<ItemMovement />} />}
          {can('grn') && (
            <>
              <Route path="/grn" element={<GrnList />} />
              <Route path="/grn/:id" element={<GrnDetail />} />
              {(profile.role === 'security' || profile.role === 'manager' || profile.role === 'admin') && (
                <Route path="/grn/new" element={<GateEntry />} />
              )}
            </>
          )}
          {can('release') && (
            <>
              <Route path="/release" element={<ReleaseRequestList />} />
              <Route path="/release/:id" element={<ReleaseRequestDetail />} />
              {profile.role !== 'security' && profile.role !== 'storekeeper' && (
                <Route path="/release/new" element={<ReleaseRequestNew />} />
              )}
            </>
          )}
          {can('returns') && <Route path="/returns" element={<Returns />} />}
          {can('dispatch') && (
            <>
              <Route path="/dispatch" element={<DispatchList />} />
              <Route path="/dispatch/:id" element={<DispatchDetail />} />
              {profile.role !== 'security' && <Route path="/dispatch/new" element={<DispatchNew />} />}
            </>
          )}
          {can('qc') && <Route path="/qc" element={<QcHolds />} />}
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/account" element={<Account />} />
          {can('counts') && (
            <>
              <Route path="/counts" element={<CountList />} />
              <Route path="/counts/:id" element={<CountDetail />} />
            </>
          )}
          {can('so_movement') && <Route path="/so-movement" element={<SoMovement />} />}
          {can('export') && <Route path="/export" element={<Export />} />}
          {can('admin_zones') && <Route path="/admin/zones" element={<ZonesShelves />} />}
          {can('admin_items') && <Route path="/admin/items" element={<Items />} />}
          {can('admin_parties') && <Route path="/admin/parties" element={<Parties />} />}
          {can('admin_users') && <Route path="/admin/users" element={<Users />} />}
          {can('admin_company') && <Route path="/admin/company" element={<CompanyProfile />} />}
          {can('admin_settings') && <Route path="/admin/settings" element={<Settings />} />}
          {profile.is_platform_admin && <Route path="/provision" element={<ProvisionClient />} />}
          <Route path="*" element={<ComingSoon />} />
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
