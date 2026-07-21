// Golai — reset-password Edge Function
//
// Lets a tenant Admin set a new password for one of their staff, without any
// email/SMS round-trip (floor staff often have neither). The admin either types
// a password they'll read out, or lets Golai generate one; either way it is
// shown on screen once to hand over.
//
// Admin-only, same-tenant only. Deploy: supabase functions deploy reset-password

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

    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: userData, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

    const { data: caller } = await asCaller
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', userData.user.id)
      .single()
    if (!caller) return json({ error: 'Profile not found for caller' }, 403)
    if (caller.role !== 'admin') return json({ error: 'Only an admin can reset passwords' }, 403)

    const { user_id, password } = await req.json()
    if (!user_id) return json({ error: 'user_id is required' }, 400)

    const chosen = typeof password === 'string' ? password.trim() : ''
    if (chosen && chosen.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400)
    }
    const newPassword = chosen || generatedPassword()

    const admin = createClient(url, serviceKey)

    // Never touch a user outside the admin's own company
    const { data: target } = await admin
      .from('profiles')
      .select('tenant_id, email, phone')
      .eq('id', user_id)
      .single()
    if (!target || target.tenant_id !== caller.tenant_id) {
      return json({ error: 'User not found in your company' }, 404)
    }

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
