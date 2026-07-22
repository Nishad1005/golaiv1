import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '../stores/auth'

export interface TenantSettings {
  tenant_id: string
  edit_lock_hours: number
  approval_qty_threshold: number | null
  working_hours_start: string
  working_hours_end: string
  photo_retention_days: number
}

/** Same fallback the database uses when a tenant has no settings row yet. */
export const DEFAULT_EDIT_LOCK_HOURS = 24

export const EDIT_LOCK_CHOICES = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours (recommended)' },
  { value: 48, label: '2 days' },
  { value: 168, label: '1 week' },
]

/** The tenant's settings row. Cached app-wide — it changes very rarely. */
export function useSettings() {
  const tenantId = useAuth((s) => s.profile?.tenant_id)
  return useQuery({
    queryKey: ['tenant-settings', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TenantSettings | null> => {
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('tenant_id, edit_lock_hours, approval_qty_threshold, working_hours_start, working_hours_end, photo_retention_days')
        .eq('tenant_id', tenantId!)
        .maybeSingle()
      if (error) throw error
      return data as TenantSettings | null
    },
  })
}

/** Minutes left before an entry can no longer be undone; 0 once it has closed. */
export function minutesLeft(lockedUntil: string | null): number {
  if (!lockedUntil) return 0
  return Math.max(0, Math.round((new Date(lockedUntil).getTime() - Date.now()) / 60_000))
}

/** "12 minutes left" / "3 hours left" — how long an undo stays available. */
export function undoWindowLabel(lockedUntil: string | null): string | null {
  const mins = minutesLeft(lockedUntil)
  if (mins <= 0) return null
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} left`
  const hours = Math.floor(mins / 60)
  return `${hours} hour${hours === 1 ? '' : 's'} left`
}
