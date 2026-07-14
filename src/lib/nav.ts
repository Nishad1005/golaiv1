import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  ScanBarcode,
  ArrowLeftRight,
  PencilRuler,
  PackageCheck,
  PackageOpen,
  Undo2,
  Send,
  ShieldAlert,
  ListChecks,
  Search,
  FileBarChart,
  Map,
  Boxes,
  Building2,
  Users,
  Bell,
  LogIn,
} from 'lucide-react'
import type { UserRole } from './types'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

const HOME: NavItem = { label: 'Home', to: '/', icon: LayoutDashboard }
const ALERTS: NavItem = { label: 'Alerts', to: '/alerts', icon: Bell }

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  security: [
    HOME,
    { label: 'New Gate Entry', to: '/grn/new', icon: LogIn },
    { label: 'Receiving', to: '/grn', icon: PackageCheck },
    { label: 'Dispatch Gate-out', to: '/dispatch', icon: Send },
    ALERTS,
  ],
  storekeeper: [
    HOME,
    { label: 'Capture', to: '/capture', icon: ScanBarcode },
    { label: 'Transfer', to: '/transfer', icon: ArrowLeftRight },
    { label: 'Adjust', to: '/adjust', icon: PencilRuler },
    { label: 'Receiving', to: '/grn', icon: PackageCheck },
    { label: 'Release Requests', to: '/release', icon: PackageOpen },
    { label: 'Returns', to: '/returns', icon: Undo2 },
    { label: 'Dispatch', to: '/dispatch', icon: Send },
    { label: 'Stock Counts', to: '/counts', icon: ListChecks },
    ALERTS,
  ],
  planner: [
    HOME,
    { label: 'Release Requests', to: '/release', icon: PackageOpen },
    { label: 'Returns', to: '/returns', icon: Undo2 },
    ALERTS,
  ],
  manager: [
    HOME,
    { label: 'Receiving', to: '/grn', icon: PackageCheck },
    { label: 'Release Requests', to: '/release', icon: PackageOpen },
    { label: 'Dispatch', to: '/dispatch', icon: Send },
    { label: 'Adjustments', to: '/adjust', icon: PencilRuler },
    { label: 'QC Hold', to: '/qc', icon: ShieldAlert },
    { label: 'Stock Counts', to: '/counts', icon: ListChecks },
    { label: 'SO Movement', to: '/so-movement', icon: Search },
    { label: 'ERP Export', to: '/export', icon: FileBarChart },
    ALERTS,
  ],
  admin: [
    HOME,
    { label: 'Zones & Shelves', to: '/admin/zones', icon: Map },
    { label: 'Items', to: '/admin/items', icon: Boxes },
    { label: 'Parties', to: '/admin/parties', icon: Building2 },
    { label: 'Users & Roles', to: '/admin/users', icon: Users },
    { label: 'Receiving', to: '/grn', icon: PackageCheck },
    { label: 'Dispatch', to: '/dispatch', icon: Send },
    { label: 'Stock Counts', to: '/counts', icon: ListChecks },
    { label: 'ERP Export', to: '/export', icon: FileBarChart },
    ALERTS,
  ],
}

export function navForRole(role: UserRole): NavItem[] {
  return NAV_BY_ROLE[role] ?? [HOME, ALERTS]
}
