import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Boxes, Loader2, PackageX, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'

interface Row {
  id: string
  code: string
  name: string
  item_type: string | null
  category: string | null
  uom: string
  on_hand: number | string | null
}

const LIST_LIMIT = 100

/**
 * A focused list of items by stock status, opened from the dashboard tiles —
 * "Items in stock" (on_hand > 0) or "Nothing on shelf" (on_hand = 0, includes
 * never-located). Just the relevant items, with Type / Category / search filters,
 * so it never shows the whole master. Reads the item_stock view (migration 0045).
 */
export function ItemStockList() {
  const params = useParams<{ status: string }>()
  const status: 'in' | 'off' = params.status === 'off' ? 'off' : 'in'

  const [search, setSearch] = useState('')
  const [typeF, setTypeF] = useState('')
  const [catF, setCatF] = useState('')

  // Distinct Type / Category options for this subset. Paginated in 1000s so the
  // dropdowns are complete even past the row cap (same pattern as filled-shelves).
  const { data: options } = useQuery({
    queryKey: ['stock-list-options', status],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const types = new Set<string>()
      const cats = new Set<string>()
      for (let from = 0; ; from += 1000) {
        let q = supabase.from('item_stock').select('item_type, category')
          .is('deleted_at', null).order('id').range(from, from + 999)
        q = status === 'in' ? q.gt('on_hand', 0) : q.eq('on_hand', 0)
        const { data, error } = await q
        if (error) throw error
        const batch = (data ?? []) as { item_type: string | null; category: string | null }[]
        for (const r of batch) {
          if (r.item_type) types.add(r.item_type)
          if (r.category) cats.add(r.category)
        }
        if (batch.length < 1000) break
      }
      return { types: [...types].sort(), categories: [...cats].sort() }
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['stock-list', status, search, typeF, catF],
    queryFn: async () => {
      let q = supabase.from('item_stock')
        .select('id, code, name, item_type, category, uom, on_hand', { count: 'exact' })
        .is('deleted_at', null).order('name').limit(LIST_LIMIT)
      q = status === 'in' ? q.gt('on_hand', 0) : q.eq('on_hand', 0)
      if (typeF) q = q.eq('item_type', typeF)
      if (catF) q = q.eq('category', catF)
      if (search.trim()) {
        const s = search.trim()
        q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,barcode.eq.${s}`)
      }
      const { data, error, count } = await q
      if (error) throw error
      return { rows: (data ?? []) as Row[], count: count ?? 0 }
    },
  })

  const rows = data?.rows ?? []
  const total = data?.count ?? 0
  const hasFilters = !!(search.trim() || typeF || catF)

  return (
    <div className="space-y-4">
      <PageHeader
        title={status === 'in' ? 'Items in stock' : 'Nothing on shelf'}
        subtitle={status === 'in'
          ? 'Products located on a shelf right now.'
          : 'Products with no stock located yet — includes never-located items.'}
        actions={<Link to="/" className="btn-secondary">Back to dashboard</Link>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input className="input-field pl-12" placeholder="Search name, code or barcode…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input-field w-auto" value={typeF} onChange={(e) => setTypeF(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {(options?.types ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input-field w-auto" value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {(options?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {hasFilters && (
          <button className="inline-flex min-h-tap items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink-500 hover:bg-ink-100"
            onClick={() => { setSearch(''); setTypeF(''); setCatF('') }}>
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      <p className="text-sm text-ink-400 tabular-nums">
        {total} item{total === 1 ? '' : 's'}{hasFilters ? ' match' : ''}
        {total > LIST_LIMIT ? ` · showing first ${LIST_LIMIT} — narrow with filters` : ''}
      </p>

      {isLoading ? (
        <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-brand-500" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={status === 'in' ? Boxes : PackageX}
          title={hasFilters
            ? 'Nothing matches those filters'
            : status === 'in' ? 'Nothing in stock yet' : 'Everything is on a shelf'}
          detail={hasFilters
            ? 'Try a different search, type or category.'
            : status === 'in'
              ? 'Once stock is received and put away, it shows here.'
              : 'No products are missing from the shelves.'}
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tan/30 text-left text-ink-400">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">In stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tan/20">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono">{r.code}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/item/${r.id}`} className="hover:text-brand-600 hover:underline"
                      title="Stock card — what came in, what went out, what's left">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-400">{r.item_type ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-400">{r.category ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(r.on_hand ?? 0) > 0 ? (
                      <span className="font-medium text-ink-900">
                        {Number(r.on_hand)} <span className="text-xs font-normal text-ink-400">{r.uom}</span>
                      </span>
                    ) : (
                      <span className="text-ink-300">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
