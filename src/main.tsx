import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/inter' // bundled → works offline, no CDN
import App from './App'
import { usePwa } from './stores/pwa'
import './index.css'

// A new deploy does NOT reload on its own — floor staff may be mid-count or
// mid-assign with unsaved input. Instead we surface a gentle "Reload" prompt
// (UpdatePrompt) and let them refresh when it suits them. Re-checks hourly for
// long-lived tabs on the warehouse floor.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    usePwa.getState().announce(() => updateSW(true))
  },
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
