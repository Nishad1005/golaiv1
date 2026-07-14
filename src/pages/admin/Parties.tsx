import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'

type Tab = 'suppliers' | 'customers' | 'departments'

interface PartyRow {
  id: string
  name: string
  contact_name?: string | null
  phone?: string | null
  address?: string | null
  delivery_address?: string | null
}

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'suppliers', label: 'Suppliers', hint: 'Name and contact only — no payment data (ERP scope)' },
  { key: 'customers', label: 'Customers', hint: 'Name and delivery address only — no credit data (ERP scope)' },
  { key: 'departments', label: 'Departments', hint: 'Production departments receiving material (Carpentry, Upholstery, …)' },
]

export function Parties() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('suppliers')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', contact_name: '', phone: '', address: '' })

  const { data: rows, isLoading } = useQuery({
    queryKey: [tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tab)
        .select('*')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as PartyRow[]
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        tenant_id: profile!.tenant_id,
        name: form.name.trim(),
      }
      if (tab !== 'departments') {
        payload.contact_name = form.contact_name.trim() || null
        payload.phone = form.phone.trim() || null
        payload[tab === 'customers' ? 'delivery_address' : 'address'] = form.address.trim() || null
      }
      const { data, error } = await supabase.from(tab).insert(payload).select().single()
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: `create.${tab.slice(0, -1)}`,
        entityType: tab.slice(0, -1),
        entityId: data.id,
        after: { name: form.name.trim() },
      })
    },
    onSuccess: () => {
      setForm({ name: '', contact_name: '', phone: '', address: '' })
      setShowForm(false)
      void queryClient.invalidateQueries({ queryKey: [tab] })
    },
  })

  const activeTab = TABS.find((t) => t.key === tab)!

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Suppliers, Customers & Departments</h1>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={
              'min-h-tap rounded-xl px-4 font-medium transition-colors ' +
              (tab === t.key ? 'bg-ink text-cream' : 'bg-white text-ink hover:bg-cream-dark')
            }
            onClick={() => {
              setTab(t.key)
              setShowForm(false)
            }}
          >
            {t.label}
          </button>
        ))}
        <button className="btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-5 w-5" /> New
        </button>
      </div>

      <p className="text-sm text-ink-400">{activeTab.hint}</p>

      {showForm && (
        <form
          className="card grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <div className={tab === 'departments' ? 'sm:col-span-2' : ''}>
            <label className="label-text">Name</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          {tab !== 'departments' && (
            <>
              <div>
                <label className="label-text">Contact person</label>
                <input
                  className="input-field"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
              <div>
                <label className="label-text">Phone</label>
                <input
                  className="input-field"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="label-text">{tab === 'customers' ? 'Delivery address' : 'Address'}</label>
                <input
                  className="input-field"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
              Create
            </button>
          </div>
          {create.isError && (
            <p className="text-sm text-red-600 sm:col-span-2">{(create.error as Error).message}</p>
          )}
        </form>
      )}

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />
      ) : (
        <div className="card divide-y divide-tan/20 p-0">
          {(rows ?? []).map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-4 py-3">
              <span className="font-medium">{row.name}</span>
              <span className="ml-auto text-sm text-ink-400">
                {row.contact_name ?? ''} {row.phone ? `· ${row.phone}` : ''}
              </span>
            </div>
          ))}
          {(rows ?? []).length === 0 && (
            <p className="px-4 py-8 text-center text-ink-400">Nothing here yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
