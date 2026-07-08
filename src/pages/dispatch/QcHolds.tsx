import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, ShieldAlert, ThumbsDown, ThumbsUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { uploadPhoto } from '../../lib/photos'
import { PhotoInput } from '../../components/PhotoInput'

interface QcHoldRow {
  id: string
  qty: number
  created_at: string
  items: { code: string; name: string; uom: string }
  shelves: { code: string } | null
}

/**
 * QC Hold / Quarantine (PRD 4.8): held items cannot be issued. Manager or
 * designated inspector releases (back to stock) or rejects (scrap / RTV).
 * Storekeepers see the list read-only.
 */
export function QcHolds() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const canDecide = ['manager', 'admin'].includes(profile!.role)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [done, setDone] = useState<string | null>(null)

  const { data: holds, isLoading } = useQuery({
    queryKey: ['qc-holds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qc_holds')
        .select('id, qty, created_at, items(code, name, uom), shelves(code)')
        .is('decision', null)
        .order('created_at')
      if (error) throw error
      return data as unknown as QcHoldRow[]
    },
  })

  const decide = useMutation({
    mutationFn: async ({ holdId, decision }: { holdId: string; decision: 'RELEASE' | 'REJECT' }) => {
      const photoPaths = await Promise.all(
        photos.map((f) => uploadPhoto(f, profile!.tenant_id, 'qc')),
      )
      const { error } = await supabase.rpc('decide_qc_hold', {
        p_qc_hold_id: holdId,
        p_decision: decision,
        p_reason: reason.trim() || decision.toLowerCase(),
        p_photo_urls: photoPaths,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: decision === 'RELEASE' ? 'release.qc_hold' : 'reject.qc_hold',
        entityType: 'qc_hold',
        entityId: holdId,
        after: { reason: reason.trim() },
      })
      return decision
    },
    onSuccess: (decision) => {
      setDone(decision === 'RELEASE' ? 'Released back to general stock.' : 'Rejected — removed from stock (scrap / RTV).')
      setDeciding(null)
      setReason('')
      setPhotos([])
      void queryClient.invalidateQueries({ queryKey: ['qc-holds'] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-6 w-6 text-tan-dark" />
        <h1 className="text-xl font-bold">QC Hold / Quarantine</h1>
      </div>

      {done && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {done}
        </div>
      )}

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-tan-dark" />
      ) : (holds ?? []).length === 0 ? (
        <div className="card py-10 text-center text-ink-400">
          Nothing in quarantine. Items marked "Hold for QC" during GRN verification appear here.
        </div>
      ) : (
        (holds ?? []).map((hold) => (
          <div key={hold.id} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{hold.items.name}</p>
                <p className="text-sm text-ink-400">
                  {hold.qty} {hold.items.uom} on {hold.shelves?.code ?? 'no shelf yet'} · held since{' '}
                  {new Date(hold.created_at).toLocaleDateString()}
                </p>
              </div>
              {canDecide && deciding !== hold.id && (
                <button className="btn-secondary" onClick={() => setDeciding(hold.id)}>
                  Inspect
                </button>
              )}
            </div>

            {deciding === hold.id && (
              <div className="space-y-3 border-t border-tan/20 pt-3">
                <div>
                  <label className="label-text">Inspection observations</label>
                  <input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="What did you find?" />
                </div>
                <PhotoInput files={photos} onChange={setPhotos} label="Inspection" />
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ holdId: hold.id, decision: 'RELEASE' })}
                  >
                    <ThumbsUp className="h-5 w-5" /> Release to stock
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ holdId: hold.id, decision: 'REJECT' })}
                  >
                    <ThumbsDown className="h-5 w-5" /> Reject (scrap / RTV)
                  </button>
                  <button className="btn-secondary" onClick={() => setDeciding(null)}>Cancel</button>
                </div>
                {decide.isError && (
                  <p className="text-sm text-red-600">{(decide.error as Error).message}</p>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
