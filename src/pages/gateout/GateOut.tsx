import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { DoorOpen, Hand, Loader2, Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { uploadPhoto } from '../../lib/photos'
import { MATERIAL_TYPES } from '../../lib/materials'
import { PhotoInput } from '../../components/PhotoInput'

/**
 * Gate Out — standalone outbound gate log (module `gate_out`). Mirrors the
 * Receiving gate entry, but for goods leaving: a guard records the vehicle (or a
 * by-hand collection), driver, transporter, declared material/cartons, customer
 * and paperwork photos in one screen. It is a LOG — it does not move stock and
 * has no item lines. Online-only, like the Dispatch gate-out.
 */
export function GateOut() {
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
  const [customerId, setCustomerId] = useState('')
  const [customerFreetext, setCustomerFreetext] = useState('')
  const [reference, setReference] = useState('')
  const [goodsDescription, setGoodsDescription] = useState('')
  const [materialType, setMaterialType] = useState('')
  const [cartons, setCartons] = useState('')
  const [lrNumber, setLrNumber] = useState('')
  const [documentPhotos, setDocumentPhotos] = useState<File[]>([])
  const [departurePhotos, setDeparturePhotos] = useState<File[]>([])
  const [note, setNote] = useState('')

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
  })

  const hand = mode === 'hand'

  const submit = useMutation({
    mutationFn: async () => {
      if (documentPhotos.length === 0) {
        throw new Error('At least one document photo (invoice / e-way bill / LR) is mandatory.')
      }
      if (!customerId && !customerFreetext.trim()) throw new Error('Select or type the customer.')
      if (!hand) {
        if (!vehicleNumber.trim()) throw new Error('Vehicle number is required.')
        if (vehiclePhotos.length === 0) throw new Error('Vehicle photo is mandatory.')
        if (driverPhotos.length === 0) throw new Error('Driver photo is mandatory.')
        if (!driverName.trim()) throw new Error('Driver name is required.')
        if (!driverPhone.trim()) throw new Error('Driver phone is required.')
      }

      const vehNo = hand ? '' : vehicleNumber.trim().toUpperCase()
      const license = hand ? '' : driverLicense.trim()
      const vehFiles = hand ? [] : vehiclePhotos
      const drvFiles = hand ? [] : driverPhotos

      const upload = (files: File[]) =>
        Promise.all(files.map((f) => uploadPhoto(f, profile!.tenant_id, 'gate-out')))

      const [vp, dp, docp, depp] = await Promise.all([
        upload(vehFiles),
        upload(drvFiles),
        upload(documentPhotos),
        upload(departurePhotos),
      ])

      const { data, error } = await supabase.rpc('create_gate_out', {
        p_customer_id: customerId || null,
        p_customer_freetext: customerFreetext.trim() || null,
        p_reference: reference.trim() || null,
        p_goods_description: goodsDescription.trim() || null,
        p_material_type: materialType || null,
        p_cartons: cartons ? Number(cartons) : null,
        p_vehicle_number: vehNo,
        p_vehicle_photos: vp,
        p_driver_name: driverName.trim() || null,
        p_driver_phone: driverPhone.trim() || null,
        p_driver_license: license || null,
        p_driver_photos: dp,
        p_transporter: transporter.trim() || null,
        p_lr_number: lrNumber.trim() || null,
        p_document_photos: docp,
        p_departure_photo: depp[0] ?? null,
        p_note: note.trim() || null,
      })
      if (error) throw error
      const row = (data as { gate_out_id: string; gate_out_number: string }[])[0]
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.gate_out',
        entityType: 'gate_out',
        entityId: row.gate_out_id,
        after: { gate_out_number: row.gate_out_number, mode, vehicle: vehNo, customer: customers?.find((c) => c.id === customerId)?.name ?? customerFreetext },
      })
      return row
    },
    onSuccess: (row) => navigate(`/gate-out/${row.gate_out_id}`),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <DoorOpen className="h-6 w-6 text-brand-500" />
        <h1 className="text-xl font-bold">New Gate Out</h1>
      </div>

      {/* How is it leaving? On a vehicle, or collected by hand (courier/customer). */}
      <div className="inline-flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
        <button type="button"
          className={`inline-flex min-h-tap items-center gap-1.5 rounded-lg px-4 ${mode === 'vehicle' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
          onClick={() => setMode('vehicle')}>
          <Truck className="h-4 w-4" /> By vehicle
        </button>
        <button type="button"
          className={`inline-flex min-h-tap items-center gap-1.5 rounded-lg px-4 ${mode === 'hand' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
          onClick={() => setMode('hand')}>
          <Hand className="h-4 w-4" /> Collected by hand
        </button>
      </div>

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate() }}>
        {mode === 'vehicle' && (
          <div className="card space-y-3">
            <p className="font-semibold">Vehicle</p>
            <div>
              <label className="label-text">Number plate</label>
              <input className="input-field font-mono uppercase" value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)} placeholder="RJ19 AB 1234" required />
            </div>
            <div>
              <label className="label-text">Vehicle photos (front + back) — mandatory</label>
              <PhotoInput files={vehiclePhotos} onChange={setVehiclePhotos} label="Vehicle" />
            </div>
          </div>
        )}

        <div className="card space-y-3">
          <p className="font-semibold">{hand ? 'Collected by' : 'Driver'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-text">Name{hand ? ' (optional)' : ''}</label>
              <input className="input-field" value={driverName} onChange={(e) => setDriverName(e.target.value)}
                placeholder={hand ? 'person collecting' : undefined} required={mode === 'vehicle'} />
            </div>
            <div>
              <label className="label-text">Phone{hand ? ' (optional)' : ''}</label>
              <input className="input-field" inputMode="tel" value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)} required={mode === 'vehicle'} />
            </div>
            {mode === 'vehicle' && (
              <div className="sm:col-span-2">
                <label className="label-text">License number</label>
                <input className="input-field font-mono" value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value)} />
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
              <label className="label-text">Customer (from master)</label>
              <select className="input-field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— not in list —</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {!customerId && (
              <div>
                <label className="label-text">Customer name (free text)</label>
                <input className="input-field" value={customerFreetext} onChange={(e) => setCustomerFreetext(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label-text">Reference (SO / DC / invoice no.)</label>
              <input className="input-field font-mono" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SO-0089" />
            </div>
            <div>
              <label className="label-text">Transporter / logistics co.</label>
              <input className="input-field" value={transporter} onChange={(e) => setTransporter(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Material type</label>
              <select className="input-field" value={materialType} onChange={(e) => setMaterialType(e.target.value)}>
                <option value="">— not declared —</option>
                {MATERIAL_TYPES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-text">Cartons / units declared</label>
              <input type="number" min="1" className="input-field" value={cartons} onChange={(e) => setCartons(e.target.value)} />
            </div>
            <div>
              <label className="label-text">LR number</label>
              <input className="input-field font-mono" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label-text">What is leaving (description)</label>
              <input className="input-field" value={goodsDescription} onChange={(e) => setGoodsDescription(e.target.value)}
                placeholder="e.g. 3 finished sofas" />
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <p className="font-semibold">Paperwork & photos</p>
          <div>
            <label className="label-text">Document photos (invoice, e-way bill, LR) — at least one</label>
            <PhotoInput files={documentPhotos} onChange={setDocumentPhotos} label="Documents" />
          </div>
          <div>
            <label className="label-text">Departure photo</label>
            <PhotoInput files={departurePhotos} onChange={setDeparturePhotos} label="Departure" />
          </div>
          <div>
            <label className="label-text">Note (optional)</label>
            <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}

        <button type="submit" className="btn-primary w-full" disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          {submit.isPending ? 'Uploading photos…' : 'Record gate out'}
        </button>
      </form>
    </div>
  )
}
