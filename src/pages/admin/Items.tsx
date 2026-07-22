import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, FileDown, Pencil, Plus, Printer, Upload, Loader2, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { resolveItemCode } from '../../lib/itemCode'
import { parseCsv, findColumn, downloadItemTemplate } from '../../lib/csv'
import { ItemLabelDialog } from '../../components/ItemLabelDialog'
import type { Item } from '../../lib/types'

interface CsvPreview {
  total: number
  withCode: number
  needCode: number
  rows: {
    code: string | null
    barcode: string | null
    name: string
    item_type: string | null
    category: string | null
    sub_category: string | null
    uom: string
  }[]
}

export function Items() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  // --- Label printing --------------------------------------------------------
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showPrint, setShowPrint] = useState(false)

  const [onlyAuto, setOnlyAuto] = useState(false)
  const [editingCode, setEditingCode] = useState<{ id: string; value: string } | null>(null)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const { data: items, isLoading } = useQuery({
    queryKey: ['items', search, onlyAuto],
    queryFn: async () => {
      let q = supabase.from('items').select('*').is('deleted_at', null).order('name').limit(100)
      if (onlyAuto) q = q.eq('code_auto_assigned', true)
      if (search.trim()) {
        q = q.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%,item_type.ilike.%${search.trim()}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return data as Item[]
    },
  })

  // Replace an auto-assigned code with the client's real one (clears the flag).
  const saveCode = useMutation({
    mutationFn: async ({ id, code }: { id: string; code: string }) => {
      const trimmed = code.trim()
      if (!trimmed) throw new Error('Code cannot be empty')
      const { error } = await supabase
        .from('items')
        .update({ code: trimmed, code_auto_assigned: false })
        .eq('id', id)
      if (error) {
        throw new Error(error.code === '23505' ? `Code "${trimmed}" is already used by another item.` : error.message)
      }
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'update.item_code', entityType: 'item', entityId: id, after: { code: trimmed },
      })
    },
    onSuccess: () => {
      setEditingCode(null)
      void queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  // --- Manual create ---------------------------------------------------------
  // Item code policy: if the client provides a code, it is stored VERBATIM.
  // A new ITM-NNNNN code is allocated ONLY when the code field is left empty.
  const [form, setForm] = useState({ code: '', barcode: '', name: '', item_type: '', category: '', uom: 'pcs' })

  const createItem = useMutation({
    mutationFn: async () => {
      const code = await resolveItemCode(form.code)
      const { data, error } = await supabase
        .from('items')
        .insert({
          tenant_id: profile!.tenant_id,
          code,
          code_auto_assigned: !form.code.trim(),
          barcode: form.barcode.trim() || null,
          name: form.name.trim(),
          item_type: form.item_type.trim() || null,
          category: form.category.trim() || null,
          uom: form.uom.trim() || 'pcs',
        })
        .select()
        .single()
      if (error) throw error
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'create.item',
        entityType: 'item',
        entityId: data.id,
        after: { code, name: form.name.trim(), auto_assigned: !form.code.trim() },
      })
      return data as Item
    },
    onSuccess: () => {
      setForm({ code: '', barcode: '', name: '', item_type: '', category: '', uom: 'pcs' })
      setShowForm(false)
      void queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  // --- CSV import ------------------------------------------------------------
  const handleFile = async (file: File) => {
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      setImportStatus('CSV appears empty (need a header row plus data).')
      return
    }
    const headers = rows[0]
    const codeCol = findColumn(headers, ['itemcode', 'productcode', 'code', 'sku'])
    const barcodeCol = findColumn(headers, ['barcode', 'ean', 'upc'])
    const nameCol = findColumn(headers, ['itemname', 'name', 'particular', 'particulars', 'description', 'item'])
    const typeCol = findColumn(headers, ['definition', 'type', 'itemtype', 'producttype'])
    const catCol = findColumn(headers, ['category', 'group'])
    const subCatCol = findColumn(headers, ['subcategory', 'subgroup'])
    const uomCol = findColumn(headers, ['uom', 'unit', 'units'])

    if (nameCol === -1) {
      setImportStatus(`No item-name column found. Headers seen: ${headers.join(', ')}`)
      return
    }

    const dataRows = rows
      .slice(1)
      .map((r) => ({
        code: codeCol !== -1 && r[codeCol]?.trim() ? r[codeCol].trim() : null, // kept verbatim
        barcode: barcodeCol !== -1 && r[barcodeCol]?.trim() ? r[barcodeCol].trim() : null,
        name: r[nameCol]?.trim() ?? '',
        item_type: typeCol !== -1 && r[typeCol]?.trim() ? r[typeCol].trim() : null,
        category: catCol !== -1 && r[catCol]?.trim() ? r[catCol].trim() : null,
        sub_category: subCatCol !== -1 && r[subCatCol]?.trim() ? r[subCatCol].trim() : null,
        uom: uomCol !== -1 && r[uomCol]?.trim() ? r[uomCol].trim() : 'pcs',
      }))
      .filter((r) => r.name)

    setPreview({
      total: dataRows.length,
      withCode: dataRows.filter((r) => r.code).length,
      needCode: dataRows.filter((r) => !r.code).length,
      rows: dataRows,
    })
    setImportStatus(null)
  }

  const runImport = useMutation({
    mutationFn: async () => {
      if (!preview) return
      // Existing client codes go in verbatim; only no-code rows get ITM- codes.
      const prepared = []
      for (const row of preview.rows) {
        prepared.push({
          tenant_id: profile!.tenant_id,
          code: row.code ?? (await resolveItemCode(null)),
          code_auto_assigned: !row.code, // flag rows that had no client code
          barcode: row.barcode,
          name: row.name,
          item_type: row.item_type,
          category: row.category,
          sub_category: row.sub_category,
          uom: row.uom,
        })
      }
      const chunkSize = 500
      let inserted = 0
      for (let i = 0; i < prepared.length; i += chunkSize) {
        const chunk = prepared.slice(i, i + chunkSize)
        const { error, count } = await supabase
          .from('items')
          .upsert(chunk, { onConflict: 'tenant_id,code', ignoreDuplicates: true, count: 'exact' })
        if (error) throw error
        inserted += count ?? chunk.length
        setImportStatus(`Importing… ${Math.min(i + chunkSize, prepared.length)} / ${prepared.length}`)
      }
      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'import.items_csv',
        entityType: 'item',
        after: { total: preview.total, kept_client_codes: preview.withCode, auto_assigned: preview.needCode },
      })
      return inserted
    },
    onSuccess: (inserted) => {
      setImportStatus(`Import complete: ${inserted} items added (duplicates by code skipped).`)
      setPreview(null)
      void queryClient.invalidateQueries({ queryKey: ['items'] })
    },
    onError: (e) => setImportStatus(`Import failed: ${(e as Error).message}`),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Items</h1>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={downloadItemTemplate}
            title="Download a fill-in CSV with the exact columns the import expects"
          >
            <FileDown className="h-5 w-5" /> CSV template
          </button>
          <button className="btn-secondary" onClick={() => fileInput.current?.click()}>
            <Upload className="h-5 w-5" /> Import CSV
          </button>
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-5 w-5" /> New Item
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            e.target.value = ''
          }}
        />
      </div>

      {preview && (
        <div className="card space-y-3">
          <p className="font-semibold">CSV ready to import</p>
          <ul className="text-sm text-ink-500">
            <li>{preview.total} items found</li>
            <li>
              {preview.withCode} already have a code — <b>kept exactly as-is</b> (never renamed)
            </li>
            <li>{preview.needCode} have no code — Golai will auto-assign ITM- codes</li>
          </ul>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => runImport.mutate()} disabled={runImport.isPending}>
              {runImport.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
              Import {preview.total} items
            </button>
            <button className="btn-secondary" onClick={() => setPreview(null)} disabled={runImport.isPending}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {importStatus && <p className="text-sm text-ink-500">{importStatus}</p>}

      {showForm && (
        <form
          className="card grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            createItem.mutate()
          }}
        >
          <div>
            <label className="label-text">
              Item code <span className="font-normal text-ink-300">(leave blank to auto-assign)</span>
            </label>
            <input
              className="input-field"
              placeholder="Client's existing code, kept as-is"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label className="label-text">Barcode (if different from code)</label>
            <input
              className="input-field"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-text">Name</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label-text">Type / Definition</label>
            <input
              className="input-field"
              placeholder="Thread, Foam, Fabric…"
              value={form.item_type}
              onChange={(e) => setForm({ ...form, item_type: e.target.value })}
            />
          </div>
          <div>
            <label className="label-text">Category</label>
            <input
              className="input-field"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <div>
            <label className="label-text">Unit (qty only, never value)</label>
            <input
              className="input-field"
              value={form.uom}
              onChange={(e) => setForm({ ...form, uom: e.target.value })}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={createItem.isPending}>
              {createItem.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
              Create
            </button>
          </div>
          {createItem.isError && (
            <p className="text-sm text-red-600 sm:col-span-2">{(createItem.error as Error).message}</p>
          )}
        </form>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ink px-4 py-3 text-cream">
          <span className="font-medium">{selected.size} selected</span>
          <button className="ml-auto btn-secondary" onClick={() => setSelected(new Set())}>
            <X className="h-5 w-5" /> Clear
          </button>
          <button className="btn-primary" onClick={() => setShowPrint(true)}>
            <Printer className="h-5 w-5" /> Print labels
          </button>
        </div>
      )}

      {showPrint && (
        <ItemLabelDialog
          rows={(items ?? [])
            .filter((it) => selected.has(it.id))
            .map((it) => ({ code: it.code, name: it.name, uom: it.uom, category: it.category }))}
          source="admin_items"
          onClose={() => setShowPrint(false)}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input
            className="input-field pl-12"
            placeholder="Search items by name, code or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex min-h-tap cursor-pointer items-center gap-2 rounded-xl border-2 border-tan px-4 text-sm font-medium text-ink-600">
          <input type="checkbox" className="h-5 w-5" checked={onlyAuto} onChange={(e) => setOnlyAuto(e.target.checked)} />
          Only auto-assigned codes
        </label>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tan/30 text-left text-ink-400">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    aria-label="Select all"
                    checked={(items ?? []).length > 0 && (items ?? []).every((i) => selected.has(i.id))}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set((items ?? []).map((i) => i.id)) : new Set())
                    }
                  />
                </th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tan/20">
              {(items ?? []).map((item) => (
                <tr key={item.id} className={selected.has(item.id) ? 'bg-cream' : ''}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      aria-label={`Select ${item.name}`}
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {editingCode?.id === item.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="input-field h-9 w-40 font-mono"
                          value={editingCode.value}
                          autoFocus
                          onChange={(e) => setEditingCode({ id: item.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveCode.mutate({ id: item.id, code: editingCode.value })
                            if (e.key === 'Escape') setEditingCode(null)
                          }}
                        />
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50"
                          onClick={() => saveCode.mutate({ id: item.id, code: editingCode.value })}
                          disabled={saveCode.isPending}
                          aria-label="Save code"
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100"
                          onClick={() => setEditingCode(null)}
                          aria-label="Cancel"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{item.code}</span>
                        {item.code_auto_assigned && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            auto
                          </span>
                        )}
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-100 hover:text-ink-600"
                          onClick={() => setEditingCode({ id: item.id, value: item.code })}
                          title="Edit code"
                          aria-label={`Edit code for ${item.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/item/${item.id}`}
                      className="hover:text-brand-600 hover:underline"
                      title="Stock card — what came in, what went out, what's left"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-400">{item.item_type ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-400">{item.category ?? '—'}</td>
                  <td className="px-4 py-3">{item.uom}</td>
                </tr>
              ))}
              {(items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                    No items yet. Import the client's CSV or create items manually — existing codes
                    are always kept unchanged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {saveCode.isError && <p className="text-sm text-red-600">{(saveCode.error as Error).message}</p>}
    </div>
  )
}
