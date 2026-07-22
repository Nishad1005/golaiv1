import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Loader2, Plus } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'

export const COUNT_STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
}

interface CountRow {
  id: string
  count_number: string
  plan_name: string
  status: string
  created_at: string
  assignee: { full_name: string } | null
}

export function CountList() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isManager = ['manager', 'admin'].includes(profile!.role)
  const [showForm, setShowForm] = useState(false)
  const [planName, setPlanName] = useState('')
  const [scopeNote, setScopeNote] = useState('')
  const [assignedTo, setAssignedTo] = useState('')

  const { data: counts, isLoading } = useQuery({
    queryKey: ['stock-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_counts')
        .select('id, count_number, plan_name, status, created_at, assignee:profiles!stock_counts_assigned_to_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as unknown as CountRow[]
    },
  })

  const { data: people } = useQuery({
    queryKey: ['profiles-list'],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, full_name, role').eq('status', 'active').order('full_name')
      if (error) throw error
      return data as { id: string; full_name: string; role: string }[]
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_stock_count', {
        p_plan_name: planName.trim(),
        p_scope: { note: scopeNote.trim() },
        p_assigned_to: assignedTo || null,
      })
      if (error) throw error
      const row = (data as { count_id: string; count_number: string }[])[0]
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.stock_count',
        entityType: 'stock_count',
        entityId: row.count_id,
        after: { count_number: row.count_number, plan: planName.trim() },
      })
    },
    onSuccess: () => {
      setShowForm(false)
      setPlanName('')
      setScopeNote('')
      void queryClient.invalidateQueries({ queryKey: ['stock-counts'] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Stock Counts</h1>
        {isManager && (
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-5 w-5" /> New Count Plan
          </button>
        )}
      </div>

      {showForm && (
        <form
          className="card grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <div>
            <label className="label-text">Plan name</label>
            <input className="input-field" value={planName} onChange={(e) => setPlanName(e.target.value)}
              placeholder="Weekly count — Zone Z02" required />
          </div>
          <div>
            <label className="label-text">Scope (which shelves / items)</label>
            <input className="input-field" value={scopeNote} onChange={(e) => setScopeNote(e.target.value)}
              placeholder="All fabric shelves in Z02" />
          </div>
          <div>
            <label className="label-text">Assign to</label>
            <select className="input-field" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">— anyone —</option>
              {(people ?? []).filter((p) => p.role === 'storekeeper').map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
              Create & assign
            </button>
          </div>
          {create.isError && (
            <p className="text-sm text-red-600 sm:col-span-3">{(create.error as Error).message}</p>
          )}
        </form>
      )}

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />
      ) : (
        <div className="space-y-2">
          {(counts ?? []).map((c) => (
            <Link key={c.id} to={`/counts/${c.id}`} className="card flex items-center gap-3 hover:border-tan">
              <ClipboardList className="h-6 w-6 shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{c.count_number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COUNT_STATUS_STYLES[c.status]}`}>
                    {c.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="truncate text-sm text-ink-400">
                  {c.plan_name}
                  {c.assignee ? ` · ${c.assignee.full_name}` : ''}
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-400">{new Date(c.created_at).toLocaleDateString()}</span>
            </Link>
          ))}
          {(counts ?? []).length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="No stock counts yet"
              detail="A count checks what is physically on the shelves against what Golai believes. The manager plans one and assigns it; the storekeeper walks the floor and enters what they see."
            />
          )}
        </div>
      )}
    </div>
  )
}
