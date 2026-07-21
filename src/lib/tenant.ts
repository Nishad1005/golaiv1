import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '../stores/auth'
import type { Tenant } from './types'

/** The logged-in user's company — name, logo, contact. Cached app-wide. */
export function useTenant() {
  const tenantId = useAuth((s) => s.profile?.tenant_id)
  return useQuery({
    queryKey: ['tenant', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Tenant> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, logo_url, gst_number, address, contact_email, contact_phone')
        .eq('id', tenantId!)
        .single()
      if (error) throw error
      return data as Tenant
    },
  })
}

/** Public URL for a logo stored in the branding bucket. */
export function logoPublicUrl(path: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path // tolerate a full URL stored directly
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl
}
