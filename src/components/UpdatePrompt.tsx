import { RefreshCw } from 'lucide-react'
import { usePwa } from '../stores/pwa'

/**
 * "A new version is ready" — shown when a deploy lands while someone is using
 * the app. Deliberately does NOT reload on its own: floor staff may be
 * mid-count or mid-assign with unsaved input, so they refresh when it suits
 * them. Sits below modals (z-40) so it never blocks a dialog.
 */
export function UpdatePrompt() {
  const { needRefresh, reload } = usePwa()
  if (!needRefresh) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-ink-200 bg-navy px-4 py-2.5 text-sm text-white shadow-2xl">
        <RefreshCw className="h-4 w-4 shrink-0 text-brand-300" aria-hidden />
        <span>A new version of Golai is ready.</span>
        <button
          onClick={() => reload?.()}
          className="shrink-0 rounded-full bg-brand-500 px-3 py-1 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
