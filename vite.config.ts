import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' so a new deploy waits for the user to click Reload (see
      // src/main.tsx + UpdatePrompt) instead of yanking the page mid-entry.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Golai — Warehouse Control',
        short_name: 'Golai',
        description: 'Golai runs the floor. Your ERP runs the books.',
        theme_color: '#2C1E0F',
        background_color: '#F5EEE3',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The new SW waits until the user accepts the update (Reload), so no
        // deploy interrupts someone mid-count. It claims the page on activation.
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        // App shell + assets cached so the app opens with no connectivity;
        // Supabase API calls are NOT cached (data must be live or queued).
        globPatterns: ['**/*.{js,css,html,svg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
})
