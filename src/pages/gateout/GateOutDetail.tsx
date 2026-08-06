import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Hand, Loader2, Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PhotoGallery } from '../../components/PhotoGallery'

interface GateOutDetailData {
  id: string
  gate_out_number: string
  customer_freetext: string | null
  reference: string | null
  goods_description: string | null
  material_type_declared: string | null
  cartons_declared: number | null
  vehicle_number: string
  vehicle_photos: string[]
  driver_name: string | null
  driver_phone: string | null
  driver_license: string | null
  driver_photos: string[]
  transporter: string | null
  lr_number: string | null
  document_photos: string[]
  departure_photo: string | null
  note: string | null
  departed_at: string
  customers: { name: string } | null
}

/**
 * Gate Out detail — the recorded departure, shown as grouped fields + split photo
 * galleries, mirroring the Receiving GateEntryCard. Hand collection is detected by
 * a blank vehicle number (same convention as GRN).
 */
export function GateOutDetail() {
  const { id } = useParams<{ id: string }>()

  const { data: g, isLoading } = useQuery({
    queryKey: ['gate-out', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gate_outs')
        .select(
          `id, gate_out_number, customer_freetext, reference, goods_description,
           material_type_declared, cartons_declared, vehicle_number, vehicle_photos,
           driver_name, driver_phone, driver_license, driver_photos, transporter,
           lr_number, document_photos, departure_photo, note, departed_at,
           customers(name)`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as GateOutDetailData
    },
  })

  if (isLoading || !g) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-brand-500" />
  }

  const hand = !g.vehicle_number?.trim()

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold">{g.gate_out_number}</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
            {hand ? <><Hand className="h-3.5 w-3.5" /> Hand collection</> : <><Truck className="h-3.5 w-3.5" /> By vehicle</>}
          </span>
        </div>
        <p className="text-sm text-ink-400">
          {g.customers?.name ?? g.customer_freetext ?? 'Unknown customer'}
          {g.reference ? ` · ${g.reference}` : ''}
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle2 className="h-5 w-5" />
          <p className="font-semibold">Departed {new Date(g.departed_at).toLocaleString()}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {!hand && <Field label="Vehicle" value={g.vehicle_number} mono />}
          <Field label={hand ? 'Collected by' : 'Driver'} value={g.driver_name} />
          <Field label="Phone" value={g.driver_phone} />
          {!hand && <Field label="Licence" value={g.driver_license} mono />}
          <Field label="Transporter" value={g.transporter} />
          <Field label="Material" value={g.material_type_declared} />
          <Field label="Cartons" value={g.cartons_declared != null ? String(g.cartons_declared) : null} />
          <Field label="LR number" value={g.lr_number} mono />
          <Field label="Goods" value={g.goods_description} />
          <Field label="Note" value={g.note} />
        </dl>

        <div className="space-y-3 border-t border-ink-200/70 pt-3">
          <PhotoSection label="Vehicle" paths={g.vehicle_photos} />
          <PhotoSection label="Driver" paths={g.driver_photos} />
          <PhotoSection label="Documents" paths={g.document_photos} />
          <PhotoSection label="Departure" paths={g.departure_photo ? [g.departure_photo] : []} />
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={`font-medium text-ink-800 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function PhotoSection({ label, paths }: { label: string; paths: string[] }) {
  if (paths.length === 0) return null
  return (
    <div>
      <p className="label-text !mb-1">{label}</p>
      <PhotoGallery paths={paths} />
    </div>
  )
}
