import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Power, Trash2, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
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
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'storekeeper' as UserRole })
  const [notice, setNotice] = useState<string | null>(null)

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
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
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
      const result = data as { id: string; email: string; temp_password: string }
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
        `Login created for ${result.email}. Temporary password: ${result.temp_password} — share it with them; they can change it after signing in.`,
      )
      setForm({ full_name: '', email: '', phone: '', role: 'storekeeper' })
      setShowForm(false)
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })

  const changeRole = useMutation({
    mutationFn: async ({ user, role }: { user: Profile; role: UserRole }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id)
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
      const { error } = await supabase.from('profiles').update({ status }).eq('id', user.id)
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
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label-text">Phone (optional)</label>
            <input className="input-field" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label-text">Role</label>
            <select className="input-field" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
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
              <div
                key={u.id}
                className={'flex flex-wrap items-center gap-3 px-4 py-3 ' + (inactive ? 'opacity-60' : '')}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {u.full_name}
                    {inactive && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        deactivated
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm text-ink-400">{u.email ?? u.phone ?? ''}</div>
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
                {!isSelf && (
                  <div className="flex gap-1">
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
