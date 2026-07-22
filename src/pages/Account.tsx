import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AtSign, Building, Check, CheckCircle2, ChevronDown, ChevronRight, Eye, EyeOff,
  KeyRound, Loader2, LogOut, Phone, ShieldCheck, TriangleAlert, X,
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
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
        <dd className={`truncate ${muted ? 'text-ink-400' : 'font-medium text-ink-800'}`}>{value}</dd>
      </div>
    </div>
  )
}

/**
 * My Account — who you are, the sections you can open, and your password.
 *
 * The password form is deliberately collapsed behind a "Change" button
 * (progressive disclosure): changing it is a rare action, so it should not be
 * the first thing on the page. Shortcuts to the modules this person can use are
 * the everyday value, and they double as an answer to "why can't I see
 * Dispatch?" without a call to the admin.
 *
 * Password changes go through supabase.auth.updateUser — the user is already
 * authenticated, so no service-role/edge function is involved.
 */
export function Account() {
  const { profile, signOut } = useAuth()
  const { data: tenant } = useTenant()
  const [open, setOpen] = useState(false)
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
    // Collapse on success so the confirmation, not the form, is what's left on screen.
    onSuccess: () => {
      setDone(true)
      setOpen(false)
      setPassword('')
      setConfirm('')
      setShow(false)
    },
  })

  return (
    <div>
      <PageHeader title="My Account" subtitle="Your details, your shortcuts, and your password." />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* ---------- Who you are ---------- */}
        <section className="card overflow-hidden p-0">
          <div className="h-24 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700" />
          <div className="px-5 pb-5">
            <div className="-mt-10 inline-flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-brand-50 text-2xl font-bold text-brand-700 shadow-card">
              {initialsOf(profile?.full_name)}
            </div>

            <h2 className="mt-3 text-xl font-bold tracking-tight text-ink-900">{profile?.full_name}</h2>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`badge ${ROLE_TONES[profile?.role ?? ''] ?? 'bg-ink-100 text-ink-700'}`}>
                {ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}
              </span>
              {profile?.is_platform_admin && (
                <span className="badge bg-navy text-white">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> Platform admin
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
              Sign in with either your email or your mobile number — whichever is set above.
            </p>
          </div>
        </section>

        <div className="space-y-4 lg:col-span-2">
          {/* ---------- Shortcuts: everything this person can open ---------- */}
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-ink-900">What you can use</h2>
                <p className="text-sm text-ink-400">Tap any section to open it.</p>
              </div>
              <span className="badge bg-ink-100 text-ink-600 tabular-nums">
                {allowed.length} of {TOGGLEABLE_MODULES.length}
              </span>
            </div>

            {allowed.length > 0 ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {allowed.map((m) => (
                  <li key={m.key}>
                    <Link
                      to={m.to}
                      className="group flex min-h-tap items-center gap-3 rounded-xl border border-ink-200/70 bg-white px-3 transition-all duration-200 hover:border-brand-200 hover:bg-brand-50/60 hover:shadow-card-hover active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700">
                        <m.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">
                        {m.label}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-ink-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-500 motion-reduce:transition-none"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-400">
                No sections are switched on for you yet — ask your admin.
              </p>
            )}

            <p className="mt-4 text-xs leading-relaxed text-ink-400">
              Your admin decides this from Users &amp; Roles. If something you need is missing, ask
              them to switch it on for you.
            </p>
          </section>

          {/* ---------- Password: quiet until asked for ---------- */}
          <section className="card">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500">
                <KeyRound className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-ink-900">Password</h2>
                {done && !open ? (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                    Changed — use the new one next time you sign in.
                  </p>
                ) : (
                  <p className="text-sm text-ink-400">
                    Signed in with a temporary one? Replace it with your own.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-secondary"
                aria-expanded={open}
                aria-controls="password-form"
                onClick={() => {
                  setOpen((v) => !v)
                  setDone(false)
                  setPassword('')
                  setConfirm('')
                  setShow(false)
                  changePassword.reset()
                }}
              >
                {open ? 'Cancel' : 'Change'}
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
            </div>

            {open && (
              <form
                id="password-form"
                className="mt-5 animate-fade-in border-t border-ink-200/70 pt-5 motion-reduce:animate-none"
                onSubmit={(e) => {
                  e.preventDefault()
                  changePassword.mutate()
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
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
                        className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
                            className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                              step <= strength.score ? METER_FILL[strength.score] : 'bg-ink-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className={`w-12 shrink-0 text-right text-xs font-semibold ${METER_TEXT[strength.score]}`}>
                        {strength.label}
                      </span>
                    </div>

                    <p className={`mt-2 flex items-center gap-1.5 text-xs ${longEnough ? 'text-brand-700' : 'text-ink-500'}`}>
                      {longEnough
                        ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-ink-300" aria-hidden />}
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
                        {matches
                          ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          : <X className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                        {matches ? 'Both entries match' : 'The two entries do not match yet'}
                      </p>
                    )}
                  </div>
                </div>

                {changePassword.isError && (
                  <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {(changePassword.error as Error).message}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="submit" className="btn-primary" disabled={!canSubmit || changePassword.isPending}>
                    {changePassword.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                    Update password
                  </button>
                  <p className="text-xs text-ink-400">
                    Forgotten it later? Your admin issues a new one from Users &amp; Roles.
                  </p>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>

      {/* Kept away from everything else — signing out is not a navigation choice. */}
      <div className="mt-6 border-t border-ink-200/70 pt-5">
        <button
          onClick={() => void signOut()}
          className="min-h-tap inline-flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-5 text-base font-semibold text-red-600 transition-colors duration-200 hover:border-red-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 sm:w-auto"
        >
          <LogOut className="h-5 w-5" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  )
}
