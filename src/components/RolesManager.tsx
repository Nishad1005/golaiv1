import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, Plus, Shield, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { logActivity } from '../lib/audit'
import { TOGGLEABLE_MODULES } from '../lib/modules'

export interface TenantRole {
  id: string
  name: string
  module_access: Record<string, boolean>
  base_role: string
}

interface Draft {
  id: string | null
  name: string
  modules: Set<string>
}

/**
 * Custom roles — named presets of module access an admin defines once and
 * applies to users (e.g. "Issuance Clerk" → only Issuance). They live alongside
 * the five built-in roles; assigning one just sets a user's module access and
 * shown title. Nothing here changes the role enum or any security policy.
 */
export function RolesManager() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  const { data: roles } = useQuery({
    queryKey: ['tenant-roles'],
    queryFn: async (): Promise<TenantRole[]> => {
      const { data, error } = await supabase
        .from('tenant_roles').select('id, name, module_access, base_role').order('name')
      if (error) throw error
      return (data ?? []) as TenantRole[]
    },
  })

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const access = Object.fromEntries(TOGGLEABLE_MODULES.map((m) => [m.key, d.modules.has(m.key)]))
      const { error } = await supabase.rpc('admin_upsert_role', {
        p_id: d.id, p_name: d.name.trim(), p_module_access: access, p_base_role: 'storekeeper',
      })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: d.id ? 'update.role' : 'create.role', entityType: 'tenant_role',
        after: { name: d.name.trim() },
      })
    },
    onSuccess: () => {
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ['tenant-roles'] })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_delete_role', { p_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tenant-roles'] }),
  })

  const startNew = () => setDraft({ id: null, name: '', modules: new Set() })
  const startEdit = (r: TenantRole) =>
    setDraft({
      id: r.id, name: r.name,
      modules: new Set(Object.entries(r.module_access).filter(([, v]) => v).map(([k]) => k)),
    })

  return (
    <section className="card">
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500">
          <Shield className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink-900">Custom roles</span>
          <span className="block text-sm text-ink-400">
            Name a role and choose what it can use — then assign it to people.
            {roles && roles.length > 0 && ` ${roles.length} defined.`}
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="mt-4 space-y-2 border-t border-ink-200/70 pt-4">
          {(roles ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-800">{r.name}</p>
                <p className="truncate text-xs text-ink-400">
                  {TOGGLEABLE_MODULES.filter((m) => r.module_access[m.key]).map((m) => m.label).join(', ') || 'No modules'}
                </p>
              </div>
              <button className="btn-secondary" onClick={() => startEdit(r)}>Edit</button>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => { if (window.confirm(`Delete the "${r.name}" role? People already assigned keep their access.`)) remove.mutate(r.id) }}
                aria-label={`Delete ${r.name}`}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}

          {draft ? (
            <form
              className="rounded-xl border border-brand-200 bg-brand-50/40 p-3"
              onSubmit={(e) => { e.preventDefault(); save.mutate(draft) }}
            >
              <label className="label-text" htmlFor="role-name">Role name</label>
              <input id="role-name" className="input-field" autoFocus placeholder="e.g. Issuance Clerk"
                value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />

              <p className="label-text mt-3">What it can use</p>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {TOGGLEABLE_MODULES.map((m) => (
                  <label key={m.key} className="flex min-h-tap cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-white">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={draft.modules.has(m.key)}
                      onChange={(e) => {
                        const next = new Set(draft.modules)
                        e.target.checked ? next.add(m.key) : next.delete(m.key)
                        setDraft({ ...draft, modules: next })
                      }}
                    />
                    <m.icon className="h-4 w-4 shrink-0 text-ink-400" />
                    <span className="min-w-0 truncate">{m.label}</span>
                  </label>
                ))}
              </div>

              {save.isError && <p className="mt-2 text-sm text-red-600">{(save.error as Error).message}</p>}
              <div className="mt-3 flex gap-2">
                <button type="submit" className="btn-primary" disabled={save.isPending || !draft.name.trim()}>
                  {save.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                  {draft.id ? 'Save role' : 'Create role'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
              </div>
            </form>
          ) : (
            <button className="btn-secondary" onClick={startNew}>
              <Plus className="h-5 w-5" aria-hidden /> New role
            </button>
          )}

          <p className="text-xs leading-relaxed text-ink-400">
            A custom role is a shortcut: assigning it sets exactly which sections a person can open
            and shows the role name as their title. You can still fine-tune any individual with
            <b> Access</b> afterwards.
          </p>
        </div>
      )}
    </section>
  )
}
