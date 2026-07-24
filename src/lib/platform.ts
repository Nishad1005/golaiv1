import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '../stores/auth'
import { TOGGLEABLE_MODULES } from './modules'

/**
 * Modules a company can be licensed for.
 *
 * Everything in the app today is included in the base product — no licence row
 * needed. Only modules listed here are gated at company level, so adding one is
 * a deliberate act. `costing` is the first.
 */
export const LICENSED_MODULES: { key: string; label: string; blurb: string }[] = [
  { key: 'costing', label: 'Costing', blurb: 'Product costing sheets, rate tables and quotations' },
]

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

/**
 * Which licensed modules the signed-in user's own company holds.
 *
 * Deliberately separate from `canAccess()` in lib/modules: that governs what a
 * *person* may open, this governs what the *company* has bought. Both must pass.
 */
export function useTenantModules() {
  const tenantId = useAuth((s) => s.profile?.tenant_id)
  return useQuery({
    queryKey: ['tenant-modules', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('tenant_modules')
        .select('module_key')
        .eq('enabled', true)
      if (error) return []
      return ((data ?? []) as { module_key: string }[]).map((r) => r.module_key)
    },
  })
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

/** Sanity check for the console: keys that exist as licences but not as modules. */
export function unknownLicenceKeys(keys: string[]): string[] {
  const known = new Set([...TOGGLEABLE_MODULES.map((m) => m.key), ...LICENSED_MODULES.map((m) => m.key)])
  return keys.filter((k) => !known.has(k))
}
