import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Printer, ScanBarcode, ThumbsDown, ThumbsUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { uploadPhoto } from '../../lib/photos'
import { generateCartonLabelsPdf } from '../../lib/labels'
import { ScanInput } from '../../components/ScanInput'
import { PhotoInput } from '../../components/PhotoInput'
import { PhotoGallery } from '../../components/PhotoGallery'
import { DC_STATUS_LABELS, DC_STATUS_STYLES } from './DispatchList'

interface DcDetail {
  id: string
  dc_number: string
  so_ref: string | null
  customer_note: string | null
  status: 'PICKED' | 'READY' | 'DISPATCHED' | 'REJECTED'
  reject_reason: string | null
  photo_urls: string[]
  created_at: string
  customers: { name: string } | null
  dispatch_lines: {
    id: string
    qty: number
    carton_barcode: string | null
    items: { code: string; name: string; uom: string }
    shelves: { code: string } | null
  }[]
  dispatch_gate_exits: {
    vehicle_number: string
    vehicle_photos: string[]
    driver_name: string | null
    lr_number: string | null
    lr_photo: string | null
    eway_bill_photo: string | null
    departure_photo: string | null
    departed_at: string
  }[]
}

export function DispatchDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isApprover = ['manager', 'admin'].includes(profile!.role)
  const canGateOut = ['security', 'manager', 'admin'].includes(profile!.role)
  const [rejectReason, setRejectReason] = useState('')

  const { data: dc, isLoading } = useQuery({
    queryKey: ['dispatch', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dispatches')
        .select(
          `id, dc_number, so_ref, customer_note, status, reject_reason, photo_urls, created_at,
           customers(name),
           dispatch_lines(id, qty, carton_barcode, items(code, name, uom), shelves(code)),
           dispatch_gate_exits(vehicle_number, vehicle_photos, driver_name, lr_number,
             lr_photo, eway_bill_photo, departure_photo, departed_at)`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as DcDetail
    },
  })

  const decide = useMutation({
    mutationFn: async (approve: boolean) => {
      const { error } = await supabase.rpc('decide_dispatch', {
        p_dispatch_id: id,
        p_approve: approve,
        p_reject_reason: approve ? null : rejectReason,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: approve ? 'approve.dispatch' : 'reject.dispatch',
        entityType: 'dispatch',
        entityId: id,
        after: approve ? undefined : { reason: rejectReason },
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dispatch', id] }),
  })

  if (isLoading || !dc) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-brand-500" />
  }

  const gateExit = dc.dispatch_gate_exits[0]

  const reprintCartons = () => {
    void generateCartonLabelsPdf(
      dc.dispatch_lines
        .filter((l) => l.carton_barcode)
        .map((l) => ({
          cartonBarcode: l.carton_barcode!,
          dcNumber: dc.dc_number,
          soRef: dc.so_ref,
          customerName: dc.customers?.name ?? dc.customer_note,
          contents: `${l.qty} ${l.items.uom} × ${l.items.name}`,
        })),
      `${dc.dc_number.replaceAll('/', '-')}-cartons.pdf`,
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold">{dc.dc_number}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DC_STATUS_STYLES[dc.status]}`}>
            {DC_STATUS_LABELS[dc.status]}
          </span>
          <button className="btn-secondary ml-auto" onClick={reprintCartons}>
            <Printer className="h-5 w-5" /> Carton labels
          </button>
        </div>
        <p className="text-sm text-ink-400">
          {dc.so_ref && <span className="font-mono">{dc.so_ref} · </span>}
          {dc.customers?.name ?? dc.customer_note}
        </p>
        {dc.reject_reason && (
          <p className="mt-1 text-sm text-red-600">Rejected: {dc.reject_reason}</p>
        )}
      </div>

      <div className="card space-y-2">
        <p className="font-semibold">Picked items</p>
        {dc.dispatch_lines.map((line) => (
          <div key={line.id} className="flex items-center gap-2 rounded-xl border border-tan/20 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{line.items.name}</p>
              <p className="text-xs text-ink-400">
                from {line.shelves?.code}
                {line.carton_barcode && <span className="ml-2 font-mono">{line.carton_barcode}</span>}
              </p>
            </div>
            <span className="tabular-nums">{line.qty} {line.items.uom}</span>
          </div>
        ))}
        <PhotoGallery paths={dc.photo_urls} />
      </div>

      {dc.status === 'PICKED' && isApprover && (
        <div className="card space-y-3">
          <p className="font-semibold">Approve this dispatch?</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={() => decide.mutate(true)} disabled={decide.isPending}>
              <ThumbsUp className="h-5 w-5" /> Approve
            </button>
            <input
              className="input-field flex-1"
              placeholder="Rejection reason (required to reject)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <button
              className="btn-secondary"
              onClick={() => decide.mutate(false)}
              disabled={decide.isPending || !rejectReason.trim()}
            >
              <ThumbsDown className="h-5 w-5" /> Reject
            </button>
          </div>
          {decide.isError && <p className="text-sm text-red-600">{(decide.error as Error).message}</p>}
        </div>
      )}

      {dc.status === 'READY' && canGateOut && <GateOutPanel dc={dc} />}

      {gateExit && (
        <div className="card space-y-2">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-semibold">
              Departed {new Date(gateExit.departed_at).toLocaleString()}
            </p>
          </div>
          <p className="text-sm">
            Vehicle <span className="font-mono font-semibold">{gateExit.vehicle_number}</span>
            {gateExit.driver_name && ` · driver ${gateExit.driver_name}`}
            {gateExit.lr_number && ` · LR ${gateExit.lr_number}`}
          </p>
          <PhotoGallery
            paths={[
              ...gateExit.vehicle_photos,
              ...(gateExit.lr_photo ? [gateExit.lr_photo] : []),
              ...(gateExit.eway_bill_photo ? [gateExit.eway_bill_photo] : []),
              ...(gateExit.departure_photo ? [gateExit.departure_photo] : []),
            ]}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage 3 — security gate-out: capture vehicle/docs, scan every carton.
// ---------------------------------------------------------------------------
function GateOutPanel({ dc }: { dc: DcDetail }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const expectedCartons = [...new Set(dc.dispatch_lines.map((l) => l.carton_barcode).filter(Boolean))] as string[]
  const [scanned, setScanned] = useState<string[]>([])
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverLicense, setDriverLicense] = useState('')
  const [lrNumber, setLrNumber] = useState('')
  const [vehiclePhotos, setVehiclePhotos] = useState<File[]>([])
  const [lrPhotos, setLrPhotos] = useState<File[]>([])
  const [ewayPhotos, setEwayPhotos] = useState<File[]>([])
  const [departurePhotos, setDeparturePhotos] = useState<File[]>([])

  const scanCarton = (code: string) => {
    setScanMsg(null)
    if (!expectedCartons.includes(code)) {
      setScanMsg(`Carton "${code}" does not belong to this DC!`)
      return
    }
    if (scanned.includes(code)) {
      setScanMsg(`Carton ${code} already scanned.`)
      return
    }
    setScanned([...scanned, code])
  }

  const allScanned = expectedCartons.every((c) => scanned.includes(c))

  const submit = useMutation({
    mutationFn: async () => {
      if (!allScanned) throw new Error('Scan every sealed carton before gate-out.')
      if (vehiclePhotos.length === 0) throw new Error('Vehicle photo is mandatory.')

      const upload = (files: File[]) =>
        Promise.all(files.map((f) => uploadPhoto(f, profile!.tenant_id, 'dispatch')))
      const [vp, lrp, ewp, depp] = await Promise.all([
        upload(vehiclePhotos), upload(lrPhotos), upload(ewayPhotos), upload(departurePhotos),
      ])

      const { error } = await supabase.rpc('gate_out_dispatch', {
        p_dispatch_id: dc.id,
        p_vehicle_number: vehicleNumber.trim().toUpperCase(),
        p_vehicle_photos: vp,
        p_driver_name: driverName.trim() || null,
        p_driver_license: driverLicense.trim() || null,
        p_lr_number: lrNumber.trim() || null,
        p_lr_photo: lrp[0] ?? null,
        p_eway_bill_photo: ewp[0] ?? null,
        p_departure_photo: depp[0] ?? null,
        p_scanned_cartons: scanned,
      })
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'gate_out.dispatch',
        entityType: 'dispatch',
        entityId: dc.id,
        after: { dc_number: dc.dc_number, vehicle: vehicleNumber, cartons: scanned.length },
      })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dispatch', dc.id] }),
  })

  return (
    <div className="card space-y-4">
      <p className="font-semibold">Gate-out — vehicle details & carton check</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label-text">Vehicle number *</label>
          <input className="input-field font-mono uppercase" value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)} required />
        </div>
        <div>
          <label className="label-text">Driver name</label>
          <input className="input-field" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </div>
        <div>
          <label className="label-text">Driver license</label>
          <input className="input-field font-mono" value={driverLicense}
            onChange={(e) => setDriverLicense(e.target.value)} />
        </div>
        <div>
          <label className="label-text">LR number</label>
          <input className="input-field font-mono" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label-text">Vehicle photos *</label>
          <PhotoInput files={vehiclePhotos} onChange={setVehiclePhotos} label="Vehicle" />
        </div>
        <div>
          <label className="label-text">LR photo</label>
          <PhotoInput files={lrPhotos} onChange={setLrPhotos} label="LR" />
        </div>
        <div>
          <label className="label-text">E-way bill photo</label>
          <PhotoInput files={ewayPhotos} onChange={setEwayPhotos} label="E-way" />
        </div>
        <div>
          <label className="label-text">Departure photo</label>
          <PhotoInput files={departurePhotos} onChange={setDeparturePhotos} label="Departure" />
        </div>
      </div>

      {expectedCartons.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-brand-500" />
            <p className="font-semibold">
              Scan cartons ({scanned.length} / {expectedCartons.length})
            </p>
          </div>
          <ScanInput placeholder="carton barcode" onScan={(v) => scanCarton(v)} autoFocus={false} />
          <div className="flex flex-wrap gap-2">
            {expectedCartons.map((c) => (
              <span
                key={c}
                className={
                  'rounded-lg px-3 py-1.5 font-mono text-xs ' +
                  (scanned.includes(c) ? 'bg-green-100 text-green-800' : 'bg-cream text-ink-400')
                }
              >
                {c} {scanned.includes(c) ? '✓' : ''}
              </span>
            ))}
          </div>
          {scanMsg && <p className="text-sm text-red-600">{scanMsg}</p>}
        </div>
      )}

      <button
        className="btn-primary w-full"
        disabled={submit.isPending || !allScanned || !vehicleNumber.trim()}
        onClick={() => submit.mutate()}
      >
        {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
        Confirm departure
      </button>
      {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
    </div>
  )
}
