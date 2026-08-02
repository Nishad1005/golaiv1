import { useState } from 'react'
import { Download, FileBarChart, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'
import { num, sumQty } from '../../lib/qty'

/**
 * Page through every row — an ERP reconciliation file must be complete, and a
 * single unbounded request can be truncated by the server's row cap.
 */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const page = 1000
  const all: T[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < page) break
  }
  return all
}

function downloadCsv(rows: string[][], fileName: string) {
  const csv = rows
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join(','))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
}

/**
 * ERP-friendly CSV export (PRD 2.1): quantity data only — no values, units
 * only — for reconciliation against Tally/SAP/Zoho.
 */
export function Export() {
  const { profile } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const log = (action: string) =>
    logActivity({
      tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
      action, entityType: 'export',
    })

  const exportStock = async () => {
    setBusy('stock')
    setError(null)
    try {
      const data = await fetchAll<any>((from, to) =>
        supabase
          .from('stock_balances')
          .select('qty_on_hand, qty_on_hold, last_movement_at, items(code, name, category, uom), shelves(code, zones(code, name))')
          .or('qty_on_hand.gt.0,qty_on_hold.gt.0')
          .order('item_id')
          .range(from, to),
      )
      const rows: string[][] = [
        ['item_code', 'item_name', 'category', 'uom', 'zone', 'shelf', 'qty_on_hand', 'qty_on_hold', 'last_movement'],
      ]
      for (const b of data) {
        rows.push([
          b.items.code, b.items.name, b.items.category ?? '', b.items.uom,
          b.shelves?.zones?.code ?? '', b.shelves?.code ?? '',
          String(b.qty_on_hand), String(b.qty_on_hold), b.last_movement_at,
        ])
      }
      downloadCsv(rows, `golai-stock-${new Date().toISOString().slice(0, 10)}.csv`)
      await log('export.stock_csv')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Only the items actually recorded in Golai (those with a stock balance),
  // one row each — not the whole master. Sourced from stock_balances, so an item
  // located but not yet counted still appears (total 0).
  const exportCurrentStock = async () => {
    setBusy('current')
    setError(null)
    try {
      const data = await fetchAll<any>((from, to) =>
        supabase
          .from('stock_balances')
          .select('item_id, qty_on_hand, qty_on_hold, items(code, name, category, uom, status, deleted_at)')
          .order('item_id')
          .range(from, to),
      )
      const byItem = new Map<string, { item: any; onHand: number; onHold: number; locations: number }>()
      for (const b of data) {
        // Skip a stray balance whose item is gone or no longer active.
        if (!b.items || b.items.deleted_at || b.items.status !== 'active') continue
        const g = byItem.get(b.item_id) ?? { item: b.items, onHand: 0, onHold: 0, locations: 0 }
        g.onHand += num(b.qty_on_hand)
        g.onHold += num(b.qty_on_hold)
        g.locations += 1
        byItem.set(b.item_id, g)
      }
      const rows: string[][] = [['item_code', 'item_name', 'category', 'uom', 'total_qty', 'qty_on_hold', 'locations']]
      for (const g of [...byItem.values()].sort((a, b) => a.item.code.localeCompare(b.item.code))) {
        rows.push([g.item.code, g.item.name, g.item.category ?? '', g.item.uom,
          String(g.onHand), String(g.onHold), String(g.locations)])
      }
      downloadCsv(rows, `golai-current-stock-${new Date().toISOString().slice(0, 10)}.csv`)
      await log('export.current_stock_csv')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const exportItemTotals = async () => {
    setBusy('totals')
    setError(null)
    try {
      const data = await fetchAll<any>((from, to) =>
        supabase
          .from('items')
          .select('code, name, category, uom, stock_balances(qty_on_hand, qty_on_hold)')
          .is('deleted_at', null)
          .eq('status', 'active')
          .order('code')
          .range(from, to),
      )
      const rows: string[][] = [['item_code', 'item_name', 'category', 'uom', 'total_qty', 'qty_on_hold']]
      for (const it of data) {
        const onHand = sumQty(it.stock_balances ?? [], (b: any) => b.qty_on_hand)
        const onHold = sumQty(it.stock_balances ?? [], (b: any) => b.qty_on_hold)
        rows.push([it.code, it.name, it.category ?? '', it.uom, String(onHand), String(onHold)])
      }
      downloadCsv(rows, `golai-item-totals-${new Date().toISOString().slice(0, 10)}.csv`)
      await log('export.item_totals_csv')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileBarChart className="h-6 w-6 text-brand-500" />
        <h1 className="text-xl font-bold">ERP Export</h1>
      </div>
      <p className="text-sm text-ink-400">
        Quantity data only — units, never values. Import these into Tally / SAP / Zoho for
        reconciliation.
      </p>

      <div className="card flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Stock by shelf</p>
          <p className="text-sm text-ink-400">Every item on every shelf with on-hand and hold quantities.</p>
        </div>
        <button className="btn-primary" onClick={() => void exportStock()} disabled={busy !== null}>
          {busy === 'stock' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          Download CSV
        </button>
      </div>

      <div className="card flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Current stock</p>
          <p className="text-sm text-ink-400">One row per item recorded in Golai (placed somewhere), with its total — excludes untouched master items.</p>
        </div>
        <button className="btn-primary" onClick={() => void exportCurrentStock()} disabled={busy !== null}>
          {busy === 'current' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          Download CSV
        </button>
      </div>

      <div className="card flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Item totals</p>
          <p className="text-sm text-ink-400">One row per item across the whole master — the ERP reconciliation file.</p>
        </div>
        <button className="btn-primary" onClick={() => void exportItemTotals()} disabled={busy !== null}>
          {busy === 'totals' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          Download CSV
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
