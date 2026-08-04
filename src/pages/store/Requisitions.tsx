import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, Download, FileText, Loader2, MapPin, Plus, Search, Upload,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { parseCsv, findColumn, downloadCsv } from '../../lib/csv'
import { uploadFile } from '../../lib/files'
import { signedPhotoUrl } from '../../lib/photos'
import { num } from '../../lib/qty'
import { locationLabel } from '../../lib/places'
import { ItemThumb } from '../../components/ItemThumb'
import type { Item } from '../../lib/types'

const normalizeName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

type PickItem = Pick<Item, 'id' | 'code' | 'name' | 'uom' | 'item_type' | 'category' | 'photo_url'>

interface LocationOpt {
  shelfId: string
  code: string
  label: string
  zoneId: string | null
  zoneName: string | null
  available: number
}

// ===========================================================================
// Root — the Requisitions tab: the worklist + the uploaded list, or the importer
// ===========================================================================
export function Requisitions() {
  const [view, setView] = useState<'main' | 'new'>('main')
  return view === 'new'
    ? <NewRequisition onClose={() => setView('main')} />
    : <RequisitionsMain onNew={() => setView('new')} />
}

// ===========================================================================
// Main view
// ===========================================================================
function RequisitionsMain({ onNew }: { onNew: () => void }) {
  return (
    <div className="space-y-4">
      <button className="btn-secondary" onClick={onNew}>
        <Plus className="h-5 w-5" /> New requisition (upload PDF + CSV)
      </button>
      <PendingWorklist />
      <RequisitionList />
    </div>
  )
}

// ===========================================================================
// The "to issue" worklist — pending lines across open requisitions, filterable,
// with where each product sits, and a tick that issues the stock.
// ===========================================================================
interface PendingLine {
  id: string
  requisition_id: string
  item_id: string | null
  raw_product: string | null
  requested_qty: number
  issued_qty: number
  pr_no: string | null
  department: string | null
  work_order_no: string | null
  items: PickItem | null
  requisitions: { ref_no: string | null } | null
}

