import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AtSign, BadgeCheck, Building, Camera, Check, CheckCircle2, ChevronDown, ChevronRight,
  Eye, EyeOff, IdCard, KeyRound, Loader2, Lock, LogOut, Pencil, Phone, ShieldCheck,
  Trash2, TriangleAlert, X,
} from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { logActivity } from '../lib/audit'
import { useTenant, logoPublicUrl } from '../lib/tenant'
import { avatarPublicUrl, initialsOf } from '../lib/avatar'
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

const MAX_PHOTO_BYTES = 3_000_000

function Detail({ icon: Icon, label, value, muted, action }: {
  icon: LucideIcon
  label: string
  value: string
  muted?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
        <dd className={`truncate ${muted ? 'text-ink-400' : 'font-medium text-ink-800'}`}>{value}</dd>
      </div>
      {action}
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
  const { profile, signOut, refreshProfile } = useAuth()
  const { data: tenant } = useTenant()
  const photoInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)
  const [editingId, setEditingId] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [cardError, setCardError] = useState<string | null>(null)

  const strength = passwordStrength(password)
  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const matches = confirm.length > 0 && password === confirm
  const canSubmit = longEnough && matches

  const allowed = TOGGLEABLE_MODULES.filter((m) => canAccess(profile, m.key))
  const photo = avatarPublicUrl(profile?.avatar_url)
  const companyLogo = logoPublicUrl(tenant?.logo_url ?? null)

  /**
   * The one write the person may make to their own card: photo and employee
   * number. Position and role are missing on purpose — those come from the
   * admin (migration 0018).
   */
  const saveCard = useMutation({
    mutationFn: async (next: { avatar_url?: string | null; employee_id?: string | null }) => {
      const { error } = await supabase.rpc('set_my_profile', {
        p_avatar_url: next.avatar_url !== undefined ? next.avatar_url : profile!.avatar_url,
        p_employee_id: next.employee_id !== undefined ? next.employee_id : profile!.employee_id,
      })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'update.own_profile',
        entityType: 'profile',
        entityId: profile!.id,
      })
      await refreshProfile()
    },
    onError: (e) => setCardError((e as Error).message),
  })

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
      if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be under 3 MB.')
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      // Path must be <tenant>/<user>/… — the storage policy in 0018 checks both.
      const path = `${profile!.tenant_id}/${profile!.id}/photo-${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (error) throw new Error(`Upload failed: ${error.message}`)
      await saveCard.mutateAsync({ avatar_url: path })
    },
    onError: (e) => setCardError((e as Error).message),
  })

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
        {/* ---------- The ID card ---------- */}
        <section className="card overflow-hidden p-0">
          <div className="relative h-24 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700">
            {companyLogo && (
              <img
                src={companyLogo}
                alt={tenant?.name ?? 'Company'}
                className="absolute right-4 top-4 h-9 w-9 rounded-lg bg-white/95 object-contain p-1 shadow-sm"
              />
            )}
          </div>

          <div className="px-5 pb-5">
            <div className="relative -mt-12 inline-block">
              {photo ? (
                <img
                  src={photo}
                  alt={profile?.full_name ?? 'Profile photo'}
                  className="h-24 w-24 rounded-2xl border-4 border-white bg-white object-cover shadow-card"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-brand-50 text-3xl font-bold text-brand-700 shadow-card">
                  {initialsOf(profile?.full_name)}
                </div>
              )}
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                disabled={uploadPhoto.isPending}
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-ink-800 text-white shadow-card transition-colors hover:bg-ink-900 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                aria-label={photo ? 'Change profile photo' : 'Add a profile photo'}
                title={photo ? 'Change photo' : 'Add a photo'}
              >
                {uploadPhoto.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  : <Camera className="h-4 w-4" aria-hidden />}
              </button>
              <input
                ref={photoInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="user"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  setCardError(null)
                  if (file) uploadPhoto.mutate(file)
                  e.target.value = ''
                }}
              />
            </div>

            {photo && (
              <button
                type="button"
                onClick={() => { setCardError(null); saveCard.mutate({ avatar_url: null }) }}
                disabled={saveCard.isPending}
                className="ml-3 inline-flex items-center gap-1 align-bottom text-xs font-medium text-ink-400 transition-colors hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove photo
              </button>
            )}

            <h2 className="mt-3 text-xl font-bold tracking-tight text-ink-900">{profile?.full_name}</h2>
            {profile?.designation && (
              <p className="text-sm font-medium text-ink-500">{profile.designation}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`badge ${ROLE_TONES[profile?.role ?? ''] ?? 'bg-ink-100 text-ink-700'}`}
                title="Your role is set by your company admin"
              >
                <Lock className="h-3 w-3" aria-hidden />
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
              {editingId ? (
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setCardError(null)
                    saveCard.mutate({ employee_id: employeeId.trim() || null })
                    setEditingId(false)
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <label className="label-text" htmlFor="employee-id">Employee ID</label>
                    <input
                      id="employee-id"
                      className="input-field"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="e.g. UM-114"
                      maxLength={40}
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="btn-primary px-4" disabled={saveCard.isPending}>
                    {saveCard.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : 'Save'}
                  </button>
                  <button type="button" className="btn-secondary px-4" onClick={() => setEditingId(false)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <Detail
                  icon={IdCard}
                  label="Employee ID"
                  value={profile?.employee_id ?? 'Not set'}
                  muted={!profile?.employee_id}
                  action={
                    <button
                      type="button"
                      onClick={() => { setEmployeeId(profile?.employee_id ?? ''); setEditingId(true) }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      aria-label={profile?.employee_id ? 'Change employee ID' : 'Add employee ID'}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                  }
                />
              )}
              <Detail
                icon={BadgeCheck}
                label="Position"
                value={profile?.designation ?? 'Set by your admin'}
                muted={!profile?.designation}
              />
              <Detail icon={AtSign} label="Email" value={profile?.email ?? 'Not set'} muted={!profile?.email} />
              <Detail icon={Phone} label="Mobile" value={profile?.phone ?? 'Not set'} muted={!profile?.phone} />
              <Detail icon={Building} label="Company" value={tenant?.name ?? '—'} />
            </dl>

            {cardError && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {cardError}
              </p>
            )}

            <p className="mt-4 rounded-xl bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-500">
              Your <b>position</b> and <b>role</b> are assigned by your company admin and cannot be
              changed here. Sign in with either your email or your mobile number.
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
