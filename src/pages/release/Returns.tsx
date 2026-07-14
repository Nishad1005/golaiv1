import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Undo2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { uploadPhoto } from '../../lib/photos'
import { ScanInput } from '../../components/ScanInput'
import { PhotoInput } from '../../components/PhotoInput'

const REASONS = ['surplus', 'wrong_item', 'damaged', 'production_cancelled', 'quality_fail', 'other']
const RETURN_TYPES = [
  { value: 'PRODUCTION', label: 'Production return (surplus / unused)' },
  { value: 'RTV', label: 'RTV — return to vendor' },
  { value: 'RMA', label: 'RMA — customer return' },
] as const

interface IssuanceForReturn {
  id: string
  iss_number: string
  so_ref: string | null
  issued_at: string
  departments: { name: string } | null
  issuance_lines: {
    item_id: string
    qty: number
    items: { code: string; name: string; uom: string }
  }[]
  returns: { return_lines: { item_id: string; qty: number }[] }[]
}

/**
 * Returns from production (PRD 4.6): scan the issuance label barcode →
 * original issuance recognized → enter qty (≤ outstanding) → reason →
 * photo → scan putback shelf.
 */
export function Returns() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [issuance, setIssuance] = useState<IssuanceForReturn | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({})
  const [reason, setReason] = useState(REASONS[0])
  const [returnType, setReturnType] = useState<string>('PRODUCTION')
  const [photos, setPhotos] = useState<File[]>([])
  const [done, setDone] = useState<string | null>(null)

  const findIssuance = async (scan: string) => {
    setError(null)
    setDone(null)
    const { data } = await supabase
      .from('issuances')
      .select(
        `id, iss_number, so_ref, issued_at, departments(name),
         issuance_lines(item_id, qty, items(code, name, uom)),
         returns(return_lines(item_id, qty))`,
      )
      .eq('iss_number', scan.trim())
      .maybeSingle()
    if (!data) {
      setError(`Issuance "${scan}" not found. Scan the barcode on the issuance label.`)
      return
    }
    setIssuance(data as unknown as IssuanceForReturn)
    setQtyByItem({})
  }

  const outstanding = (itemId: string) => {
    if (!issuance) return 0
    const issued = issuance.issuance_lines
      .filter((l) => l.item_id === itemId)
      .reduce((s, l) => s + l.qty, 0)
    const returned = issuance.returns
      .flatMap((r) => r.return_lines)
      .filter((l) => l.item_id === itemId)
      .reduce((s, l) => s + l.qty, 0)
    return issued - returned
  }

  // Distinct items on the issuance
  const items = issuance
    ? [...new Map(issuance.issuance_lines.map((l) => [l.item_id, l])).values()]
    : []

  const selected = items.filter((l) => Number(qtyByItem[l.item_id] ?? 0) > 0)

  const submit = useMutation({
    mutationFn: async (shelfCode: string) => {
      const { data: shelf } = await supabase
        .from('shelves')
        .select('id, code')
        .ilike('code', shelfCode)
        .is('deleted_at', null)
        .maybeSingle()
      if (!shelf) throw new Error(`Shelf "${shelfCode}" not found.`)

      for (const line of selected) {
        const amount = Number(qtyByItem[line.item_id])
        if (amount > outstanding(line.item_id)) {
          throw new Error(
            `${line.items.name}: return of ${amount} exceeds outstanding ${outstanding(line.item_id)}.`,
          )
        }
      }

      const photoPaths = await Promise.all(
        photos.map((f) => uploadPhoto(f, profile!.tenant_id, 'returns')),
      )

      const { data, error } = await supabase.rpc('create_return', {
        p_issuance_id: issuance!.id,
        p_return_type: returnType,
        p_reason_code: reason,
        p_photo_urls: photoPaths,
        p_lines: selected.map((l) => ({
          item_id: l.item_id,
          shelf_id: shelf.id,
          qty: Number(qtyByItem[l.item_id]),
        })),
      })
      if (error) throw error
      const row = (data as { return_id: string; ret_number: string }[])[0]
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.return',
        entityType: 'return',
        entityId: row.return_id,
        after: { ret_number: row.ret_number, issuance: issuance!.iss_number, reason, shelf: shelf.code },
      })
      return row
    },
    onSuccess: (row) => {
      setDone(`${row.ret_number} recorded — stock is back on the shelf.`)
      setIssuance(null)
      setPhotos([])
      setQtyByItem({})
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
    onError: (e) => setError((e as Error).message),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Undo2 className="h-6 w-6 text-brand-500" />
        <h1 className="text-xl font-bold">Return to Store</h1>
      </div>

      {done && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {done}
        </div>
      )}

      {!issuance ? (
        <div className="card space-y-3">
          <p className="font-semibold">Scan the issuance label on the returning material</p>
          <ScanInput placeholder="issuance barcode (ISS-…)" onScan={(v) => void findIssuance(v)} />
        </div>
      ) : (
        <>
          <div className="card">
            <p className="font-mono font-semibold">{issuance.iss_number}</p>
            <p className="text-sm text-ink-400">
              {issuance.so_ref && <span className="font-mono">{issuance.so_ref} · </span>}
              {issuance.departments?.name} · issued {new Date(issuance.issued_at).toLocaleDateString()}
            </p>
          </div>

          <div className="card space-y-3">
            <p className="font-semibold">Quantities coming back</p>
            {items.map((line) => {
              const out = outstanding(line.item_id)
              return (
                <div key={line.item_id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{line.items.name}</p>
                    <p className="text-xs text-ink-400">
                      {out} {line.items.uom} outstanding
                    </p>
                  </div>
                  <input
                    type="number" inputMode="decimal" min="0" max={out} step="any"
                    className="input-field w-28 text-right font-bold"
                    placeholder="0"
                    value={qtyByItem[line.item_id] ?? ''}
                    onChange={(e) => setQtyByItem({ ...qtyByItem, [line.item_id]: e.target.value })}
                    disabled={out <= 0}
                  />
                </div>
              )
            })}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-text">Return type</label>
                <select className="input-field" value={returnType} onChange={(e) => setReturnType(e.target.value)}>
                  {RETURN_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-text">Reason</label>
                <select className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label-text">Photo evidence</label>
              <PhotoInput files={photos} onChange={setPhotos} label="Returned" />
            </div>
          </div>

          {selected.length > 0 && (
            <div className="card space-y-3">
              <p className="font-semibold">Scan the shelf where it goes back</p>
              <ScanInput placeholder="putback shelf" onScan={(v) => submit.mutate(v)} />
              {submit.isPending && <Loader2 className="h-5 w-5 animate-spin text-brand-500" />}
            </div>
          )}

          <button className="btn-secondary" onClick={() => setIssuance(null)}>
            Scan a different issuance
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
