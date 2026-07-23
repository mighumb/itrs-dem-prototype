import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages needs the repo subpath; Vercel serves from the domain root.
export default defineConfig({
  base: process.env.VERCEL ? '/' : '/itrs-dem-prototype/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Local Playwright runner (npm run journey:server)
      '/api/journey-run': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      // Discovery Gemini API — use `vercel dev` or a separate API host in local work.
      // When JOURNEY-only server is up, other /api/* calls are not proxied here.
    },
  },
})
