import { Link, useLocation } from 'react-router-dom'
import { Construction } from 'lucide-react'

export function ComingSoon() {
  const { pathname } = useLocation()
  return (
    <div className="card flex flex-col items-center gap-3 py-12 text-center">
      <Construction className="h-10 w-10 text-brand-500" />
      <p className="font-semibold">This screen is being built</p>
      <p className="text-sm text-ink-400">{pathname}</p>
      <Link to="/" className="btn-secondary mt-2">
        Back to home
      </Link>
    </div>
  )
}
