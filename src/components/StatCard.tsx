import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  hint?: string
  to?: string
  /** Visual tone for the icon chip and emphasis. */
  tone?: 'brand' | 'amber' | 'red' | 'slate'
  loading?: boolean
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-ink-100 text-ink-500',
}

export function StatCard({ icon: Icon, label, value, hint, to, tone = 'slate', loading }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        <span className={'flex h-9 w-9 items-center justify-center rounded-lg ' + TONES[tone]}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-ink-900">
        {loading ? <span className="inline-block h-8 w-12 animate-pulse rounded bg-ink-100" /> : value}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </>
  )

  const className =
    'card block transition-all duration-200 ' +
    (to ? 'cursor-pointer hover:border-brand-200 hover:shadow-card-hover' : '')

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
