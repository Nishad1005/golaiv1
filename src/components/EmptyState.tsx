import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  /** One line on why it's empty and what fills it. */
  detail: string
  /** Where to go next, when there is something this person can actually do. */
  action?: { label: string; to: string }
  children?: ReactNode
}

/**
 * What a list looks like before anyone has used it.
 *
 * A blank screen reads as broken, and "no records found" tells a new user
 * nothing. Every empty list should explain why it's empty and — when the person
 * looking at it has the permission — offer the button that fills it.
 */
export function EmptyState({ icon: Icon, title, detail, action, children }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <p className="mt-4 font-semibold text-ink-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-400">{detail}</p>
      {action && (
        <Link to={action.to} className="btn-primary mt-5">
          {action.label}
        </Link>
      )}
      {children}
    </div>
  )
}
