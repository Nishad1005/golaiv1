import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, Image as ImageIcon, Loader2, Settings as SettingsIcon, TriangleAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { useSettings, EDIT_LOCK_CHOICES, DEFAULT_EDIT_LOCK_HOURS } from '../../lib/settings'
import { PageHeader } from '../../components/PageHeader'

/**
 * Settings — the handful of company-wide rules that change how the floor works.
 *
 * Deliberately short. Every option here is one the app actually honours; a
 * settings screen full of switches that do nothing is worse than no screen at
 * all, so anything not yet enforced stays off it.
 */
export function Settings() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useSettings()
  const [form, setForm] = useState<Record<string, string> | null>(null)
  const [saved, setSaved] = useState(false)

  const f = form ?? {
    edit_lock_hours: String(settings?.edit_lock_hours ?? DEFAULT_EDIT_LOCK_HOURS),
    photo_retention_days: String(settings?.photo_retention_days ?? 730),
    working_hours_start: (settings?.working_hours_start ?? '09:00').slice(0, 5),
    working_hours_end: (settings?.working_hours_end ?? '19:00').slice(0, 5),
  }
  const set = (k: string, v: string) => {
    setSaved(false)
    setForm({ ...f, [k]: v })
  }

  const save = useMutation({
    mutationFn: async () => {
      const retention = Number(f.photo_retention_days)
      if (!Number.isFinite(retention) || retention < 30) {
        throw new Error('Photo retention must be at least 30 days.')
      }
      const { error } = await supabase
        .from('tenant_settings')
        .upsert({
          tenant_id: profile!.tenant_id,
          edit_lock_hours: Number(f.edit_lock_hours),
          photo_retention_days: retention,
          working_hours_start: f.working_hours_start,
          working_hours_end: f.working_hours_end,
          updated_at: new Date().toISOString(),
        })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'update.settings', entityType: 'tenant_settings', entityId: profile!.tenant_id,
        after: { edit_lock_hours: Number(f.edit_lock_hours), photo_retention_days: retention },
      })
    },
    onSuccess: () => {
      setSaved(true)
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] })
    },
  })

  if (isLoading) return <Loader2 className="mx-auto mt-10 h-7 w-7 animate-spin text-brand-500" />

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company-wide rules for how the floor works." />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        {/* ---------- Edit lock ---------- */}
        <section className="card">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Clock className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-ink-900">How long can a mistake be undone?</h2>
              <p className="text-sm text-ink-400">
                After a capture, the person who recorded it can undo it themselves for this long.
                Once the window closes the only correction is an <strong>Adjust</strong> — which
                needs a reason and a manager's approval.
              </p>
            </div>
          </div>

          <div className="mt-4 max-w-xs">
            <label className="label-text" htmlFor="edit-lock">Undo window</label>
            <select
              id="edit-lock"
              className="input-field"
              value={f.edit_lock_hours}
              onChange={(e) => set('edit_lock_hours', e.target.value)}
            >
              {EDIT_LOCK_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <p className="mt-3 flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-500">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            A longer window is kinder to the floor but weakens the audit trail — anything undone
            leaves no quantity behind, only a line in the activity log. 24 hours suits most
            warehouses. This applies to captures already recorded; changing it does not reopen them.
          </p>
        </section>

        {/* ---------- Working hours ---------- */}
        <section className="card">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500">
              <SettingsIcon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-ink-900">Working hours</h2>
              <p className="text-sm text-ink-400">
                Your normal shift. Recorded against the company so activity outside these hours can
                be told apart in the audit trail.
              </p>
            </div>
          </div>

          <div className="mt-4 grid max-w-md gap-3 sm:grid-cols-2">
            <div>
              <label className="label-text" htmlFor="wh-start">Day starts</label>
              <input
                id="wh-start" type="time" className="input-field"
                value={f.working_hours_start}
                onChange={(e) => set('working_hours_start', e.target.value)}
              />
            </div>
            <div>
              <label className="label-text" htmlFor="wh-end">Day ends</label>
              <input
                id="wh-end" type="time" className="input-field"
                value={f.working_hours_end}
                onChange={(e) => set('working_hours_end', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ---------- Photo retention ---------- */}
        <section className="card">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500">
              <ImageIcon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-ink-900">Keep photos for</h2>
              <p className="text-sm text-ink-400">
                How long gate, damage and handover photographs are retained. Two years covers most
                supplier and customer disputes.
              </p>
            </div>
          </div>

          <div className="mt-4 max-w-xs">
            <label className="label-text" htmlFor="retention">Days</label>
            <input
              id="retention" type="number" min="30" step="1" className="input-field tabular-nums"
              value={f.photo_retention_days}
              onChange={(e) => set('photo_retention_days', e.target.value)}
            />
          </div>
        </section>

        {save.isError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {(save.error as Error).message}
          </p>
        )}
        {saved && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Settings saved.
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
          Save settings
        </button>
      </form>
    </div>
  )
}
