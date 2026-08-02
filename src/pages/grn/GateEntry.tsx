import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Hand, Loader2, Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { uploadPhoto } from '../../lib/photos'
import { useOffline } from '../../lib/offline/queue'
import { PhotoInput } from '../../components/PhotoInput'

const MATERIAL_TYPES = ['Fabric', 'Foam', 'Wood', 'Leather', 'Hardware', 'Packing Material', 'Other']

/**
 * GRN Stage 1 — Security gate entry (PRD 4.3). Photo-heavy, big buttons.
 *
 * Two ways in:
 * - **By vehicle** (default): vehicle plate+photos, driver details+photos.
 * - **Hand delivery**: someone walks in with just a PO — no vehicle or driver
 *   to photograph, so those sections drop away. A document photo is still
 *   required as proof of what arrived.
 * Both need a supplier, material type, cartons, and ≥1 document photo.
 */
export function GateEntry() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'vehicle' | 'hand'>('vehicle')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [vehiclePhotos, setVehiclePhotos] = useState<File[]>([])
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [driverLicense, setDriverLicense] = useState('')
  const [driverPhotos, setDriverPhotos] = useState<File[]>([])
  const [transporter, setTransporter] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [supplierFreetext, setSupplierFreetext] = useState('')
  const [poRef, setPoRef] = useState('')
  const [documentPhotos, setDocumentPhotos] = useState<File[]>([])
  const [materialType, setMaterialType] = useState(MATERIAL_TYPES[0])
  const [cartons, setCartons] = useState('')

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      const hand = mode === 'hand'
      if (documentPhotos.length === 0) {
        throw new Error('At least one document photo (invoice / e-way bill / LR / PO) is mandatory.')
      }
      if (!hand && vehiclePhotos.length === 0) throw new Error('Vehicle photo is mandatory.')
      if (!hand && driverPhotos.length === 0) throw new Error('Driver photo is mandatory.')
      if (!supplierId && !supplierFreetext.trim()) throw new Error('Select or type the supplier.')

      // Hand delivery has no vehicle/driver to record — send empty values for
      // those NOT NULL columns and no vehicle/driver photos.
      const vehNo = hand ? '' : vehicleNumber.trim().toUpperCase()
      const license = hand ? '' : driverLicense.trim()
      const vehFiles = hand ? [] : vehiclePhotos
      const drvFiles = hand ? [] : driverPhotos

      // Offline: queue the whole gate entry, photos included (PRD 7.5 —
      // GRN Stage 1 is one of the five screens that must work offline)
      if (!navigator.onLine) {
        await useOffline.getState().enqueue(
          'grn_gate_entry',
          {
            p_supplier_id: supplierId || null,
            p_supplier_name_freetext: supplierFreetext.trim() || null,
            p_po_ref: poRef.trim() || null,
            p_material_type: materialType,
            p_cartons: Number(cartons),
            p_vehicle_number: vehNo,
            p_driver_name: driverName.trim(),
            p_driver_phone: driverPhone.trim(),
            p_driver_license: license,
            p_transporter: transporter.trim() || null,
          },
          {
            p_vehicle_photos: vehFiles,
            p_driver_photos: drvFiles,
            p_document_photos: documentPhotos,
          },
          'grn',
          profile!.tenant_id,
        )
        return null
      }

      const upload = (files: File[]) =>
        Promise.all(files.map((f) => uploadPhoto(f, profile!.tenant_id, 'grn')))

      const [vp, dp, docp] = await Promise.all([
        upload(vehFiles),
        upload(drvFiles),
        upload(documentPhotos),
      ])

      const { data, error } = await supabase.rpc('create_grn_gate_entry', {
        p_supplier_id: supplierId || null,
        p_supplier_name_freetext: supplierFreetext.trim() || null,
        p_po_ref: poRef.trim() || null,
        p_material_type: materialType,
        p_cartons: Number(cartons),
        p_vehicle_number: vehNo,
        p_vehicle_photos: vp,
        p_driver_name: driverName.trim(),
        p_driver_phone: driverPhone.trim(),
        p_driver_license: license,
        p_driver_photos: dp,
        p_transporter: transporter.trim() || null,
        p_document_photos: docp,
      })
      if (error) throw error
      const row = (data as { grn_id: string; grn_number: string }[])[0]
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.grn_gate_entry',
        entityType: 'grn',
        entityId: row.grn_id,
        after: { grn_number: row.grn_number, mode, vehicle: vehNo, material: materialType },
      })
      return row
    },
    onSuccess: (row) => {
      // Queued offline: the GRN number is allocated at sync time
      if (row === null) navigate('/')
      else navigate(`/grn/${row.grn_id}`)
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-6 w-6 text-brand-500" />
        <h1 className="text-xl font-bold">New Gate Entry</h1>
      </div>

      {/* How did it arrive? A vehicle at the gate, or someone by hand with a PO. */}
      <div className="inline-flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
        <button type="button"
          className={`inline-flex min-h-tap items-center gap-1.5 rounded-lg px-4 ${mode === 'vehicle' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
          onClick={() => setMode('vehicle')}>
          <Truck className="h-4 w-4" /> By vehicle
        </button>
        <button type="button"
          className={`inline-flex min-h-tap items-center gap-1.5 rounded-lg px-4 ${mode === 'hand' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
          onClick={() => setMode('hand')}>
          <Hand className="h-4 w-4" /> Hand delivery
        </button>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
      >
        {mode === 'vehicle' && (
          <div className="card space-y-3">
            <p className="font-semibold">Vehicle</p>
            <div>
              <label className="label-text">Number plate</label>
              <input
                className="input-field font-mono uppercase"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="RJ19 AB 1234"
                required
              />
            </div>
            <div>
              <label className="label-text">Vehicle photos (front + back) — mandatory</label>
              <PhotoInput files={vehiclePhotos} onChange={setVehiclePhotos} label="Vehicle" />
            </div>
          </div>
        )}

        <div className="card space-y-3">
          <p className="font-semibold">{mode === 'hand' ? 'Delivered by' : 'Driver'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-text">Name{mode === 'hand' ? ' (optional)' : ''}</label>
              <input className="input-field" value={driverName} onChange={(e) => setDriverName(e.target.value)}
                placeholder={mode === 'hand' ? "person who brought it" : undefined}
                required={mode === 'vehicle'} />
            </div>
            <div>
              <label className="label-text">Phone{mode === 'hand' ? ' (optional)' : ''}</label>
              <input className="input-field" inputMode="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)}
                required={mode === 'vehicle'} />
            </div>
            {mode === 'vehicle' && (
              <div className="sm:col-span-2">
                <label className="label-text">License number</label>
                <input className="input-field font-mono" value={driverLicense} onChange={(e) => setDriverLicense(e.target.value)} required />
              </div>
            )}
          </div>
          {mode === 'vehicle' && (
            <div>
              <label className="label-text">Driver photos (face + license) — mandatory</label>
              <PhotoInput files={driverPhotos} onChange={setDriverPhotos} label="Driver" />
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <p className="font-semibold">Consignment</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-text">Supplier (from master)</label>
              <select className="input-field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— not in list —</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {!supplierId && (
              <div>
                <label className="label-text">Supplier name (free text)</label>
                <input className="input-field" value={supplierFreetext} onChange={(e) => setSupplierFreetext(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label-text">Transporter / logistics co.</label>
              <input className="input-field" value={transporter} onChange={(e) => setTransporter(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Expected PO number (reference only)</label>
              <input className="input-field font-mono" value={poRef} onChange={(e) => setPoRef(e.target.value)} placeholder="PO-0089" />
            </div>
            <div>
              <label className="label-text">Material type declared</label>
              <select className="input-field" value={materialType} onChange={(e) => setMaterialType(e.target.value)}>
                {MATERIAL_TYPES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-text">Cartons / units declared</label>
              <input type="number" min="1" className="input-field" value={cartons} onChange={(e) => setCartons(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label-text">Document photos (invoice, e-way bill, LR, PO) — at least one</label>
            <PhotoInput files={documentPhotos} onChange={setDocumentPhotos} label="Document" />
          </div>
        </div>

        {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}

        <button type="submit" className="btn-primary w-full" disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          {submit.isPending ? 'Uploading photos…' : 'Create gate entry'}
        </button>
      </form>
    </div>
  )
}
