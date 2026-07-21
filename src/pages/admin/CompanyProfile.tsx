import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Image as ImageIcon, Loader2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { useTenant, logoPublicUrl } from '../../lib/tenant'
import { PageHeader } from '../../components/PageHeader'

/**
 * Company Profile — each client's admin sets their own name, logo and contact.
 * The name + logo then appear in the app header for everyone in the company.
 */
export function CompanyProfile() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: tenant, isLoading } = useTenant()
  const fileInput = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<Record<string, string> | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Seed the editable form once the tenant loads
  const f = form ?? {
    name: tenant?.name ?? '',
    gst_number: tenant?.gst_number ?? '',
    address: tenant?.address ?? '',
    contact_email: tenant?.contact_email ?? '',
    contact_phone: tenant?.contact_phone ?? '',
  }
  const set = (k: string, v: string) => setForm({ ...f, [k]: v })

  const save = useMutation({
    mutationFn: async () => {
      if (!f.name.trim()) throw new Error('Company name is required')
      const { error } = await supabase
        .from('tenants')
        .update({
          name: f.name.trim(),
          gst_number: f.gst_number.trim() || null,
          address: f.address.trim() || null,
          contact_email: f.contact_email.trim() || null,
          contact_phone: f.contact_phone.trim() || null,
        })
        .eq('id', profile!.tenant_id)
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'update.company', entityType: 'tenant', entityId: profile!.tenant_id,
        after: { name: f.name.trim() },
      })
    },
    onSuccess: () => {
      setNotice('Company details saved.')
      void queryClient.invalidateQueries({ queryKey: ['tenant'] })
    },
  })

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 2_000_000) throw new Error('Logo must be under 2 MB.')
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${profile!.tenant_id}/logo-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('branding')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
      const { error } = await supabase.from('tenants').update({ logo_url: path }).eq('id', profile!.tenant_id)
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'update.company_logo', entityType: 'tenant', entityId: profile!.tenant_id,
      })
    },
    onSuccess: () => {
      setNotice('Logo updated.')
      void queryClient.invalidateQueries({ queryKey: ['tenant'] })
    },
    onError: (e) => setNotice((e as Error).message),
  })

  if (isLoading) return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-brand-500" />

  const currentLogo = logoPublicUrl(tenant?.logo_url ?? null)

  return (
    <div className="space-y-4">
      <PageHeader title="Company Profile" subtitle="Your name and logo appear across the app for your whole team." />

      {notice && (
        <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>
      )}

      <div className="card space-y-4">
        <p className="font-semibold">Logo</p>
        <div className="flex items-center gap-4">
          {currentLogo ? (
            <img src={currentLogo} alt="Company logo" className="h-20 w-20 rounded-2xl border border-ink-200 bg-white object-contain p-1" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
          <div>
            <button className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={uploadLogo.isPending}>
              {uploadLogo.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              {currentLogo ? 'Replace logo' : 'Upload logo'}
            </button>
            <p className="mt-1 text-xs text-ink-400">PNG or JPG, square works best, under 2 MB.</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadLogo.mutate(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <form
        className="card grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => { e.preventDefault(); save.mutate() }}
      >
        <div className="flex items-center gap-2 sm:col-span-2">
          <Building2 className="h-5 w-5 text-brand-500" />
          <p className="font-semibold">Details</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label-text">Company name *</label>
          <input className="input-field" value={f.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div>
          <label className="label-text">GST number</label>
          <input className="input-field" value={f.gst_number} onChange={(e) => set('gst_number', e.target.value)} />
        </div>
        <div>
          <label className="label-text">Contact phone</label>
          <input className="input-field" value={f.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
        </div>
        <div>
          <label className="label-text">Contact email</label>
          <input className="input-field" value={f.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
        </div>
        <div>
          <label className="label-text">Address</label>
          <input className="input-field" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Save
          </button>
          {save.isError && <p className="mt-2 text-sm text-red-600">{(save.error as Error).message}</p>}
        </div>
      </form>
    </div>
  )
}
