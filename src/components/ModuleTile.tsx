import type { LucideIcon } from 'lucide-react'
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
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cream">
        <Icon className="h-6 w-6 text-ink-500" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          {comingInPhase && (
            <span className="rounded-full bg-tan/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500">
              Phase {comingInPhase}
            </span>
          )}
        </div>
        <p className="truncate text-sm text-ink-400">{subtitle}</p>
      </div>
    </>
  )

  const className =
    'card flex min-h-tap items-center gap-4 transition-colors ' +
    (to ? 'hover:border-tan cursor-pointer' : 'opacity-60')

  return to ? (
    <Link to={to} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  )
}
