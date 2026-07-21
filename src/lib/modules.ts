import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Search, MapPin, ScanBarcode, ArrowLeftRight, PencilRuler,
  PackageCheck, PackageOpen, Undo2, Send, ShieldAlert, ListChecks, FileBarChart,
  Map, Boxes, Building2, Building, Users, Bell,
} from 'lucide-react'
import type { Profile, UserRole } from './types'

export interface AppModule {
  key: string
  label: string
  to: string
  icon: LucideIcon
  /** Roles that get this module unless a per-user override says otherwise. */
  defaultRoles: UserRole[]
  /** Always available — not shown as a toggle (Home, Alerts). */
  alwaysOn?: boolean
}

const ALL: UserRole[] = ['security', 'storekeeper', 'planner', 'manager', 'admin']

/**
 * Single source of truth for what exists in the app: drives the sidebar, the
 * routes, and the per-user access checkboxes. Order here is the nav order.
 */
export const MODULES: AppModule[] = [
  { key: 'home', label: 'Home', to: '/', icon: LayoutDashboard, defaultRoles: ALL, alwaysOn: true },
  { key: 'find', label: 'Find Item', to: '/find', icon: Search, defaultRoles: ['storekeeper', 'planner', 'manager', 'admin'] },
  { key: 'assign', label: 'Assign Location', to: '/assign', icon: MapPin, defaultRoles: ['storekeeper', 'manager', 'admin'] },
  { key: 'capture', label: 'Capture', to: '/capture', icon: ScanBarcode, defaultRoles: ['storekeeper', 'manager', 'admin'] },
  { key: 'transfer', label: 'Transfer', to: '/transfer', icon: ArrowLeftRight, defaultRoles: ['storekeeper', 'manager', 'admin'] },
  { key: 'adjust', label: 'Adjust', to: '/adjust', icon: PencilRuler, defaultRoles: ['storekeeper', 'manager', 'admin'] },
  { key: 'grn', label: 'Receiving', to: '/grn', icon: PackageCheck, defaultRoles: ['security', 'storekeeper', 'manager', 'admin'] },
  { key: 'release', label: 'Release Requests', to: '/release', icon: PackageOpen, defaultRoles: ['planner', 'storekeeper', 'manager', 'admin'] },
  { key: 'returns', label: 'Returns', to: '/returns', icon: Undo2, defaultRoles: ['storekeeper', 'planner', 'manager', 'admin'] },
  { key: 'dispatch', label: 'Dispatch', to: '/dispatch', icon: Send, defaultRoles: ['security', 'storekeeper', 'manager', 'admin'] },
  { key: 'qc', label: 'QC Hold', to: '/qc', icon: ShieldAlert, defaultRoles: ['storekeeper', 'manager', 'admin'] },
  { key: 'counts', label: 'Stock Counts', to: '/counts', icon: ListChecks, defaultRoles: ['storekeeper', 'manager', 'admin'] },
  { key: 'so_movement', label: 'SO Movement', to: '/so-movement', icon: Search, defaultRoles: ['manager', 'admin'] },
  { key: 'export', label: 'ERP Export', to: '/export', icon: FileBarChart, defaultRoles: ['manager', 'admin'] },
  { key: 'admin_zones', label: 'Zones & Locations', to: '/admin/zones', icon: Map, defaultRoles: ['manager', 'admin'] },
  { key: 'admin_items', label: 'Items', to: '/admin/items', icon: Boxes, defaultRoles: ['manager', 'admin'] },
  { key: 'admin_parties', label: 'Parties', to: '/admin/parties', icon: Building2, defaultRoles: ['manager', 'admin'] },
  { key: 'admin_users', label: 'Users & Roles', to: '/admin/users', icon: Users, defaultRoles: ['admin'] },
  { key: 'admin_company', label: 'Company Profile', to: '/admin/company', icon: Building, defaultRoles: ['admin'] },
  { key: 'alerts', label: 'Alerts', to: '/alerts', icon: Bell, defaultRoles: ALL, alwaysOn: true },
]

/** Modules an admin can switch on/off per person. */
export const TOGGLEABLE_MODULES = MODULES.filter((m) => !m.alwaysOn)

type AccessProfile = Pick<Profile, 'role'> & { module_access?: Record<string, boolean> | null }

/**
 * Effective access: a per-user override wins; otherwise the role default.
 * Note this governs what the app offers — the database still enforces
 * role-level rules underneath.
 */
export function canAccess(profile: AccessProfile | null | undefined, key: string): boolean {
  if (!profile) return false
  const module = MODULES.find((m) => m.key === key)
  if (!module) return false
  if (module.alwaysOn) return true
  const override = profile.module_access?.[key]
  if (typeof override === 'boolean') return override
  return module.defaultRoles.includes(profile.role)
}

/** Sidebar entries for this person, in MODULES order. */
export function navForProfile(profile: AccessProfile | null | undefined): AppModule[] {
  if (!profile) return []
  return MODULES.filter((m) => canAccess(profile, m.key))
}