function PendingWorklist() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [dept, setDept] = useState('')
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [zone, setZone] = useState('')
  const [active, setActive] = useState<string | null>(null)

  const { data: lines } = useQuery({
    queryKey: ['requisition-pending'],
    queryFn: async (): Promise<PendingLine[]> => {
      const { data, error } = await supabase
        .from('requisition_lines')
        .select('id, requisition_id, item_id, raw_product, requested_qty, issued_qty, pr_no, department, work_order_no, items(id, code, name, uom, item_type, category, photo_url), requisitions!inner(ref_no, status)')
        .eq('requisitions.status', 'open')
        .limit(3000)
      if (error) throw error
      return ((data ?? []) as unknown as PendingLine[]).filter((l) => num(l.issued_qty) < num(l.requested_qty))
    },
  })

  const itemIds = useMemo(
    () => [...new Set((lines ?? []).map((l) => l.item_id).filter(Boolean))] as string[],
    [lines],
  )

  const { data: locByItem } = useQuery({
    queryKey: ['requisition-locations', itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('item_id, qty_on_hand, shelves(id, code, fixture_type, description, zones(id, code, name))')
        .in('item_id', itemIds)
        .gt('qty_on_hand', 0)
      if (error) throw error
      const map = new Map<string, LocationOpt[]>()
      for (const r of (data ?? []) as any[]) {
        if (!r.shelves) continue
        const opt: LocationOpt = {
          shelfId: r.shelves.id, code: r.shelves.code, label: locationLabel(r.shelves),
          zoneId: r.shelves.zones?.id ?? null, zoneName: r.shelves.zones?.name ?? null,
          available: num(r.qty_on_hand),
        }
        const list = map.get(r.item_id) ?? []
        list.push(opt)
        map.set(r.item_id, list)
      }
      for (const list of map.values()) list.sort((a, b) => b.available - a.available)
      return map
    },
  })

  const issue = useMutation({
    mutationFn: async ({ lineId, shelfId, qty }: { lineId: string; shelfId: string; qty: number }) => {
      const { error } = await supabase.rpc('issue_requisition_line', {
        p_line_id: lineId, p_shelf_id: shelfId, p_qty: qty,
      })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'issue.requisition_line', entityType: 'requisition_line', entityId: lineId,
        after: { qty },
      })
    },
    onSuccess: () => {
      setActive(null)
      for (const k of [['requisition-pending'], ['requisitions'], ['item-locator'], ['stock-overview'], ['stock-by-zone'], ['issuance-history']]) {
        void queryClient.invalidateQueries({ queryKey: k })
      }
    },
  })

  const opts = (key: (l: PendingLine) => string | null | undefined) =>
    [...new Set((lines ?? []).map((l) => key(l)).filter(Boolean))].sort() as string[]
  const departments = opts((l) => l.department)
  const types = opts((l) => l.items?.item_type)
  const categories = opts((l) => l.items?.category)
  const zones = useMemo(() => {
    const s = new Set<string>()
    for (const l of lines ?? []) for (const loc of locByItem?.get(l.item_id ?? '') ?? []) if (loc.zoneName) s.add(loc.zoneName)
    return [...s].sort()
  }, [lines, locByItem])

  const filtered = (lines ?? []).filter((l) => {
    if (dept && l.department !== dept) return false
    if (type && l.items?.item_type !== type) return false
    if (category && l.items?.category !== category) return false
    if (zone && !(locByItem?.get(l.item_id ?? '') ?? []).some((loc) => loc.zoneName === zone)) return false
    return true
  })

  const Sel = ({ value, onChange, all, list }: { value: string; onChange: (v: string) => void; all: string; list: string[] }) => (
    <select className="input-field h-10 min-w-32 flex-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {list.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">To issue{lines ? ` · ${filtered.length}` : ''}</p>
        {issue.isError && <p className="text-sm text-red-600">{(issue.error as Error).message}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Sel value={dept} onChange={setDept} all="All departments" list={departments} />
        <Sel value={type} onChange={setType} all="All types" list={types} />
        <Sel value={category} onChange={setCategory} all="All categories" list={categories} />
        <Sel value={zone} onChange={setZone} all="All zones" list={zones} />
      </div>

      {lines == null ? (
        <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-brand-500" />
      ) : filtered.length === 0 ? (
        <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-400">
          {(lines.length === 0) ? 'Nothing pending — upload a requisition to get started.' : 'No pending items match these filters.'}
        </p>
      ) : (
        <ul className="divide-y divide-ink-200/70 rounded-xl border border-ink-200">
          {filtered.map((l) => {
            const pending = num(l.requested_qty) - num(l.issued_qty)
            const locs = l.item_id ? (locByItem?.get(l.item_id) ?? []) : []
            const primary = locs[0]
            return (
              <li key={l.id} className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <ItemThumb path={l.items?.photo_url} name={l.items?.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.items?.name ?? l.raw_product ?? 'Unknown product'}</p>
                    <p className="truncate text-xs text-ink-400">
                      {l.items ? (
                        <>
                          {primary ? <><MapPin className="mr-0.5 inline h-3 w-3 text-brand-500" />{primary.zoneName ? `${primary.zoneName} · ` : ''}<span className="font-mono">{primary.code}</span>{locs.length > 1 ? ` +${locs.length - 1}` : ''}</> : <span className="text-amber-600">no stock on any shelf</span>}
                          {l.items.item_type ? ` · ${l.items.item_type}` : ''}{l.items.category ? ` · ${l.items.category}` : ''}
                        </>
                      ) : <span className="text-amber-600">not matched to a product</span>}
                    </p>
                    <p className="text-xs text-ink-400">
                      {l.department ? `${l.department} · ` : ''}{l.work_order_no ? `WO ${l.work_order_no} · ` : ''}{l.pr_no ? `PR ${l.pr_no}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-ink-800">{pending} {l.items?.uom ?? ''}</p>
                    <p className="text-[11px] text-ink-400">pending</p>
                  </div>
                  {l.item_id && locs.length > 0 && (
                    <button className="btn-primary shrink-0 px-3" onClick={() => setActive(active === l.id ? null : l.id)}>
                      Issue
                    </button>
                  )}
                </div>
                {active === l.id && primary && (
                  <IssueRow line={l} locs={locs} pending={pending}
                    pending_uom={l.items?.uom ?? ''} busy={issue.isPending}
                    onIssue={(shelfId, qty) => issue.mutate({ lineId: l.id, shelfId, qty })} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** The inline issue action for one pending line: pick shelf + qty, confirm. */
function IssueRow({ locs, pending, pending_uom, busy, onIssue }: {
  line: PendingLine; locs: LocationOpt[]; pending: number; pending_uom: string
  busy: boolean; onIssue: (shelfId: string, qty: number) => void
}) {
  const [shelfId, setShelfId] = useState(locs[0].shelfId)
  const loc = locs.find((l) => l.shelfId === shelfId) ?? locs[0]
  const [qty, setQty] = useState(String(Math.min(pending, loc.available)))
  const amt = num(qty)
  const over = amt > loc.available
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-cream px-3 py-2">
      <div className="min-w-40 flex-1">
        <label className="label-text">From location</label>
        <select className="input-field h-11" value={shelfId} onChange={(e) => setShelfId(e.target.value)}>
          {locs.map((l) => (
            <option key={l.shelfId} value={l.shelfId}>
              {l.zoneName ? `${l.zoneName} · ` : ''}{l.code} — {l.available} {pending_uom} avail
            </option>
          ))}
        </select>
      </div>
      <div className="w-28">
        <label className="label-text">Qty</label>
        <input type="number" inputMode="decimal" min="0.01" step="any"
          className={`input-field h-11 text-right ${over ? 'border-red-400' : ''}`}
          value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={busy || amt <= 0 || over} onClick={() => onIssue(shelfId, amt)}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        Issue
      </button>
      {over && <p className="w-full text-xs text-red-600">Only {loc.available} {pending_uom} on that location.</p>}
    </div>
  )
}

// ===========================================================================
// Uploaded requisitions — view the PDF, progress, export, complete.
// ===========================================================================
interface ReqRow {
  id: string
  ref_no: string | null
  pdf_url: string | null
  status: 'open' | 'completed'
  created_at: string
  requisition_lines: { requested_qty: number; issued_qty: number }[]
}

function RequisitionList() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: reqs } = useQuery({
    queryKey: ['requisitions'],
    queryFn: async (): Promise<ReqRow[]> => {
      const { data, error } = await supabase
        .from('requisitions')
        .select('id, ref_no, pdf_url, status, created_at, requisition_lines(requested_qty, issued_qty)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as ReqRow[]
    },
  })

  const complete = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'open' | 'completed' }) => {
      const { error } = await supabase.from('requisitions')
        .update(status === 'completed'
          ? { status, completed_by: profile!.id, completed_at: new Date().toISOString() }
          : { status, completed_by: null, completed_at: null })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requisitions'] })
      void queryClient.invalidateQueries({ queryKey: ['requisition-pending'] })
    },
  })

  const openPdf = async (path: string) => {
    const url = await signedPhotoUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
  }

  const exportIssued = async (id: string, ref: string | null) => {
    const { data } = await supabase
      .from('requisition_lines')
      .select('pr_no, work_order_no, department, requested_qty, issued_qty, raw_product, items(code, name, uom)')
      .eq('requisition_id', id)
    const rows: string[][] = [['pr_no', 'work_order', 'department', 'item_code', 'product', 'requested', 'issued', 'pending', 'uom']]
    for (const l of (data ?? []) as any[]) {
      rows.push([
        l.pr_no ?? '', l.work_order_no ?? '', l.department ?? '',
        l.items?.code ?? '', l.items?.name ?? l.raw_product ?? '',
        String(num(l.requested_qty)), String(num(l.issued_qty)),
        String(num(l.requested_qty) - num(l.issued_qty)), l.items?.uom ?? '',
      ])
    }
    downloadCsv(rows, `requisition-${(ref ?? id).replace(/[^\w.-]+/g, '_')}.csv`)
  }

  if (reqs == null) return <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-brand-500" />
  if (reqs.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Uploaded requisitions</h2>
      {reqs.map((r) => {
        const total = r.requisition_lines.length
        const done = r.requisition_lines.filter((l) => num(l.issued_qty) >= num(l.requested_qty)).length
        return (
          <div key={r.id} className="card flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.ref_no || 'Requisition'}
                {r.status === 'completed' && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">completed</span>}
              </p>
              <p className="text-xs text-ink-400">
                {done} of {total} lines issued · {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
            {r.pdf_url && (
              <button className="btn-secondary" onClick={() => void openPdf(r.pdf_url!)}>
                <FileText className="h-5 w-5" /> View PDF
              </button>
            )}
            <button className="btn-secondary" onClick={() => void exportIssued(r.id, r.ref_no)}>
              <Download className="h-5 w-5" /> Export
            </button>
            <button className="btn-secondary" disabled={complete.isPending}
              onClick={() => complete.mutate({ id: r.id, status: r.status === 'open' ? 'completed' : 'open' })}>
              {r.status === 'open' ? 'Mark complete' : 'Reopen'}
            </button>
          </div>
        )
      })}
    </section>
  )
}

// ===========================================================================
// New requisition — upload the PDF + CSV, match products, fix the rest, save.
// ===========================================================================
interface ImportLine {
  raw_product: string
  requested_qty: number
  pr_no: string | null
  department: string | null
  work_order_no: string | null
  item: PickItem | null
}

function NewRequisition({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [refName, setRefName] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [importLines, setImportLines] = useState<ImportLine[] | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCsv = async (file: File) => {
    setParsing(true)
    setError(null)
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) throw new Error('CSV looks empty (need a header row plus data).')
      const h = rows[0]
      const cProd = findColumn(h, ['product', 'productname', 'item', 'itemname', 'particulars', 'particular', 'material', 'materialname', 'description'])
      const cQty = findColumn(h, ['requestedqty', 'pendingqty', 'quantity', 'qty', 'reqqty', 'requiredqty'])
      const cPr = findColumn(h, ['requisitionno', 'requisitionnumber', 'prno', 'prnumber', 'requisition'])
      const cWo = findColumn(h, ['workorder', 'workorderno', 'wono', 'wo'])
      const cDept = findColumn(h, ['requestingdepartment', 'requesteddepartment', 'department', 'dept'])
      if (cProd === -1 || cQty === -1) {
        throw new Error(`Need a Product and a Requested Qty column. Headers seen: ${h.join(', ')}`)
      }
      const parsed = rows.slice(1).map((r) => ({
        raw_product: (r[cProd] ?? '').trim(),
        requested_qty: num((r[cQty] ?? '').replace(/[^0-9.\-]/g, '')),
        pr_no: cPr !== -1 ? (r[cPr] ?? '').trim() || null : null,
        department: cDept !== -1 ? (r[cDept] ?? '').trim() || null : null,
        work_order_no: cWo !== -1 ? (r[cWo] ?? '').trim() || null : null,
      })).filter((l) => l.raw_product && l.requested_qty > 0)
      if (parsed.length === 0) throw new Error('No usable rows (each needs a product and a quantity > 0).')

      // Match against the whole item master (paged), by code then normalized name.
      const master: PickItem[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('items').select('id, code, name, uom, item_type, category, photo_url')
          .is('deleted_at', null).eq('status', 'active').order('code').range(from, from + 999)
        if (error) throw error
        master.push(...((data ?? []) as PickItem[]))
        if (!data || data.length < 1000) break
      }
      const byCode = new Map(master.map((i) => [i.code.toLowerCase().trim(), i]))
      const byName = new Map(master.map((i) => [normalizeName(i.name), i]))
      const matched: ImportLine[] = parsed.map((l) => ({
        ...l,
        item: byCode.get(l.raw_product.toLowerCase().trim()) ?? byName.get(normalizeName(l.raw_product)) ?? null,
      }))
      setImportLines(matched)
      if (!refName) setRefName(matched[0]?.pr_no ? `PR batch — ${new Date().toLocaleDateString()}` : `Requisition — ${new Date().toLocaleDateString()}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setParsing(false)
    }
  }

  const matchedCount = (importLines ?? []).filter((l) => l.item).length

  const save = useMutation({
    mutationFn: async () => {
      if (!importLines || importLines.length === 0) throw new Error('Import a CSV first.')
      const pdf_url = pdf ? await uploadFile(pdf, profile!.tenant_id, 'requisitions') : null
      const { data: req, error: reqErr } = await supabase
        .from('requisitions')
        .insert({ tenant_id: profile!.tenant_id, ref_no: refName.trim() || null, pdf_url, created_by: profile!.id })
        .select('id').single()
      if (reqErr) throw new Error(reqErr.message)
      const payload = importLines.map((l) => ({
        tenant_id: profile!.tenant_id, requisition_id: req.id,
        item_id: l.item?.id ?? null, raw_product: l.raw_product, requested_qty: l.requested_qty,
        pr_no: l.pr_no, department: l.department, work_order_no: l.work_order_no,
      }))
      const { error: linesErr } = await supabase.from('requisition_lines').insert(payload)
      if (linesErr) throw new Error(linesErr.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'create.requisition', entityType: 'requisition', entityId: req.id,
        after: { ref: refName.trim(), lines: payload.length, matched: matchedCount },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requisitions'] })
      void queryClient.invalidateQueries({ queryKey: ['requisition-pending'] })
      onClose()
    },
  })

  return (
    <div className="card space-y-4">
      <button className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600" onClick={onClose}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div>
        <label className="label-text">Requisition name / reference</label>
        <input className="input-field" value={refName} onChange={(e) => setRefName(e.target.value)}
          placeholder="e.g. PR batch 04-Aug" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label-text">Requisition PDF (the reference)</label>
          <label className="flex min-h-tap cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink-300 px-3 py-2 text-sm hover:bg-cream">
            <FileText className="h-5 w-5 text-brand-500" />
            <span className="min-w-0 truncate">{pdf ? pdf.name : 'Choose the PDF…'}</span>
            <input type="file" accept="application/pdf,.pdf" className="hidden"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div>
          <label className="label-text">Requisition lines (CSV from your ERP)</label>
          <label className="flex min-h-tap cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink-300 px-3 py-2 text-sm hover:bg-cream">
            <Upload className="h-5 w-5 text-brand-500" />
            <span className="min-w-0 truncate">{importLines ? `${importLines.length} lines loaded` : 'Choose the CSV…'}</span>
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleCsv(f); e.target.value = '' }} />
          </label>
        </div>
      </div>

      {parsing && <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> Matching products…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {importLines && (
        <div className="space-y-2">
          <p className="text-sm text-ink-500">
            <b>{matchedCount}</b> of {importLines.length} matched to your product master
            {matchedCount < importLines.length && <> · <b className="text-amber-700">{importLines.length - matchedCount}</b> need a manual pick below</>}.
          </p>
          <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
            {importLines.map((l, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                <ItemThumb path={l.item?.photo_url} name={l.item?.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.item?.name ?? l.raw_product}</p>
                  <p className="text-xs text-ink-400">
                    req {l.requested_qty}{l.pr_no ? ` · PR ${l.pr_no}` : ''}{l.work_order_no ? ` · WO ${l.work_order_no}` : ''}
                  </p>
                </div>
                {l.item ? (
                  <span className="shrink-0 text-xs font-medium text-green-700">matched</span>
                ) : (
                  <ProductSearch onPick={(it) => setImportLines(importLines.map((x, idx) => idx === i ? { ...x, item: it } : x))} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn-primary" disabled={save.isPending || !importLines || importLines.length === 0}
          onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          Save requisition{importLines ? ` (${importLines.length} lines)` : ''}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
      {save.isError && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
    </div>
  )
}

/** Compact product picker for mapping an unmatched requisition line. */
function ProductSearch({ onPick }: { onPick: (item: PickItem) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { data: matches, isFetching } = useQuery({
    queryKey: ['req-item-search', q.trim()],
    enabled: open && q.trim().length >= 2,
    queryFn: async () => {
      const s = q.trim()
      const { data } = await supabase
        .from('items').select('id, code, name, uom, item_type, category, photo_url')
        .or(`name.ilike.%${s}%,code.ilike.%${s}%`)
        .eq('status', 'active').is('deleted_at', null).limit(8)
      return (data ?? []) as PickItem[]
    },
  })

  if (!open) {
    return <button className="btn-secondary shrink-0 px-3 py-1 text-xs" onClick={() => setOpen(true)}>Match…</button>
  }
  return (
    <div className="relative shrink-0">
      <div className="relative w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
        <input autoFocus className="input-field h-9 pl-8 text-sm" placeholder="search product…"
          value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(() => setOpen(false), 200)} />
        {isFetching && <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />}
      </div>
      {q.trim().length >= 2 && (matches ?? []).length > 0 && (
        <ul className="absolute right-0 z-10 mt-1 max-h-56 w-72 overflow-y-auto rounded-xl border border-ink-200 bg-white shadow-card">
          {(matches ?? []).map((m) => (
            <li key={m.id}>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cream"
                onMouseDown={() => { onPick(m); setOpen(false) }}>
                <ItemThumb path={m.photo_url} name={m.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block text-xs text-ink-400">{m.code}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
