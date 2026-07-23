import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages needs the repo subpath; Vercel serves from the domain root.
export default defineConfig({
  base: process.env.VERCEL ? '/' : '/itrs-dem-prototype/',
  plugins: [react(), tailwindcss()],
})
