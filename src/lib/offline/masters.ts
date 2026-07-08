import { supabase } from '../supabase'
import { idb } from './db'

export interface CachedShelf {
  id: string
  code: string
  zone_code: string
  zone_name: string
}

export interface CachedItem {
  id: string
  code: string
  barcode: string | null
  name: string
  uom: string
}

/**
 * Cache shelves + items locally so floor screens can validate scans while
 * offline (PRD 7.5). Refreshed on every app start when online.
 */
export async function refreshMasterCache(): Promise<void> {
  const [shelves, items] = await Promise.all([
    supabase.from('shelves').select('id, code, zones(code, name)').is('deleted_at', null),
    supabase.from('items').select('id, code, barcode, name, uom').is('deleted_at', null).eq('status', 'active'),
  ])
  if (shelves.data) {
    await idb.kvSet(
      'shelves',
      (shelves.data as any[]).map((s) => ({
        id: s.id,
        code: s.code,
        zone_code: s.zones?.code ?? '',
        zone_name: s.zones?.name ?? '',
      })),
    )
  }
  if (items.data) {
    await idb.kvSet('items', items.data)
  }
  await idb.kvSet('masters_cached_at', new Date().toISOString())
}

export async function findShelfOffline(code: string): Promise<CachedShelf | null> {
  const shelves = (await idb.kvGet<CachedShelf[]>('shelves')) ?? []
  return shelves.find((s) => s.code.toLowerCase() === code.toLowerCase()) ?? null
}

export async function findItemOffline(scan: string): Promise<CachedItem | null> {
  const items = (await idb.kvGet<CachedItem[]>('items')) ?? []
  return items.find((i) => i.code === scan || i.barcode === scan) ?? null
}
