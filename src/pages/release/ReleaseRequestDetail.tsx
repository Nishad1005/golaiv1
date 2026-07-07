import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Printer, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { uploadPhoto } from '../../lib/photos'
import { generateIssuanceLabelsPdf } from '../../lib/labels'
import { ScanInput } from '../../components/ScanInput'
import { PhotoInput } from '../../components/PhotoInput'
import { PhotoGallery } from '../../components/PhotoGallery'
import { SignaturePad } from '../../components/SignaturePad'
import { RR_STATUS_LABELS, RR_STATUS_STYLES } from './ReleaseRequestList'

interface RrDetail {
  id: string
  rr_number: string
  so_ref: string | null
  customer_note: string | null
  status: string
  required_by: string | null
  notes: string | null
  created_at: string
  departments: { name: string } | null
  foreman: { id: string; full_name: string } | null
  release_request_lines: {
    id: string
    qty_requested: number
    qty_issued: number
    items: { id: string; code: string; name: string; uom: string }
  }[]
  issuances: {
    id: string
    iss_number: string
    issued_at: string
    photo_urls: string[]
    foreman_signature_url: string | null
    issuance_lines: {
      qty: number
      items: { code: string; name: string; uom: string }
      shelves: { code: string } | null
    }[]
  }[]
}

interface StagedLine {
  rrLineId: string
  itemId: string
  itemCode: string
  itemName: string
  uom: string
  shelfId: string
  shelfCode: string
  qty: number
}

