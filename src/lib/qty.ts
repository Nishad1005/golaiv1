// Quantity helpers.
//
// Every quantity column in Golai is Postgres `numeric`, and supabase-js returns
// `numeric` as a STRING (to preserve arbitrary precision). That's harmless when
// you display or subtract a value, but summing with `+` silently CONCATENATES:
//   [ '10', '5', '20' ].reduce((s, q) => s + q, 0)  ->  '0105 20', not 35.
// So every client-side quantity sum must coerce first. These two helpers are the
// single place that coercion lives.

/** Coerce a DB numeric (number | string | null) to a real number; 0 if unusable. */
export function num(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Sum a quantity field across rows, tolerant of numeric-as-string. */
export function sumQty<T>(rows: T[], pick: (r: T) => number | string | null | undefined): number {
  return rows.reduce((s, r) => s + num(pick(r)), 0)
}
