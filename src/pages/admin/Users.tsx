import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IdCard, KeyRound, Loader2, Plus, Power, SlidersHorizontal, Trash2, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { canAccess, MODULES, TOGGLEABLE_MODULES } from '../../lib/modules'
import type { Profile, UserRole } from '../../lib/types'

async function invokeError(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return body.error as string
    } catch {
      /* fall through */
    }
  }
  return error.message
}

const ROLES: UserRole[] = ['security', 'storekeeper', 'planner', 'manager', 'admin']

export function Users() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', role: 'storekeeper' as UserRole })
  const [notice, setNotice] = useState<string | null>(null)
  const [resetting, setResetting] = useState<{ user: Profile; password: string } | null>(null)
  const [accessFor, setAccessFor] = useState<string | null>(null)
  const [detailsFor, setDetailsFor] = useState<{ id: string; employee_id: string; designation: string } | null>(null)

  const { data: users, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name')
      if (error) throw error
      return data as Profile[]
    },
  })

  // Creates the login AND the profile via the create-user Edge Function, which
  // holds the service-role key server-side (never in the browser). Returns a
  // temporary password the admin hands to the staff member — no email needed.
  const createUser = useMutation({
    mutationFn: async () => {
      if (!form.email.trim() && !form.phone.trim()) {
        throw new Error('Enter an email or a mobile number — at least one is needed to log in.')
      }
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          password: form.password.trim() || null,
          role: form.role,
        },
      })
      // functions.invoke hides the body on non-2xx — read it from the response
      if (error) {
        let detail = error.message
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json()
            if (body?.error) detail = body.error
          } catch {
            /* keep generic message */
          }
        }
        throw new Error(detail)
      }
      const result = data as { id: string; login_id: string; temp_password: string }
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.user',
        entityType: 'profile',
        entityId: result.id,
        after: { email: form.email.trim(), role: form.role },
      })
      return result
    },
    onSuccess: (result) => {
      setNotice(
        `Login created — user ID: ${result.login_id}, temporary password: ${result.temp_password}. Share both with them; they can change the password after signing in.`,
      )
      setForm({ full_name: '', email: '', phone: '', password: '', role: 'storekeeper' })
      setShowForm(false)
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })

  const changeRole = useMutation({
    mutationFn: async ({ user, role }: { user: Profile; role: UserRole }) => {
      // Guarded RPC — clients cannot write role/status/module_access directly
      const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: user.id, p_role: role })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'update.user_role',
        entityType: 'profile',
        entityId: user.id,
        before: { role: user.role },
        after: { role },
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })

  // Deactivate/reactivate: safe for staff who have history — blocks their login
  // but keeps their name on their past work.
  const setStatus = useMutation({
    mutationFn: async ({ user, status }: { user: Profile; status: 'active' | 'inactive' }) => {
      const { error } = await supabase.rpc('admin_set_user_status', { p_user_id: user.id, p_status: status })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: status === 'active' ? 'reactivate.user' : 'deactivate.user',
        entityType: 'profile',
        entityId: user.id,
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })

  // The HR facts on someone's ID card. Position is admin-only by design — a
  // person can set their own photo and employee number but must not be able to
  // give themselves a title (migration 0018).
  const setDetails = useMutation({
    mutationFn: async ({ user, employeeId, designation }: {
      user: Profile; employeeId: string; designation: string
    }) => {
      const { error } = await supabase.rpc('admin_set_user_details', {
        p_user_id: user.id,
        p_employee_id: employeeId.trim() || null,
        p_designation: designation.trim() || null,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'update.user_details',
        entityType: 'profile',
        entityId: user.id,
        after: { employee_id: employeeId.trim(), designation: designation.trim() },
      })
    },
    onSuccess: () => {
      setDetailsFor(null)
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (e) => setNotice((e as Error).message),
  })

  // Turn a single module on/off for one person. Stored as an override; clearing
  // it back to the role default removes the key entirely.
  const setModuleAccess = useMutation({
    mutationFn: async ({ user, key, allowed }: { user: Profile; key: string; allowed: boolean }) => {
      const current = { ...(user.module_access ?? {}) }
      const isDefault = MODULES.find((m) => m.key === key)?.defaultRoles.includes(user.role) ?? false
      if (allowed === isDefault) delete current[key]
      else current[key] = allowed

      const { error } = await supabase.rpc('admin_set_module_access', {
        p_user_id: user.id,
        p_access: current,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: allowed ? 'grant.module' : 'revoke.module',
        entityType: 'profile',
        entityId: user.id,
        after: { module: key },
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['profiles'] }),
    onError: (e) => setNotice((e as Error).message),
  })

  // Set a new password for a staff member — either one the admin types (easy to
  // read out on the floor) or a generated one. Shown once, to hand over.
  const resetPassword = useMutation({
    mutationFn: async ({ user, password }: { user: Profile; password: string }) => {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { user_id: user.id, password: password.trim() || null },
      })
      if (error) throw new Error(await invokeError(error))
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'reset.password',
        entityType: 'profile',
        entityId: user.id,
      })
      return data as { login_id: string; password: string }
    },
    onSuccess: (r, vars) => {
      setResetting(null)
      setNotice(
        `Password reset for ${vars.user.full_name} — user ID: ${r.login_id}, password: ${r.password}. Share both with them.`,
      )
    },
    onError: (e) => setNotice((e as Error).message),
  })

  // Permanent delete via edge function (service role). Refused for users with
  // history — the function tells the admin to deactivate instead.
  const deleteUser = useMutation({
    mutationFn: async (user: Profile) => {
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: user.id },
      })
      if (error) throw new Error(await invokeError(error))
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'delete.user',
        entityType: 'profile',
        entityId: user.id,
        before: { email: user.email, role: user.role },
      })
    },
    onSuccess: () => {
      setNotice('User permanently deleted.')
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (e) => setNotice((e as Error).message),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Users & Roles</h1>
        <button className="btn-primary" onClick={() => { setShowForm((v) => !v); setNotice(null) }}>
          <Plus className="h-5 w-5" /> New User
        </button>
      </div>
      <p className="text-sm text-ink-400">
        Five roles only. Each role gets its own home screen and permissions. Add staff here — they
        receive an email to set their own password and appear in the list below.
      </p>

      {notice && (
        <div className="flex items-start gap-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <span className="flex-1">{notice}</span>
          <button className="shrink-0 font-medium underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {resetting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4"
          onClick={() => !resetPassword.isPending && setResetting(null)}>
          <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-lg font-bold">Reset password</p>
              <p className="mt-1 text-sm text-ink-500">
                For <b>{resetting.user.full_name}</b> ({[resetting.user.email, resetting.user.phone].filter(Boolean).join(' · ')})
              </p>
            </div>
            <div>
              <label className="label-text">New password</label>
              <input
                className="input-field"
                autoFocus
                placeholder="Leave blank to generate one"
                value={resetting.password}
                onChange={(e) => setResetting({ ...resetting, password: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') resetPassword.mutate(resetting)
                }}
              />
              <p className="mt-1 text-xs text-ink-400">
                Minimum 6 characters. You'll see it on screen to hand over — it is not emailed.
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={resetPassword.isPending}
                onClick={() => resetPassword.mutate(resetting)}>
                {resetPassword.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                Set password
              </button>
              <button className="btn-secondary" disabled={resetPassword.isPending}
                onClick={() => setResetting(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <form
          className="card grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            createUser.mutate()
          }}
        >
          <div>
            <label className="label-text">Full name</label>
            <input className="input-field" value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div>
            <label className="label-text">Email</label>
            <input type="email" className="input-field" value={form.email}
              placeholder="Leave blank to use mobile instead"
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label-text">Mobile number</label>
            <input type="tel" inputMode="tel" className="input-field" value={form.phone}
              placeholder="9829012345"
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <p className="mt-1 text-xs text-ink-400">
              They can log in with either — enter at least one of email / mobile.
            </p>
          </div>
          <div>
            <label className="label-text">Role</label>
            <select className="input-field" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Password (optional)</label>
            <input className="input-field" value={form.password}
              placeholder="Leave blank to generate one"
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="mt-1 text-xs text-ink-400">
              Set one you can read out to them (min 6 characters), or leave blank.
            </p>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={createUser.isPending}>
              {createUser.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
              Create & send invite
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          {createUser.isError && (
            <p className="text-sm text-red-600 sm:col-span-2">{(createUser.error as Error).message}</p>
          )}
        </form>
      )}

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />
      ) : (
        <div className="card divide-y divide-tan/20 p-0">
          {(users ?? []).map((u) => {
            const isSelf = u.id === profile!.id
            const inactive = u.status !== 'active'
            return (
              <div key={u.id} className={inactive ? 'opacity-60' : ''}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {u.full_name}
                    {inactive && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        deactivated
                      </span>
                    )}
                  </div>
                  {(u.designation || u.employee_id) && (
                    <div className="truncate text-sm text-ink-500">
                      {[u.designation, u.employee_id && `ID ${u.employee_id}`].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className="truncate text-sm text-ink-400">
                    {[u.email, u.phone].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <select
                  className="input-field ml-auto w-auto"
                  value={u.role}
                  disabled={isSelf || inactive || changeRole.isPending}
                  onChange={(e) => changeRole.mutate({ user: u, role: e.target.value as UserRole })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    className={
                      'flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-cream ' +
                      (detailsFor?.id === u.id ? 'bg-cream text-ink-700' : 'text-ink-500')
                    }
                    title="Set this person's employee ID and position"
                    onClick={() =>
                      setDetailsFor(
                        detailsFor?.id === u.id
                          ? null
                          : { id: u.id, employee_id: u.employee_id ?? '', designation: u.designation ?? '' },
                      )
                    }
                  >
                    <IdCard className="h-4 w-4" />
                    ID card
                  </button>
                  {!isSelf && (
                    <>
                    <button
                      className={
                        'flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-cream ' +
                        (accessFor === u.id ? 'bg-cream text-ink-700' : 'text-ink-500')
                      }
                      title="Choose which parts of the app this person can use"
                      onClick={() => setAccessFor(accessFor === u.id ? null : u.id)}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      Access
                    </button>
                    <button
                      className="flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-ink-500 hover:bg-cream"
                      title="Set a new password for this user"
                      onClick={() => setResetting({ user: u, password: '' })}
                    >
                      <KeyRound className="h-4 w-4" />
                      Reset password
                    </button>
                    <button
                      className="flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-ink-500 hover:bg-cream"
                      title={inactive ? 'Reactivate — restore access' : 'Deactivate — block login, keep history'}
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({ user: u, status: inactive ? 'active' : 'inactive' })
                      }
                    >
                      <Power className="h-4 w-4" />
                      {inactive ? 'Reactivate' : 'Deactivate'}
                    </button>
                    <button
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete permanently (only if they have no recorded activity)"
                      disabled={deleteUser.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Permanently delete ${u.full_name}? This only works if they have no recorded transactions — otherwise deactivate them instead.`,
                          )
                        )
                          deleteUser.mutate(u)
                      }}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                    </>
                  )}
                </div>
              </div>

              {detailsFor?.id === u.id && (
                <form
                  className="border-t border-ink-100 bg-cream/50 px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setDetails.mutate({
                      user: u,
                      employeeId: detailsFor.employee_id,
                      designation: detailsFor.designation,
                    })
                  }}
                >
                  <p className="mb-3 text-xs text-ink-400">
                    Shown on {u.full_name.split(' ')[0]}&rsquo;s account card. They can change their own
                    photo and employee ID; <b>only you can set the position</b>.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[10rem] flex-1">
                      <label className="label-text" htmlFor={`emp-${u.id}`}>Employee ID</label>
                      <input
                        id={`emp-${u.id}`}
                        className="input-field"
                        placeholder="e.g. UM-114"
                        maxLength={40}
                        value={detailsFor.employee_id}
                        onChange={(e) => setDetailsFor({ ...detailsFor, employee_id: e.target.value })}
                      />
                    </div>
                    <div className="min-w-[12rem] flex-1">
                      <label className="label-text" htmlFor={`desig-${u.id}`}>Position</label>
                      <input
                        id={`desig-${u.id}`}
                        className="input-field"
                        placeholder="e.g. Assistant Store Manager"
                        maxLength={60}
                        value={detailsFor.designation}
                        onChange={(e) => setDetailsFor({ ...detailsFor, designation: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={setDetails.isPending}>
                      {setDetails.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                      Save
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setDetailsFor(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {accessFor === u.id && !isSelf && (
                <div className="border-t border-ink-100 bg-cream/50 px-4 py-3">
                  <p className="mb-2 text-sm font-semibold text-ink-600">
                    What {u.full_name.split(' ')[0]} can use
                  </p>
                  <p className="mb-3 text-xs text-ink-400">
                    Ticked boxes follow the <b>{u.role}</b> role by default — change any of them for
                    this person only. Home and Alerts are always available.
                  </p>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {TOGGLEABLE_MODULES.map((m) => {
                      const allowed = canAccess(u, m.key)
                      const isDefault = m.defaultRoles.includes(u.role)
                      return (
                        <label
                          key={m.key}
                          className="flex min-h-tap cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 shrink-0"
                            checked={allowed}
                            disabled={setModuleAccess.isPending}
                            onChange={(e) =>
                              setModuleAccess.mutate({ user: u, key: m.key, allowed: e.target.checked })
                            }
                          />
                          <m.icon className="h-4 w-4 shrink-0 text-ink-400" />
                          <span className="min-w-0 truncate">{m.label}</span>
                          {allowed !== isDefault && (
                            <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              custom
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
              </div>
            )
          })}
          {(users ?? []).length === 0 && (
            <p className="px-4 py-8 text-center text-ink-400">No users yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
