import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import type { Profile, UserRole } from '../../lib/types'

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
  // holds the service-role key server-side (never in the browser). The new user
  // gets a set-password email; they land in this admin's tenant.
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
      if (error) {
        // Edge function returns a JSON { error } body on failure
        const detail = (data as { error?: string } | null)?.error
        throw new Error(detail ?? error.message)
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.user',
        entityType: 'profile',
        entityId: (data as { id: string }).id,
        after: { email: form.email.trim(), role: form.role },
      })
    },
    onSuccess: () => {
      setNotice(`Invite sent to ${form.email.trim()} — they'll set their own password from the email.`)
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
        <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>
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
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-tan-dark" />
      ) : (
        <div className="card divide-y divide-tan/20 p-0">
          {(users ?? []).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium">{u.full_name}</div>
                <div className="truncate text-sm text-ink-400">{u.email ?? u.phone ?? ''}</div>
              </div>
              <select
                className="input-field ml-auto w-auto"
                value={u.role}
                disabled={u.id === profile!.id || changeRole.isPending}
                onChange={(e) => changeRole.mutate({ user: u, role: e.target.value as UserRole })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {(users ?? []).length === 0 && (
            <p className="px-4 py-8 text-center text-ink-400">No users yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
