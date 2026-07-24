import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '../stores/auth'
import { MODULES } from './modules'
import type { CompanyModules } from './modules'

/**
 * Friendly names for modules the console can grant. Most come from the nav
 * registry; anything not yet in the nav (a module registered in the database
 * before its screens exist) gets a label here.
 */
const EXTRA_LABELS: Record<string, { label: string; blurb: string }> = {
  costing: { label: 'Costing', blurb: 'Product costing sheets, rate tables and quotations' },
}

export function moduleLabel(key: string): { label: string; blurb: string } {
  const nav = MODULES.find((m) => m.key === key)
  if (nav) return { label: nav.label, blurb: '' }
  return EXTRA_LABELS[key] ?? { label: key, blurb: '' }
}

/** One module as the console sees it for a given company. */
export interface TenantModuleRow {
  module_key: string
  requires_license: boolean
  enabled: boolean
  /** True when DBBS has made an explicit decision, rather than the default. */
  is_explicit: boolean
}

export interface PlatformTenant {
  id: string
  name: string
  plan: string
  status: 'active' | 'inactive'
  created_at: string
  contact_email: string | null
  contact_phone: string | null
  admin_names: string | null
  user_count: number
  active_user_count: number
  item_count: number
  zone_count: number
  location_count: number
  located_count: number
  module_keys: string[]
  last_activity_at: string | null
}

export interface PlatformSummary {
  tenant_count: number
  active_tenant_count: number
  user_count: number
  item_count: number
  actions_7d: number
}

/** Every company on the platform, with usage — DBBS only (RPC refuses others). */
export function usePlatformTenants() {
  return useQuery({
    queryKey: ['platform-tenants'],
    queryFn: async (): Promise<PlatformTenant[]> => {
      const { data, error } = await supabase.rpc('platform_tenants')
      if (error) throw new Error(error.message)
      return (data ?? []) as PlatformTenant[]
    },
  })
}

export function usePlatformSummary() {
  return useQuery({
    queryKey: ['platform-summary'],
    queryFn: async (): Promise<PlatformSummary | null> => {
      const { data, error } = await supabase.rpc('platform_summary')
      if (error) throw new Error(error.message)
      return (Array.isArray(data) ? data[0] : data) as PlatformSummary | null
    },
  })
}

/** Every module for one company, as the console shows them. */
export function useTenantModuleGrid(tenantId: string | null) {
  return useQuery({
    queryKey: ['platform-tenant-modules', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantModuleRow[]> => {
      const { data, error } = await supabase.rpc('platform_tenant_modules', {
        p_tenant_id: tenantId,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as TenantModuleRow[]
    },
  })
}

/**
 * What the signed-in user's own COMPANY holds — `{ dispatch: false }`.
 *
 * Deliberately separate from `canAccess()`: that governs what a *person* may
 * open, this governs what the *company* has. Both must pass, and the database
 * enforces the same rule independently (migration 0026).
 */
export function useCompanyModules(): CompanyModules {
  const tenantId = useAuth((s) => s.profile?.tenant_id)
  const { data } = useQuery({
    queryKey: ['company-modules', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const [mods, grants] = await Promise.all([
        supabase.from('modules').select('key, requires_license'),
        supabase.from('tenant_modules').select('module_key, enabled'),
      ])
      const explicit = new Map(
        ((grants.data ?? []) as { module_key: string; enabled: boolean }[])
          .map((r) => [r.module_key, r.enabled]),
      )
      const out: Record<string, boolean> = {}
      for (const m of (mods.data ?? []) as { key: string; requires_license: boolean }[]) {
        out[m.key] = explicit.has(m.key) ? explicit.get(m.key)! : !m.requires_license
      }
      return out
    },
  })
  return data
}

/** How far a company has got with setup — the same signals as the admin checklist. */
export function onboardingProgress(t: PlatformTenant): { done: number; total: number } {
  const steps = [
    t.zone_count > 0,
    t.location_count > 0,
    t.item_count > 0,
    t.user_count > 1,
    t.located_count > 0,
  ]
  return { done: steps.filter(Boolean).length, total: steps.length }
}


