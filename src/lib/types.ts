// Core domain types mirroring supabase/migrations. Hand-maintained for now;
// can be replaced by `supabase gen types typescript` output once the project
// is linked to a Supabase instance.

export type UserRole = 'security' | 'storekeeper' | 'planner' | 'manager' | 'admin'

export interface Profile {
  id: string
  tenant_id: string
  email: string | null
  phone: string | null
  full_name: string
  role: UserRole
  status: 'active' | 'inactive'
  last_login_at: string | null
}

export interface Zone {
  id: string
  tenant_id: string
  code: string
  name: string
  description: string | null
  default_category: string | null
}

export type FixtureType = 'S' | 'G' | 'P' | 'R'

export interface Shelf {
  id: string
  tenant_id: string
  zone_id: string
  code: string
  fixture_type: FixtureType
  description: string | null
}

export interface Item {
  id: string
  tenant_id: string
  code: string
  barcode: string | null
  name: string
  description: string | null
  category: string | null
  sub_category: string | null
  uom: string
  reorder_point: number | null
  reorder_qty: number | null
  default_zone_id: string | null
  status: 'active' | 'inactive'
}

export interface StockBalance {
  tenant_id: string
  item_id: string
  shelf_id: string
  qty_on_hand: number
  qty_on_hold: number
  last_movement_at: string
}

/** Item locator search result: item + where it lives. The app's core promise. */
export interface ItemLocation {
  item: Item
  shelf_code: string
  zone_code: string
  zone_name: string
  qty_on_hand: number
  qty_on_hold: number
}

// Shelf code validation per PRD 4.1: Z<zone>-<fixture><number>, e.g. Z02-S012
export const SHELF_CODE_REGEX = /^Z(\d+)-([SGPR])(\d+)$/i
