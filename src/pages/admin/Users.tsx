import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import type { Profile, UserRole } from '../../lib/types'

const ROLES: UserRole[] = ['security', 'storekeeper', 'planner', 'manager', 'admin']

export function Users() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: users, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name')
      if (error) throw error
      return data as Profile[]
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
      <h1 className="text-xl font-bold">Users & Roles</h1>
      <p className="text-sm text-ink-400">
        Five roles only (PRD hard rule). Each role gets its own home screen and permissions. New
        logins are created in the Supabase dashboard (Authentication → Users), then appear here
        once their profile row is added.
      </p>

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
