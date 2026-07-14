// Golai — delete-user Edge Function
//
// Permanently removes a staff login. Admin-only, same-tenant only, never self.
// Hard delete is refused (with a clear message) when the user has any history,
// so the audit trail's "who did this" stays intact — the admin deactivates
// those users instead (a plain profiles.status update, done client-side).
//
// Deploy: supabase functions deploy delete-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

    const { data: caller, error: profErr } = await asCaller
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', userData.user.id)
      .single()
    if (profErr || !caller) return json({ error: 'Profile not found for caller' }, 403)
    if (caller.role !== 'admin') return json({ error: 'Only an admin can delete users' }, 403)

    const { user_id } = await req.json()
    if (!user_id) return json({ error: 'user_id is required' }, 400)
    if (user_id === userData.user.id) return json({ error: 'You cannot delete your own account' }, 400)

    const admin = createClient(url, serviceKey)

    // Confirm the target is in the caller's tenant (never cross-tenant)
    const { data: target } = await admin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user_id)
      .single()
    if (!target || target.tenant_id !== caller.tenant_id) {
      return json({ error: 'User not found in your warehouse' }, 404)
    }

    // Hard delete cascades to the profile; other tables reference the profile
    // with RESTRICT, so a user with history triggers an FK error → we translate
    // that into a "deactivate instead" message.
    const { error: delErr } = await admin.auth.admin.deleteUser(user_id)
    if (delErr) {
      const msg = delErr.message ?? ''
      if (/foreign key|violat|referenced/i.test(msg)) {
        return json(
          { error: 'This user has recorded transactions, so they cannot be permanently deleted (it would break the audit trail). Deactivate them instead.' },
          409,
        )
      }
      return json({ error: msg || 'Could not delete user' }, 400)
    }

    return json({ ok: true })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
