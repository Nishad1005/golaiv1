import { supabase } from './supabase'

/**
 * Append an entry to the immutable activity log.
 * Every state-changing action in every module must call this (PRD 4.12).
 * Failures are logged but never block the business action itself.
 */
export async function logActivity(params: {
  tenantId: string
  userId: string
  userRole: string
  action: string // e.g. 'create.entry', 'approve.release'
  entityType: string
  entityId?: string
  before?: unknown
  after?: unknown
}): Promise<void> {
  const { error } = await supabase.from('activity_log').insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    user_role: params.userRole,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
    device: navigator.userAgent,
  })
  if (error) console.error('audit log write failed:', error.message)
}
