// Golai — create-user Edge Function
//
// Lets a tenant's Admin create staff logins from inside the app, without ever
// exposing the service-role key to the browser. Flow:
//   1. Verify the caller's JWT (the logged-in admin).
//   2. Confirm the caller's profile has role = 'admin'.
//   3. Create the auth user (service role) and send a set-password invite email.
//   4. Insert their profile row in the SAME tenant as the admin.
//
// Deploy: supabase functions deploy create-user
// Secrets used (auto-available in Supabase-hosted functions):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ROLES = ['security', 'storekeeper', 'planner', 'manager', 'admin']

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
    if (profErr || !caller) return json({ error: 'Profile not found' }, 403)
    if (caller.role !== 'admin') return json({ error: 'Only an admin can create users' }, 403)

    const { email, full_name, role, phone } = await req.json()
    if (!email || !full_name || !role) return json({ error: 'email, full_name and role are required' }, 400)
    if (!ALLOWED_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400)

    // 3. Create the auth user + send them a set-password invite (service role)
    const admin = createClient(url, serviceKey)
    const { data: created, error: createErr } = await admin.auth.admin.inviteUserByEmail(email)
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'Could not create user' }, 400)
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
      // Roll back the orphaned auth user so a retry is clean
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: insertErr.message }, 400)
    }

    return json({ id: created.user.id, email, full_name, role })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
