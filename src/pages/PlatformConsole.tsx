import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity, Building2, Check, ChevronDown, Loader2, Package, PauseCircle,
  PlayCircle, Rocket, TriangleAlert, Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { logActivity } from '../lib/audit'
import {
  LICENSED_MODULES, onboardingProgress, usePlatformSummary, usePlatformTenants,
  type PlatformTenant,
} from '../lib/platform'
import { PageHeader } from '../components/PageHeader'

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * The DBBS console — every client on the platform, what they use, and what
 * they are licensed for.
 *
 * Reads across tenants, which every RLS policy in the app deliberately forbids,
 * so it goes through security-definer RPCs (migration 0025) that refuse anyone
 * who is not a platform admin. No existing policy was widened to make this work.
 */
export function PlatformConsole() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: tenants, isLoading, error } = usePlatformTenants()
  const { data: summary } = usePlatformSummary()
  const [openId, setOpenId] = useState<string | null>(null)

  const setModule = useMutation({
    mutationFn: async (v: { tenantId: string; key: string; enabled: boolean; name: string }) => {
      const { error } = await supabase.rpc('platform_set_tenant_module', {
        p_tenant_id: v.tenantId, p_module_key: v.key, p_enabled: v.enabled, p_note: null,
      })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: v.enabled ? 'platform.grant_module' : 'platform.revoke_module',
        entityType: 'tenant', entityId: v.tenantId,
        after: { module: v.key, company: v.name },
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['platform-tenants'] }),
  })

  const setStatus = useMutation({
    mutationFn: async (v: { tenantId: string; status: 'active' | 'inactive'; name: string }) => {
      const { error } = await supabase.rpc('platform_set_tenant_status', {
        p_tenant_id: v.tenantId, p_status: v.status,
      })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: v.status === 'active' ? 'platform.reactivate_tenant' : 'platform.suspend_tenant',
        entityType: 'tenant', entityId: v.tenantId, after: { company: v.name },
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['platform-tenants'] }),
  })

  if (error) {
    return (
      <div className="card flex items-start gap-2 text-sm text-red-700">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform Console"
        subtitle="Every client, what they use, and what they're licensed for."
        actions={
          <Link to="/provision" className="btn-primary">
            <Rocket className="h-5 w-5" aria-hidden /> New client
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Building2} label="Companies" value={summary?.tenant_count}
          hint={summary ? `${summary.active_tenant_count} active` : undefined} />
        <Stat icon={Users} label="Users" value={summary?.user_count} />
        <Stat icon={Package} label="Products" value={summary?.item_count} />
        <Stat icon={Activity} label="Actions, 7 days" value={summary?.actions_7d} />
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-10 h-7 w-7 animate-spin text-brand-500" />
      ) : (
        <div className="space-y-2">
          {(tenants ?? []).map((t) => (
            <TenantRow
              key={t.id}
              t={t}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              onSetModule={(key, enabled) =>
                setModule.mutate({ tenantId: t.id, key, enabled, name: t.name })}
              onSetStatus={(status) => setStatus.mutate({ tenantId: t.id, status, name: t.name })}
              busy={setModule.isPending || setStatus.isPending}
            />
          ))}
        </div>
      )}

      {(setModule.isError || setStatus.isError) && (
        <p role="alert" className="text-sm text-red-700">
          {((setModule.error ?? setStatus.error) as Error).message}
        </p>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value, hint }: {
  icon: typeof Users; label: string; value?: number; hint?: string
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-ink-900">
        {value === undefined
          ? <span className="inline-block h-8 w-12 animate-pulse rounded bg-ink-100" />
          : value}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

function TenantRow({ t, open, onToggle, onSetModule, onSetStatus, busy }: {
  t: PlatformTenant
  open: boolean
  onToggle: () => void
  onSetModule: (key: string, enabled: boolean) => void
  onSetStatus: (status: 'active' | 'inactive') => void
  busy: boolean
}) {
  const progress = onboardingProgress(t)
  const live = progress.done === progress.total
  const suspended = t.status !== 'active'

  return (
    <section className={`card ${suspended ? 'border-red-200 bg-red-50/40' : ''}`}>
      <button
        className="flex w-full items-center gap-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
          {t.name.charAt(0).toUpperCase()}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink-900">{t.name}</span>
            {suspended && <span className="badge bg-red-100 text-red-700">Suspended</span>}
            {!live && !suspended && (
              <span className="badge bg-amber-50 text-amber-700 tabular-nums">
                Setup {progress.done}/{progress.total}
              </span>
            )}
            {t.module_keys.map((k) => (
              <span key={k} className="badge bg-brand-50 text-brand-700">{k}</span>
            ))}
          </span>
          <span className="mt-0.5 block truncate text-sm text-ink-400 tabular-nums">
            {t.user_count} users · {t.item_count} products · {t.location_count} locations ·
            last active {ago(t.last_activity_at)}
          </span>
        </span>

        <ChevronDown
          className={`h-5 w-5 shrink-0 text-ink-400 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-ink-200/70 pt-4 animate-fade-in motion-reduce:animate-none">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Admin" value={t.admin_names ?? '—'} />
            <Detail label="Contact" value={t.contact_email ?? t.contact_phone ?? '—'} />
            <Detail label="Plan" value={t.plan} />
            <Detail label="Created" value={new Date(t.created_at).toLocaleDateString()} />
            <Detail label="Zones" value={String(t.zone_count)} />
            <Detail label="Locations" value={String(t.location_count)} />
            <Detail label="Products located" value={`${t.located_count} of ${t.item_count}`} />
            <Detail label="Active users" value={`${t.active_user_count} of ${t.user_count}`} />
          </dl>

          <div>
            <p className="label-text">Licensed modules</p>
            <div className="space-y-2">
              {LICENSED_MODULES.map((m) => {
                const on = t.module_keys.includes(m.key)
                return (
                  <label
                    key={m.key}
                    className="flex min-h-tap cursor-pointer items-center gap-3 rounded-xl border border-ink-200 px-3"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-brand-500"
                      checked={on}
                      disabled={busy}
                      onChange={(e) => onSetModule(m.key, e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-800">{m.label}</span>
                      <span className="block text-xs text-ink-400">{m.blurb}</span>
                    </span>
                    {on && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Everything else in Golai is part of the base product. Only modules listed here
              need a licence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-200/70 pt-4">
            {suspended ? (
              <button className="btn-primary" disabled={busy} onClick={() => onSetStatus('active')}>
                <PlayCircle className="h-5 w-5" aria-hidden /> Reactivate
              </button>
            ) : (
              <button
                className="min-h-tap inline-flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-5 text-base font-semibold text-red-600 transition-colors hover:border-red-200 hover:bg-red-50"
                disabled={busy}
                onClick={() => onSetStatus('inactive')}
              >
                <PauseCircle className="h-5 w-5" aria-hidden /> Suspend
              </button>
            )}
            <p className="text-xs text-ink-400">
              Suspending blocks their staff from working. Nothing is deleted, and it can be
              undone at any time.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="truncate font-medium text-ink-800">{value}</dd>
    </div>
  )
}
