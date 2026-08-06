// Golai — platform-reset-password Edge Function
//
// Lets a DBBS platform admin set a new password for a CLIENT COMPANY's admin —
// the account they themselves provisioned. The temp password from provisioning
// is shown once; if it's lost the whole company is locked out. The tenant-scoped
// reset-password function can't help here (it is admin-role, same-tenant only,
// and DBBS lives in its own tenant), so this is the platform equivalent: same
// no-email/no-SMS flow, the new password shown once to hand over.
//
// Platform-admin-only (profiles.is_platform_admin = true); works across tenants.
// Deploy: supabase functions deploy platform-reset-password

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function generatedPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return 'Golai-' + Array.from(bytes, (b) => chars[b % chars.length]).join('')
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

    // Caller must be a DBBS platform admin — the entire security boundary.
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: userData, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

    const { data: caller } = await asCaller
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', userData.user.id)
      .single()
    if (!caller?.is_platform_admin) {
      return json({ error: 'Only a Golai platform admin can reset a company admin password' }, 403)
    }

    const { user_id, password } = await req.json()
    if (!user_id) return json({ error: 'user_id is required' }, 400)

    const chosen = typeof password === 'string' ? password.trim() : ''
    if (chosen && chosen.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400)
    }
    const newPassword = chosen || generatedPassword()

    const admin = createClient(url, serviceKey)

    // Target must be a real profile (any tenant — DBBS manages all companies).
    const { data: target } = await admin
      .from('profiles')
      .select('email, phone')
      .eq('id', user_id)
      .single()
    if (!target) return json({ error: 'User not found' }, 404)

    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
      password: newPassword,
    })
    if (updErr) return json({ error: updErr.message }, 400)

    return json({
      login_id: target.phone ?? target.email,
      password: newPassword,
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
