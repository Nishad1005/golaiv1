import { lazy, useEffect } from 'react'
import type { ComponentType } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from './stores/auth'
import { canAccess } from './lib/modules'
import { useOffline } from './lib/offline/queue'
import { refreshMasterCache } from './lib/offline/masters'
import { registerPush } from './lib/push'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import type { UserRole } from './lib/types'

/**
 * Every screen is a separate chunk, fetched the first time someone opens it.
 * The app is used on entry-level Android over warehouse Wi-Fi, so shipping
 * all 25 screens on first load made the login screen wait for the dispatch
 * gate-out form nobody had asked for yet.
 */
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })))
const ComingSoon = lazy(() => import('./pages/ComingSoon').then((m) => ({ default: m.ComingSoon })))
const SecurityHome = lazy(() => import('./pages/home/SecurityHome').then((m) => ({ default: m.SecurityHome })))
const StorekeeperHome = lazy(() => import('./pages/home/StorekeeperHome').then((m) => ({ default: m.StorekeeperHome })))
const PlannerHome = lazy(() => import('./pages/home/PlannerHome').then((m) => ({ default: m.PlannerHome })))
const ManagerHome = lazy(() => import('./pages/home/ManagerHome').then((m) => ({ default: m.ManagerHome })))
const AdminHome = lazy(() => import('./pages/home/AdminHome').then((m) => ({ default: m.AdminHome })))
const ZonesShelves = lazy(() => import('./pages/admin/ZonesShelves').then((m) => ({ default: m.ZonesShelves })))
const Items = lazy(() => import('./pages/admin/Items').then((m) => ({ default: m.Items })))
const Parties = lazy(() => import('./pages/admin/Parties').then((m) => ({ default: m.Parties })))
const Users = lazy(() => import('./pages/admin/Users').then((m) => ({ default: m.Users })))
const CompanyProfile = lazy(() => import('./pages/admin/CompanyProfile').then((m) => ({ default: m.CompanyProfile })))
const Settings = lazy(() => import('./pages/admin/Settings').then((m) => ({ default: m.Settings })))
const ProvisionClient = lazy(() => import('./pages/ProvisionClient').then((m) => ({ default: m.ProvisionClient })))
const Capture = lazy(() => import('./pages/store/Capture').then((m) => ({ default: m.Capture })))
const Transfer = lazy(() => import('./pages/store/Transfer').then((m) => ({ default: m.Transfer })))
const Adjustments = lazy(() => import('./pages/store/Adjustments').then((m) => ({ default: m.Adjustments })))
const AssignLocation = lazy(() => import('./pages/store/AssignLocation').then((m) => ({ default: m.AssignLocation })))
const FindItem = lazy(() => import('./pages/FindItem').then((m) => ({ default: m.FindItem })))
const ItemMovement = lazy(() => import('./pages/ItemMovement').then((m) => ({ default: m.ItemMovement })))
const GrnList = lazy(() => import('./pages/grn/GrnList').then((m) => ({ default: m.GrnList })))
const GateEntry = lazy(() => import('./pages/grn/GateEntry').then((m) => ({ default: m.GateEntry })))
const GrnDetail = lazy(() => import('./pages/grn/GrnDetail').then((m) => ({ default: m.GrnDetail })))
const ReleaseRequestList = lazy(() => import('./pages/release/ReleaseRequestList').then((m) => ({ default: m.ReleaseRequestList })))
const ReleaseRequestNew = lazy(() => import('./pages/release/ReleaseRequestNew').then((m) => ({ default: m.ReleaseRequestNew })))
const ReleaseRequestDetail = lazy(() => import('./pages/release/ReleaseRequestDetail').then((m) => ({ default: m.ReleaseRequestDetail })))
const Returns = lazy(() => import('./pages/release/Returns').then((m) => ({ default: m.Returns })))
const DispatchList = lazy(() => import('./pages/dispatch/DispatchList').then((m) => ({ default: m.DispatchList })))
const DispatchNew = lazy(() => import('./pages/dispatch/DispatchNew').then((m) => ({ default: m.DispatchNew })))
const DispatchDetail = lazy(() => import('./pages/dispatch/DispatchDetail').then((m) => ({ default: m.DispatchDetail })))
const QcHolds = lazy(() => import('./pages/dispatch/QcHolds').then((m) => ({ default: m.QcHolds })))
const CountList = lazy(() => import('./pages/counts/CountList').then((m) => ({ default: m.CountList })))
const CountDetail = lazy(() => import('./pages/counts/CountDetail').then((m) => ({ default: m.CountDetail })))
const Alerts = lazy(() => import('./pages/manager/Alerts').then((m) => ({ default: m.Alerts })))
const SoMovement = lazy(() => import('./pages/manager/SoMovement').then((m) => ({ default: m.SoMovement })))
const Export = lazy(() => import('./pages/manager/Export').then((m) => ({ default: m.Export })))


/** Each role lands on its own home screen on login (PRD 3, 7.4). */
const HOME_BY_ROLE: Record<UserRole, ComponentType> = {
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
