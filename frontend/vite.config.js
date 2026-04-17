import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Open in Chrome (external window) instead of VS Code embedded browser
//process.env.BROWSER = process.env.BROWSER || 'chrome'

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
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
