import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AtSign, Building, Check, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LogOut,
  Phone, ShieldCheck, TriangleAlert, X,
} from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { logActivity } from '../lib/audit'
import { useTenant } from '../lib/tenant'
import { canAccess, TOGGLEABLE_MODULES } from '../lib/modules'
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../lib/password'
import { PageHeader } from '../components/PageHeader'

const ROLE_LABELS: Record<string, string> = {
  security: 'Security',
  storekeeper: 'Storekeeper',
  planner: 'Production Planner',
  manager: 'Manager',
  admin: 'Admin',
}

const ROLE_TONES: Record<string, string> = {
  security: 'bg-amber-50 text-amber-700',
  storekeeper: 'bg-sky-50 text-sky-700',
  planner: 'bg-violet-50 text-violet-700',
  manager: 'bg-brand-50 text-brand-700',
  admin: 'bg-ink-100 text-ink-700',
}

/** Meter colours by strength score — index 0 is "nothing typed". */
const METER_FILL = ['bg-ink-200', 'bg-red-500', 'bg-amber-500', 'bg-brand-400', 'bg-brand-600']
const METER_TEXT = ['text-ink-400', 'text-red-600', 'text-amber-600', 'text-brand-600', 'text-brand-700']

/** "Rajesh Kumar Sharma" → "RS". Falls back to the first letter, then a dash. */
function initialsOf(name: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function Detail({ icon: Icon, label, value, muted }: {
  icon: LucideIcon
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
        <dd className={`truncate ${muted ? 'text-ink-400' : 'font-medium text-ink-800'}`}>{value}</dd>
      </div>
    </div>
  )
}

/**
 * My Account — every user can change their own password here. Staff are created
 * with an admin-issued temporary password, so this is how they replace it.
 * Uses supabase.auth.updateUser (the user is already authenticated; no
 * service-role/edge function involved).
 *
 * Also shows which parts of the app this person can use, so "why can't I see
 * Dispatch?" answers itself instead of becoming a call to the admin.
 */
export function Account() {
  const { profile, signOut } = useAuth()
  const { data: tenant } = useTenant()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)

  const strength = passwordStrength(password)
  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const matches = confirm.length > 0 && password === confirm
  const canSubmit = longEnough && matches

  const allowed = TOGGLEABLE_MODULES.filter((m) => canAccess(profile, m.key))

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!longEnough) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      if (password !== confirm) throw new Error('The two passwords do not match.')

      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)

      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'update.own_password',
        entityType: 'profile',
        entityId: profile!.id,
      })
    },
    onSuccess: () => {
      setDone(true)
      setPassword('')
      setConfirm('')
      setShow(false)
    },
  })

  return (
    <div>
      <PageHeader title="My Account" subtitle="Your details, your password, and what you can use." />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* ---------- Who you are ---------- */}
        <div className="space-y-4">
          <section className="card overflow-hidden p-0">
            <div className="h-24 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700" />
            <div className="px-5 pb-5">
              <div className="-mt-10 inline-flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-brand-50 text-2xl font-bold text-brand-700 shadow-card">
                {initialsOf(profile?.full_name)}
              </div>

              <h2 className="mt-3 text-xl font-bold tracking-tight text-ink-900">
                {profile?.full_name}
              </h2>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`badge ${ROLE_TONES[profile?.role ?? ''] ?? 'bg-ink-100 text-ink-700'}`}>
                  {ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}
                </span>
                {profile?.is_platform_admin && (
                  <span className="badge bg-navy text-white">
                    <ShieldCheck className="h-3 w-3" /> Platform admin
                  </span>
                )}
                {profile?.status === 'inactive' && (
                  <span className="badge bg-red-50 text-red-700">Inactive</span>
                )}
              </div>

              <dl className="mt-5 space-y-3.5 border-t border-ink-200/70 pt-4 text-sm">
                <Detail icon={AtSign} label="Email" value={profile?.email ?? 'Not set'} muted={!profile?.email} />
                <Detail icon={Phone} label="Mobile" value={profile?.phone ?? 'Not set'} muted={!profile?.phone} />
                <Detail icon={Building} label="Company" value={tenant?.name ?? '—'} />
              </dl>

              <p className="mt-4 rounded-xl bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-500">
                You can sign in with either your email or your mobile number — whichever is set above.
              </p>
            </div>
          </section>

          <button
            onClick={() => void signOut()}
            className="min-h-tap inline-flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-5 text-base font-semibold text-red-600 shadow-card transition-colors hover:border-red-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>

        {/* ---------- Password + access ---------- */}
        <div className="space-y-4 lg:col-span-2">
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault()
              setDone(false)
              changePassword.mutate()
            }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-ink-900">Change password</h2>
                <p className="text-sm text-ink-400">
                  Signed in with a temporary password from your admin? Set your own here.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label-text" htmlFor="new-password">New password</label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={show ? 'text' : 'password'}
                    className="input-field pr-14"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100"
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 gap-1" aria-hidden>
                    {[1, 2, 3, 4].map((step) => (
                      <span
                        key={step}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          step <= strength.score ? METER_FILL[strength.score] : 'bg-ink-200'
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`w-12 shrink-0 text-right text-xs font-semibold ${METER_TEXT[strength.score]}`}>
                    {strength.label}
                  </span>
                </div>

                <p className={`mt-2 flex items-center gap-1.5 text-xs ${longEnough ? 'text-brand-700' : 'text-ink-400'}`}>
                  {longEnough
                    ? <Check className="h-3.5 w-3.5 shrink-0" />
                    : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-ink-300" />}
                  At least {MIN_PASSWORD_LENGTH} characters
                </p>
              </div>

              <div>
                <label className="label-text" htmlFor="confirm-password">Repeat new password</label>
                <input
                  id="confirm-password"
                  type={show ? 'text' : 'password'}
                  className={`input-field ${confirm.length > 0 && !matches ? 'border-red-300' : ''}`}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                {confirm.length > 0 && (
                  <p className={`mt-2 flex items-center gap-1.5 text-xs ${matches ? 'text-brand-700' : 'text-red-600'}`}>
                    {matches ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                    {matches ? 'Both entries match' : 'The two entries do not match yet'}
                  </p>
                )}
              </div>
            </div>

            {changePassword.isError && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {(changePassword.error as Error).message}
              </p>
            )}
            {done && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Password changed. Use the new one the next time you sign in.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-200/70 pt-4">
              <button type="submit" className="btn-primary" disabled={!canSubmit || changePassword.isPending}>
                {changePassword.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                Update password
              </button>
              <p className="text-xs text-ink-400">
                Forgotten it later? Your admin issues a new one from Users &amp; Roles.
              </p>
            </div>
          </form>

          {/* ---------- What this person can open ---------- */}
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-ink-900">What you can use</h2>
              <span className="badge bg-ink-100 text-ink-600 tabular-nums">
                {allowed.length} of {TOGGLEABLE_MODULES.length} sections
              </span>
            </div>

            {allowed.length > 0 ? (
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {allowed.map((m) => (
                  <li
                    key={m.key}
                    className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-sm font-medium text-ink-700"
                  >
                    <m.icon className="h-4 w-4 shrink-0 text-brand-600" />
                    <span className="truncate">{m.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-ink-400">
                No sections are switched on for you yet — ask your admin.
              </p>
            )}

            <p className="mt-4 text-xs leading-relaxed text-ink-400">
              Your admin sets this from Users &amp; Roles. If something you need is missing, ask them
              to switch it on for you.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
