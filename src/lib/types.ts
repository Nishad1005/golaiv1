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
  is_platform_admin: boolean
  /** Photo in the public `avatars` bucket — the person sets their own. */
  avatar_url: string | null
  /** Company/HR number. Settable by the person or their admin. */
  employee_id: string | null
  /** Job title ("Assistant Store Manager"). Admin-assigned only — see 0018. */
  designation: string | null
  /** Per-user module overrides on top of the role defaults (see lib/modules). */
  module_access: Record<string, boolean> | null
}

export interface Tenant {
  id: string
  name: string
  logo_url: string | null
  gst_number: string | null
  address: string | null
  contact_email: string | null
  contact_phone: string | null
}

export interface Zone {
  id: string
  tenant_id: string
  code: string
  name: string
  description: string | null
  default_category: string | null
}

/** Client-named storage place ("Shelf", "Ghoda", "Rack", …) — free text. */
export type FixtureType = string

export interface Shelf {
  id: string
  tenant_id: string
  zone_id: string
  code: string
  fixture_type: FixtureType
  description: string | null
  /** Car-park layout only: the pallet's Block, and Row/Column within it. */
  pallet_block?: number | null
  pallet_row?: number | null
  pallet_col?: number | null
  /** Deprecated (0034): superseded by blocks; roads are drawn between blocks. */
  aisle_after?: boolean | null
}

export interface Item {
  id: string
  tenant_id: string
  code: string
  code_auto_assigned: boolean
  barcode: string | null
  name: string
  description: string | null
  item_type: string | null
  category: string | null
  sub_category: string | null
  uom: string
  reorder_point: number | null
  reorder_qty: number | null
  default_zone_id: string | null
  status: 'active' | 'inactive'
  /** Storage path of an identification photo (photos bucket); null = none. */
  photo_url?: string | null
  /** True for perishables tracked by the expiry module (batches + expiry). */
  tracks_expiry?: boolean
}

/** A received lot of a perishable item — expiry module (migration 0043). */
export interface ItemBatch {
  id: string
  tenant_id: string
  item_id: string
  batch_no: string | null
  mfg_date: string | null
  expiry_date: string
  received_qty: number | string | null
  shelf_id: string | null
  status: 'active' | 'finished' | 'removed'
  note: string | null
  received_by: string | null
  received_at: string
  created_at: string
}

export interface Requisition {
  id: string
  ref_no: string | null
  pdf_url: string | null
  note: string | null
  status: 'open' | 'completed'
  created_at: string
}

export interface RequisitionLine {
  id: string
  requisition_id: string
  item_id: string | null
  raw_product: string | null
  requested_qty: number
  issued_qty: number
  pr_no: string | null
  department: string | null
  work_order_no: string | null
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

// Shelf code format: Z<zone>-<fixture prefix><number>, e.g. Z02-S012, Z03-G001.
// The prefix is derived from the client's own fixture name (any letters).
// Pallet-block locations use a Block/Row/Col coordinate: Z05-A-R03-C02 (the block
// is a letter, matching its "Block A" label). Older pallets used Z05-B02R03C02,
// kept valid here so existing codes still resolve.
export const SHELF_CODE_REGEX = /^Z(\d+)-(?:([A-Z]+)(\d+)|B(\d+)R(\d+)C(\d+)|([A-Z])-R(\d+)-C(\d+))$/i
