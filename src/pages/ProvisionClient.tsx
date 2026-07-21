import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Building2, CheckCircle2, Copy, Loader2, Rocket } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/PageHeader'

interface ProvisionResult {
  tenant_id: string
  company_name: string
  admin_login: string
  temp_password: string
}

/**
 * Provision Client (DBBS platform admins only): creates a company and its
 * admin together in one atomic step, replacing the old dashboard-user + seed-SQL
 * flow that caused mis-named, orphaned tenants.
 */
export function ProvisionClient() {
  const [form, setForm] = useState({
    company_name: '', gst_number: '', address: '',
    admin_name: '', admin_email: '', admin_phone: '',
  })
  const [result, setResult] = useState<ProvisionResult | null>(null)
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  // Existing companies — so a duplicate name is obvious before creating.
  const { data: companies } = useQuery({
    queryKey: ['all-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants').select('name').is('deleted_at', null).order('name')
      if (error) return []
      return (data ?? []).map((t) => (t as { name: string }).name)
    },
  })

  const provision = useMutation({
    mutationFn: async (force: boolean) => {
      const { data, error } = await supabase.functions.invoke('provision-tenant', {
        body: { ...form, force },
      })
      if (error) {
        const ctx = (error as { context?: Response }).context
        let detail = error.message
        let duplicate = false
        if (ctx?.json) {
          try {
            const body = await ctx.json()
            detail = body.error ?? detail
            duplicate = body.duplicate === true
          } catch { /* keep generic */ }
        }
        const e = new Error(detail) as Error & { duplicate?: boolean }
        e.duplicate = duplicate
        throw e
      }
      return data as ProvisionResult
    },
    onSuccess: (r) => {
      setResult(r)
      setForm({ company_name: '', gst_number: '', address: '', admin_name: '', admin_email: '', admin_phone: '' })
    },
  })

  const err = provision.error as (Error & { duplicate?: boolean }) | null

  return (
    <div className="space-y-4">
      <PageHeader title="Provision Client" subtitle="Create a new company and its admin account together." />

      {result && (
        <div className="card space-y-2 border-brand-200 bg-brand-50">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-semibold">{result.company_name} created</p>
          </div>
          <p className="text-sm text-ink-600">
            Hand these to the client's admin — they can change the password after signing in.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span><span className="text-ink-400">Login: </span><b>{result.admin_login}</b></span>
            <span className="flex items-center gap-1">
              <span className="text-ink-400">Temp password: </span><b className="font-mono">{result.temp_password}</b>
              <button
                className="text-ink-400 hover:text-ink-600"
                onClick={() => navigator.clipboard?.writeText(result.temp_password)}
                title="Copy password"
              >
                <Copy className="h-4 w-4" />
              </button>
            </span>
          </div>
          <button className="btn-secondary mt-1 w-fit" onClick={() => setResult(null)}>Create another</button>
        </div>
      )}

      <form
        className="card grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => { e.preventDefault(); provision.mutate(false) }}
      >
        <div className="flex items-center gap-2 sm:col-span-2">
          <Building2 className="h-5 w-5 text-brand-500" />
          <p className="font-semibold">Company</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label-text">Company name *</label>
          <input className="input-field" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} required />
        </div>
        <div>
          <label className="label-text">GST number</label>
          <input className="input-field" value={form.gst_number} onChange={(e) => set('gst_number', e.target.value)} />
        </div>
        <div>
          <label className="label-text">Address</label>
          <input className="input-field" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>

        <div className="flex items-center gap-2 pt-2 sm:col-span-2">
          <p className="font-semibold">Admin account</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label-text">Admin full name *</label>
          <input className="input-field" value={form.admin_name} onChange={(e) => set('admin_name', e.target.value)} required />
        </div>
        <div>
          <label className="label-text">Admin email</label>
          <input type="email" className="input-field" value={form.admin_email} onChange={(e) => set('admin_email', e.target.value)}
            placeholder="Leave blank to use mobile" />
        </div>
        <div>
          <label className="label-text">Admin mobile</label>
          <input type="tel" inputMode="tel" className="input-field" value={form.admin_phone} onChange={(e) => set('admin_phone', e.target.value)} />
          <p className="mt-1 text-xs text-ink-400">Enter at least one of email / mobile.</p>
        </div>

        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={provision.isPending}>
            {provision.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
            Create company + admin
          </button>
          {err && (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-red-600">{err.message}</p>
              {err.duplicate && (
                <button type="button" className="btn-secondary" onClick={() => provision.mutate(true)} disabled={provision.isPending}>
                  Create anyway (name already exists)
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      {(companies ?? []).length > 0 && (
        <div className="card">
          <p className="mb-2 text-sm font-semibold text-ink-500">Existing companies ({companies!.length})</p>
          <div className="flex flex-wrap gap-2">
            {companies!.map((c, i) => (
              <span key={i} className="rounded-lg bg-cream-dark px-3 py-1.5 text-sm">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
