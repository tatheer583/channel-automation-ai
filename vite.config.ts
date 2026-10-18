import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works when served from a repository
  // sub-path, e.g. https://<user>.github.io/<repo>/ (GitHub Pages).
  base: './',
})
