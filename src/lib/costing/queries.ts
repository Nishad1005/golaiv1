import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import type {
  CostingCategory, CostingLine, CostingRateEntry, CostingRateTable, CostingSheet,
} from './types'

/** The company's category blocks, in sheet order, each with its own fields. */
export function useCostingCategories() {
  return useQuery({
    queryKey: ['costing-categories'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CostingCategory[]> => {
      const { data, error } = await supabase
        .from('costing_categories')
        .select('id, key, name, sort_order, formula_kind, config, is_active, costing_category_fields(id, key, label, data_type, unit, sort_order, is_input, required)')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as CostingCategory[]
      // Fields come back unordered from the join.
      for (const c of rows) {
        c.costing_category_fields.sort((a, b) => a.sort_order - b.sort_order)
      }
      return rows
    },
  })
}

export function useCostingSheets() {
  return useQuery({
    queryKey: ['costing-sheets'],
    queryFn: async (): Promise<CostingSheet[]> => {
      const { data, error } = await supabase
        .from('costing_sheets')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as CostingSheet[]
    },
  })
}

export function useCostingSheet(id: string | undefined) {
  return useQuery({
    queryKey: ['costing-sheet', id],
    enabled: !!id,
    queryFn: async (): Promise<{ sheet: CostingSheet; lines: CostingLine[] }> => {
      const [sheetRes, linesRes] = await Promise.all([
        supabase.from('costing_sheets').select('*').eq('id', id!).single(),
        supabase.from('costing_lines').select('*').eq('sheet_id', id!).order('sort_order'),
      ])
      if (sheetRes.error) throw new Error(sheetRes.error.message)
      if (linesRes.error) throw new Error(linesRes.error.message)
      return {
        sheet: sheetRes.data as CostingSheet,
        lines: (linesRes.data ?? []) as CostingLine[],
      }
    },
  })
}

/**
 * Rate tables with today's live rate per lookup key.
 *
 * This is the whole point of the module: a rate lives once here, so changing it
 * reprices every sheet instead of needing twenty spreadsheet edits. Entries with
 * a future `effective_from` or an expired `effective_to` are ignored, and the
 * most recent still-valid entry wins.
 */
export function useCostingRates() {
  return useQuery({
    queryKey: ['costing-rates'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [tablesRes, entriesRes] = await Promise.all([
        supabase.from('costing_rate_tables').select('id, key, name, note').order('name'),
        supabase.from('costing_rate_entries').select('*').order('effective_from', { ascending: false }),
      ])
      const tables = (tablesRes.data ?? []) as CostingRateTable[]
      const entries = (entriesRes.data ?? []) as CostingRateEntry[]
      const today = new Date().toISOString().slice(0, 10)

      // tableKey → lookupKey → rate (first match wins: already newest-first)
      const live: Record<string, Record<string, number>> = {}
      const byId = new Map(tables.map((t) => [t.id, t.key]))
      for (const e of entries) {
        if (e.effective_from > today) continue
        if (e.effective_to && e.effective_to < today) continue
        const tKey = byId.get(e.rate_table_id)
        if (!tKey) continue
        live[tKey] ??= {}
        live[tKey][e.lookup_key] ??= e.rate
      }
      return { tables, entries, live }
    },
  })
}

/** Products, for linking a costing line to the real item master. */
export function useItemSearch(term: string) {
  const q = term.trim()
  return useQuery({
    queryKey: ['costing-item-search', q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('items')
        .select('id, code, name, uom')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(8)
      return (data ?? []) as { id: string; code: string; name: string; uom: string }[]
    },
  })
}
