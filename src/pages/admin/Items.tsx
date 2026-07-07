import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload, Loader2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { resolveItemCode } from '../../lib/itemCode'
import { parseCsv, findColumn } from '../../lib/csv'
import type { Item } from '../../lib/types'

interface CsvPreview {
  total: number
  withCode: number
  needCode: number
  rows: {
    code: string | null
    barcode: string | null
    name: string
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

  const { data: items, isLoading } = useQuery({
    queryKey: ['items', search],
    queryFn: async () => {
      let q = supabase.from('items').select('*').is('deleted_at', null).order('name').limit(100)
      if (search.trim()) {
        q = q.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return data as Item[]
    },
  })

  // --- Manual create ---------------------------------------------------------
  // Item code policy: if the client provides a code, it is stored VERBATIM.
  // A new ITM-NNNNN code is allocated ONLY when the code field is left empty.
  const [form, setForm] = useState({ code: '', barcode: '', name: '', category: '', uom: 'pcs' })

  const createItem = useMutation({
    mutationFn: async () => {
      const code = await resolveItemCode(form.code)
      const { data, error } = await supabase
        .from('items')
        .insert({
          tenant_id: profile!.tenant_id,
          code,
          barcode: form.barcode.trim() || null,
          name: form.name.trim(),
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
      setForm({ code: '', barcode: '', name: '', category: '', uom: 'pcs' })
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
    const codeCol = findColumn(headers, ['itemcode', 'code', 'sku'])
    const barcodeCol = findColumn(headers, ['barcode', 'ean', 'upc'])
    const nameCol = findColumn(headers, ['itemname', 'name', 'description', 'item'])
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
          barcode: row.barcode,
          name: row.name,
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
            <li>{preview.needCode} have no code — Aksure will auto-assign ITM- codes</li>
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

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input
          className="input-field pl-12"
          placeholder="Search items by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-tan-dark" />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tan/30 text-left text-ink-400">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tan/20">
              {(items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-mono">{item.code}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-ink-400">{item.category ?? '—'}</td>
                  <td className="px-4 py-3">{item.uom}</td>
                </tr>
              ))}
              {(items ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-400">
                    No items yet. Import the client's CSV or create items manually — existing codes
                    are always kept unchanged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
