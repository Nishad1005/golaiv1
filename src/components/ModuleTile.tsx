import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

interface ModuleTileProps {
  icon: LucideIcon
  title: string
  subtitle: string
  to?: string
  /** Which build phase delivers this module; shown as a badge until it ships. */
  comingInPhase?: number
}

export function ModuleTile({ icon: Icon, title, subtitle, to, comingInPhase }: ModuleTileProps) {
  const inner = (
    <>
      <div
        className={
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ' +
          (to ? 'bg-brand-50 text-brand-600 group-hover:bg-brand-100' : 'bg-ink-100 text-ink-400')
        }
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink-900">{title}</span>
          {comingInPhase && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500">
              Soon
            </span>
          )}
        </div>
        <p className="truncate text-sm text-ink-500">{subtitle}</p>
      </div>
      {to && (
        <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
      )}
    </>
  )

  const className =
    'group card flex min-h-tap items-center gap-4 transition-all duration-200 ' +
    (to
      ? 'cursor-pointer hover:border-brand-200 hover:shadow-card-hover'
      : 'opacity-60')

  return to ? (
    <Link to={to} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  )
}
