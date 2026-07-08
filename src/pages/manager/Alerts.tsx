import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const SEVERITY_STYLES: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
}

interface AlertRow {
  id: string
  alert_type: string
  severity: string
  message: string
  status: 'UNREAD' | 'READ' | 'RESOLVED'
  created_at: string
}

export function Alerts() {
  const queryClient = useQueryClient()

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('id, alert_type, severity, message, status, created_at')
        .neq('status', 'RESOLVED')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as AlertRow[]
    },
  })

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id?: string; status: 'READ' | 'RESOLVED' }) => {
      let q = supabase.from('alerts').update({ status })
      if (id) {
        q = q.eq('id', id)
      } else {
        q = q.eq('status', 'UNREAD')
      }
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['alerts-unread'] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-tan-dark" />
          <h1 className="text-xl font-bold">Alerts</h1>
        </div>
        <button className="btn-secondary" onClick={() => setStatus.mutate({ status: 'READ' })}>
          <CheckCheck className="h-5 w-5" /> Mark all read
        </button>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-tan-dark" />
      ) : (alerts ?? []).length === 0 ? (
        <div className="card py-10 text-center text-ink-400">No alerts. All clear.</div>
      ) : (
        <div className="space-y-2">
          {(alerts ?? []).map((a) => (
            <div
              key={a.id}
              className={'card flex items-center gap-3 ' + (a.status === 'UNREAD' ? 'border-tan' : 'opacity-70')}
            >
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.info}`}>
                {a.alert_type.replaceAll('_', ' ')}
              </span>
              <p className="min-w-0 flex-1 text-sm">{a.message}</p>
              <span className="shrink-0 text-xs text-ink-400">
                {new Date(a.created_at).toLocaleString()}
              </span>
              <button
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-cream"
                title="Resolve"
                onClick={() => setStatus.mutate({ id: a.id, status: 'RESOLVED' })}
              >
                <Check className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