export function ReleaseRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isApprover = ['manager', 'admin'].includes(profile!.role)
  const canFulfill = ['storekeeper', 'manager', 'admin'].includes(profile!.role)

  const { data: rr, isLoading } = useQuery({
    queryKey: ['release-request', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('release_requests')
        .select(
          `id, rr_number, so_ref, customer_note, status, required_by, notes, created_at,
           departments(name),
           foreman:profiles!release_requests_foreman_id_fkey(id, full_name),
           release_request_lines(id, qty_requested, qty_issued, items(id, code, name, uom)),
           issuances(id, iss_number, issued_at, photo_urls, foreman_signature_url,
             issuance_lines(qty, items(code, name, uom), shelves(code)))`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as RrDetail
    },
  })

  const decide = useMutation({
    mutationFn: async (approve: boolean) => {
      const { error } = await supabase.rpc('decide_release_request', {
        p_rr_id: id,
        p_approve: approve,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: approve ? 'approve.release_request' : 'cancel.release_request',
        entityType: 'release_request',
        entityId: id,
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['release-request', id] }),
  })

  if (isLoading || !rr) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-tan-dark" />
  }

  const printIssuanceLabels = (iss: RrDetail['issuances'][number]) => {
    generateIssuanceLabelsPdf(
      iss.issuance_lines.map((l) => ({
        itemCode: l.items.code,
        itemName: l.items.name,
        qty: `${l.qty} ${l.items.uom}`,
        soRef: rr.so_ref,
        customerNote: rr.customer_note,
        department: rr.departments?.name ?? '',
        foreman: rr.foreman?.full_name ?? '',
        dateIssued: new Date(iss.issued_at).toLocaleDateString(),
        issNumber: iss.iss_number,
        rrNumber: rr.rr_number,
      })),
      `${iss.iss_number.replaceAll('/', '-')}-labels.pdf`,
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold">{rr.rr_number}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RR_STATUS_STYLES[rr.status]}`}>
            {RR_STATUS_LABELS[rr.status]}
          </span>
        </div>
        <p className="text-sm text-ink-400">
          {rr.so_ref && <span className="font-mono">{rr.so_ref} · </span>}
          {rr.customer_note && `${rr.customer_note} · `}
          {rr.departments?.name} · foreman {rr.foreman?.full_name}
          {rr.required_by && ` · needed by ${new Date(rr.required_by).toLocaleDateString()}`}
        </p>
        {rr.notes && <p className="mt-1 text-sm text-ink-500">{rr.notes}</p>}
      </div>

      <div className="card space-y-2">
        <p className="font-semibold">Requested items</p>
        {rr.release_request_lines.map((line) => (
          <div key={line.id} className="flex items-center gap-2 rounded-xl border border-tan/20 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{line.items.name}</p>
              <p className="text-xs text-ink-400">{line.items.code}</p>
            </div>
            <span className="tabular-nums">
              {line.qty_issued} / {line.qty_requested} {line.items.uom} issued
            </span>
          </div>
        ))}
      </div>

      {rr.status === 'DRAFT' && isApprover && (
        <div className="card flex flex-wrap items-center gap-3">
          <p className="flex-1 font-semibold">Approve this release request?</p>
          <button className="btn-primary" onClick={() => decide.mutate(true)} disabled={decide.isPending}>
            <ThumbsUp className="h-5 w-5" /> Approve
          </button>
          <button className="btn-secondary" onClick={() => decide.mutate(false)} disabled={decide.isPending}>
            <ThumbsDown className="h-5 w-5" /> Cancel request
          </button>
        </div>
      )}
      {rr.status === 'DRAFT' && !isApprover && (
        <p className="text-sm text-ink-400">Waiting for manager approval.</p>
      )}

      {(rr.status === 'APPROVED' || rr.status === 'PARTIALLY_FULFILLED') && canFulfill && (
        <FulfillPanel rr={rr} onFulfilled={printIssuanceLabels} />
      )}

      {rr.issuances.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Issuances</h2>
          {rr.issuances.map((iss) => (
            <div key={iss.id} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold">{iss.iss_number}</span>
                <span className="text-sm text-ink-400">{new Date(iss.issued_at).toLocaleString()}</span>
                <button className="btn-secondary ml-auto" onClick={() => printIssuanceLabels(iss)}>
                  <Printer className="h-5 w-5" /> Labels
                </button>
              </div>
              <ul className="text-sm">
                {iss.issuance_lines.map((l, i) => (
                  <li key={i}>
                    {l.qty} {l.items.uom} × {l.items.name} from {l.shelves?.code}
                  </li>
                ))}
              </ul>
              <PhotoGallery paths={iss.photo_urls} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Storekeeper fulfillment: scan shelf per line, stage, sign, submit, print.
// ---------------------------------------------------------------------------
function FulfillPanel({
  rr,
  onFulfilled,
}: {
  rr: RrDetail
  onFulfilled: (iss: RrDetail['issuances'][number]) => void
}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [staged, setStaged] = useState<StagedLine[]>([])
  const [activeLine, setActiveLine] = useState<string | null>(null)
  const [qty, setQty] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [signature, setSignature] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remainingFor = (lineId: string) => {
    const line = rr.release_request_lines.find((l) => l.id === lineId)!
    const stagedQty = staged.filter((s) => s.rrLineId === lineId).reduce((sum, s) => sum + s.qty, 0)
    return line.qty_requested - line.qty_issued - stagedQty
  }

  // Where does this item live? (helps the storekeeper walk to the right shelf)
  const { data: locations } = useQuery({
    queryKey: ['rr-locations', rr.id],
    queryFn: async () => {
      const itemIds = rr.release_request_lines.map((l) => l.items.id)
      const { data, error } = await supabase
        .from('stock_balances')
        .select('item_id, qty_on_hand, shelf_id, shelves(code)')
        .in('item_id', itemIds)
        .gt('qty_on_hand', 0)
      if (error) throw error
      return data as unknown as {
        item_id: string
        qty_on_hand: number
        shelf_id: string
        shelves: { code: string } | null
      }[]
    },
  })

  const stageFromShelf = async (lineId: string, shelfCode: string) => {
    setError(null)
    const line = rr.release_request_lines.find((l) => l.id === lineId)!
    const amount = Number(qty)
    const remaining = remainingFor(lineId)
    if (!amount || amount <= 0 || amount > remaining) {
      setError(`Quantity must be between 0 and ${remaining}.`)
      return
    }
    const loc = (locations ?? []).find(
      (l) => l.item_id === line.items.id && l.shelves?.code.toLowerCase() === shelfCode.toLowerCase(),
    )
    if (!loc) {
      setError(`${line.items.name} has no stock on "${shelfCode}". Scan one of its shelves.`)
      return
    }
    if (amount > loc.qty_on_hand) {
      setError(`Only ${loc.qty_on_hand} ${line.items.uom} on ${shelfCode}.`)
      return
    }
    setStaged([
      ...staged,
      {
        rrLineId: lineId,
        itemId: line.items.id,
        itemCode: line.items.code,
        itemName: line.items.name,
        uom: line.items.uom,
        shelfId: loc.shelf_id,
        shelfCode: loc.shelves!.code,
        qty: amount,
      },
    ])
    setActiveLine(null)
    setQty('')
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (staged.length === 0) throw new Error('Nothing staged to issue.')
      if (photos.length === 0) throw new Error('Photo of staged items is required.')
      if (!signature) throw new Error('Foreman signature is required.')

      const photoPaths = await Promise.all(
        photos.map((f) => uploadPhoto(f, profile!.tenant_id, 'issuance')),
      )
      const sigPath = `${profile!.tenant_id}/signatures/${crypto.randomUUID()}.png`
      const { error: sigError } = await supabase.storage.from('photos').upload(sigPath, signature, {
        contentType: 'image/png',
      })
      if (sigError) throw new Error(`Signature upload failed: ${sigError.message}`)

      const { data, error } = await supabase.rpc('fulfill_release_request', {
        p_rr_id: rr.id,
        p_lines: staged.map((s) => ({
          rr_line_id: s.rrLineId,
          item_id: s.itemId,
          shelf_id: s.shelfId,
          qty: s.qty,
        })),
        p_photo_urls: photoPaths,
        p_signature_url: sigPath,
      })
      if (error) throw error
      const row = (data as { issuance_id: string; iss_number: string }[])[0]
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'fulfill.release_request',
        entityType: 'issuance',
        entityId: row.issuance_id,
        after: { iss_number: row.iss_number, rr_number: rr.rr_number, lines: staged.length },
      })
      return row
    },
    onSuccess: (row) => {
      // Print labels immediately — every item leaving the store gets one (PRD 4.4)
      onFulfilled({
        id: row.issuance_id,
        iss_number: row.iss_number,
        issued_at: new Date().toISOString(),
        photo_urls: [],
        foreman_signature_url: null,
        issuance_lines: staged.map((s) => ({
          qty: s.qty,
          items: { code: s.itemCode, name: s.itemName, uom: s.uom },
          shelves: { code: s.shelfCode },
        })),
      })
      setStaged([])
      setPhotos([])
      setSignature(null)
      void queryClient.invalidateQueries({ queryKey: ['release-request', rr.id] })
      void queryClient.invalidateQueries({ queryKey: ['item-locator'] })
    },
  })

  const pendingLines = rr.release_request_lines.filter((l) => remainingFor(l.id) > 0)

  return (
    <div className="card space-y-4">
      <p className="font-semibold">Fulfill — walk to each shelf, scan, stage</p>

      {pendingLines.map((line) => {
        const remaining = remainingFor(line.id)
        const locs = (locations ?? []).filter((l) => l.item_id === line.items.id)
        const active = activeLine === line.id
        return (
          <div key={line.id} className="rounded-xl border border-tan/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{line.items.name}</p>
                <p className="text-xs text-ink-400">
                  {remaining} {line.items.uom} needed ·{' '}
                  {locs.length > 0
                    ? 'on ' + locs.map((l) => `${l.shelves?.code} (${l.qty_on_hand})`).join(', ')
                    : 'no stock found!'}
                </p>
              </div>
              {!active && locs.length > 0 && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setActiveLine(line.id)
                    setQty(String(Math.min(remaining, Math.max(...locs.map((l) => l.qty_on_hand)))))
                  }}
                >
                  Pick
                </button>
              )}
            </div>
            {active && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="label-text">Quantity</label>
                  <input
                    type="number" inputMode="decimal" min="0.01" max={remaining} step="any"
                    className="input-field w-40"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <ScanInput
                  placeholder="shelf you are picking from"
                  onScan={(code) => void stageFromShelf(line.id, code)}
                />
              </div>
            )}
          </div>
        )
      })}

      {staged.length > 0 && (
        <>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Staged for issue</p>
            {staged.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-cream px-3 py-2 text-sm">
                <span className="flex-1">
                  {s.qty} {s.uom} × {s.itemName} from {s.shelfCode}
                </span>
                <button
                  className="text-ink-400"
                  onClick={() => setStaged(staged.filter((_, idx) => idx !== i))}
                  aria-label="Remove staged line"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="label-text">Photo of staged items (mandatory)</label>
            <PhotoInput files={photos} onChange={setPhotos} label="Staged" />
          </div>

          <SignaturePad
            label={`Foreman signature — ${rr.foreman?.full_name ?? ''} confirms receipt`}
            onChange={setSignature}
          />

          <button className="btn-primary w-full" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            Issue {staged.length} line{staged.length > 1 ? 's' : ''} & print labels
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
    </div>
  )
}
