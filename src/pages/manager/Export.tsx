import { useState } from 'react'
import { Download, FileBarChart, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../stores/auth'
import { logActivity } from '../../lib/audit'

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
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, qty_on_hold, last_movement_at, items(code, name, category, uom), shelves(code, zones(code, name))')
        .or('qty_on_hand.gt.0,qty_on_hold.gt.0')
      if (error) throw error
      const rows: string[][] = [
        ['item_code', 'item_name', 'category', 'uom', 'zone', 'shelf', 'qty_on_hand', 'qty_on_hold', 'last_movement'],
      ]
      for (const b of (data ?? []) as any[]) {
        rows.push([
          b.items.code, b.items.name, b.items.category ?? '', b.items.uom,
          b.shelves?.zones?.code ?? '', b.shelves?.code ?? '',
          String(b.qty_on_hand), String(b.qty_on_hold), b.last_movement_at,
        ])
      }
      downloadCsv(rows, `aksure-stock-${new Date().toISOString().slice(0, 10)}.csv`)
      await log('export.stock_csv')
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
      const { data, error } = await supabase
        .from('items')
        .select('code, name, category, uom, stock_balances(qty_on_hand, qty_on_hold)')
        .is('deleted_at', null)
        .eq('status', 'active')
      if (error) throw error
      const rows: string[][] = [['item_code', 'item_name', 'category', 'uom', 'total_qty', 'qty_on_hold']]
      for (const it of (data ?? []) as any[]) {
        const onHand = (it.stock_balances ?? []).reduce((s: number, b: any) => s + b.qty_on_hand, 0)
        const onHold = (it.stock_balances ?? []).reduce((s: number, b: any) => s + b.qty_on_hold, 0)
        rows.push([it.code, it.name, it.category ?? '', it.uom, String(onHand), String(onHold)])
      }
      downloadCsv(rows, `aksure-item-totals-${new Date().toISOString().slice(0, 10)}.csv`)
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
        <FileBarChart className="h-6 w-6 text-tan-dark" />
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
          <p className="font-semibold">Item totals</p>
          <p className="text-sm text-ink-400">One row per item with warehouse-wide totals — the ERP reconciliation file.</p>
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
