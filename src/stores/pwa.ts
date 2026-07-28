import { create } from 'zustand'

interface PwaState {
  /** A newer build is available and waiting to take over. */
  needRefresh: boolean
  /** Activate the waiting service worker and reload — set by main.tsx. */
  reload: (() => void) | null
  announce: (reload: () => void) => void
}

/**
 * Signals a pending app update so the UI can offer a gentle "Reload" instead of
 * yanking the page out from under someone mid-entry. main.tsx calls announce()
 * from the service worker's onNeedRefresh; UpdatePrompt reads it.
 */
export const usePwa = create<PwaState>((set) => ({
  needRefresh: false,
  reload: null,
  announce: (reload) => set({ needRefresh: true, reload }),
}))
