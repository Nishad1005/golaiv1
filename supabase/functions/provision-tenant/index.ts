// Golai — provision-tenant Edge Function
//
// Creates a client COMPANY and its ADMIN together, atomically. Called only by
// DBBS platform admins (profiles.is_platform_admin = true) from the in-app
// Provision Client page. This replaces the old two-step "dashboard user + seed
// SQL" flow that produced mis-named, orphaned tenants.
//
// Flow: verify caller is a platform admin → (optionally block duplicate company
// name) → create tenant → create admin auth user (email or phone, temp
// password, pre-confirmed) → create admin profile in the new tenant. Any
// failure rolls back everything so no orphan company or login is left behind.
//
// Deploy: supabase functions deploy provision-tenant

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return 'Golai-' + Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

// E.164 normalization (mirror of src/lib/phone.ts), +91 default.
function normalizePhone(input: string): string | null {
  const trimmed = (input ?? '').trim()
  if (!trimmed || /[a-zA-Z@]/.test(trimmed)) return null
  const hasPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) return '+91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits
  return null
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

    // 1. Caller must be a platform admin
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
      return json({ error: 'Only a Golai platform admin can create companies' }, 403)
    }

    const body = await req.json()
    const companyName = (body.company_name ?? '').trim()
    const adminName = (body.admin_name ?? '').trim()
    const email = (body.admin_email ?? '').trim() || null
    const cleanPhone = body.admin_phone ? normalizePhone(body.admin_phone) : null
    const force = body.force === true

    if (!companyName) return json({ error: 'Company name is required' }, 400)
    if (!adminName) return json({ error: "Admin's name is required" }, 400)
    if (body.admin_phone && !cleanPhone) return json({ error: 'Enter a valid admin mobile number' }, 400)
    if (!email && !cleanPhone) return json({ error: 'Enter an admin email or mobile number' }, 400)

    const admin = createClient(url, serviceKey)

    // 2. Guard against a duplicate company name (unless explicitly forced)
    if (!force) {
      const { data: dupe } = await admin
        .from('tenants')
        .select('id')
        .ilike('name', companyName)
        .is('deleted_at', null)
        .maybeSingle()
      if (dupe) {
        return json(
          { error: `A company named "${companyName}" already exists. Use a distinct name, or confirm to create anyway.`, duplicate: true },
          409,
        )
      }
    }

    // 3. Create the tenant
    const { data: tenant, error: tenantErr } = await admin
      .from('tenants')
      .insert({
        name: companyName,
        gst_number: (body.gst_number ?? '').trim() || null,
        address: (body.address ?? '').trim() || null,
        contact_email: (body.contact_email ?? '').trim() || email,
        contact_phone: (body.contact_phone ?? '').trim() || cleanPhone,
      })
      .select('id')
      .single()
    if (tenantErr || !tenant) return json({ error: tenantErr?.message ?? 'Could not create company' }, 400)

    // 4. Create the admin login
    const password = tempPassword()
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      ...(email ? { email, email_confirm: true } : {}),
      ...(cleanPhone ? { phone: cleanPhone, phone_confirm: true } : {}),
      password,
      user_metadata: { full_name: adminName },
    })
    if (createErr || !created.user) {
      await admin.from('tenants').delete().eq('id', tenant.id) // rollback tenant
      return json({ error: createErr?.message ?? 'Could not create admin login' }, 400)
    }

    // 5. Admin profile in the new tenant
    const { error: profErr } = await admin.from('profiles').insert({
      id: created.user.id,
      tenant_id: tenant.id,
      email,
      phone: cleanPhone,
      full_name: adminName,
      role: 'admin',
    })
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id) // rollback login
      await admin.from('tenants').delete().eq('id', tenant.id) // rollback tenant
      return json({ error: profErr.message }, 400)
    }

    return json({
      tenant_id: tenant.id,
      company_name: companyName,
      admin_login: cleanPhone ?? email,
      temp_password: password,
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
