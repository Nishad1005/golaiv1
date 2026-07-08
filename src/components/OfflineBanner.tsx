import { CloudOff, RefreshCw, X } from 'lucide-react'
import { useOffline } from '../lib/offline/queue'

/** Offline indicator + pending-sync status, shown under the header (PRD 7.5). */
export function OfflineBanner() {
  const { online, pending, syncing, errors, sync, dismissError } = useOffline()

  if (online && pending === 0 && errors.length === 0) return null

  return (
    <div className="space-y-px">
      {!online && (
        <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
          <CloudOff className="h-4 w-4 shrink-0" />
          Offline — scans and photos are being saved on this device and will sync automatically.
          {pending > 0 && <span className="ml-auto shrink-0">{pending} waiting</span>}
        </div>
      )}
      {online && pending > 0 && (
        <div className="flex items-center gap-2 bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          <RefreshCw className={'h-4 w-4 shrink-0 ' + (syncing ? 'animate-spin' : '')} />
          {syncing ? `Syncing ${pending} offline transaction${pending > 1 ? 's' : ''}…` : `${pending} transaction${pending > 1 ? 's' : ''} waiting to sync.`}
          {!syncing && (
            <button className="ml-auto shrink-0 underline" onClick={() => void sync()}>
              Sync now
            </button>
          )}
        </div>
      )}
      {errors.map((e) => (
        <div key={e.id} className="flex items-center gap-2 bg-red-600 px-4 py-2 text-sm text-white">
          <span className="min-w-0 flex-1">
            Offline {e.type.replaceAll('_', ' ')} from {new Date(e.queued_at).toLocaleString()} was
            rejected: {e.message}
          </span>
          <button onClick={() => dismissError(e.id)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
