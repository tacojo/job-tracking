import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Docker mounts repo docs at frontend/docs; local dev uses ../docs
const docsInApp = path.resolve(__dirname, 'docs')
const docsDir = fs.existsSync(docsInApp) ? docsInApp : path.resolve(__dirname, '../docs')

// Open in Chrome (external window) instead of VS Code embedded browser
//process.env.BROWSER = process.env.BROWSER || 'chrome'

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@docs': docsDir,
    },
  },
  server: {
    port: 5173,
    open: !process.env.VITE_PROXY_TARGET,
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true },
      '/auth': { target: proxyTarget, changeOrigin: true },
      '/health': { target: proxyTarget, changeOrigin: true },
      '/ready': { target: proxyTarget, changeOrigin: true },
    },
  },
})
