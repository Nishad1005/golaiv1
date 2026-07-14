// Golai — create-user Edge Function
//
// Lets a tenant's Admin create staff logins from inside the app, without ever
// exposing the service-role key to the browser. Flow:
//   1. Verify the caller's JWT (the logged-in admin).
//   2. Confirm the caller's profile has role = 'admin'.
//   3. Create the auth user with a temporary password (email pre-confirmed).
//   4. Insert their profile row in the SAME tenant as the admin.
//   5. Return the temporary password so the admin can hand it to the staff
//      member — no email delivery required (many floor staff have no email).
//
// Deploy: supabase functions deploy create-user
// Secrets (auto-available in Supabase-hosted functions):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ROLES = ['security', 'storekeeper', 'planner', 'manager', 'admin']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Readable, reasonably strong temporary password (no ambiguous chars).
function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(10)
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

    // 1. Identify the caller from their JWT
    const authHeader = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

    // 2. Caller must be an admin; capture their tenant
    const { data: caller, error: profErr } = await asCaller
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', userData.user.id)
      .single()
    if (profErr || !caller) return json({ error: 'Profile not found for caller' }, 403)
    if (caller.role !== 'admin') return json({ error: 'Only an admin can create users' }, 403)

    const { email, full_name, role, phone } = await req.json()
    if (!email || !full_name || !role) {
      return json({ error: 'Name, email and role are required' }, 400)
    }
    if (!ALLOWED_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400)

    // 3. Create the auth user with a temp password, email pre-confirmed
    const admin = createClient(url, serviceKey)
    const password = tempPassword()
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'Could not create login' }, 400)
    }

    // 4. Profile row in the admin's tenant
    const { error: insertErr } = await admin.from('profiles').insert({
      id: created.user.id,
      tenant_id: caller.tenant_id,
      email,
      phone: phone ?? null,
      full_name,
      role,
    })
    if (insertErr) {
      await admin.auth.admin.deleteUser(created.user.id) // roll back orphan
      return json({ error: insertErr.message }, 400)
    }

    // 5. Hand the temp password back to the admin to share
    return json({ id: created.user.id, email, full_name, role, temp_password: password })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
