import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/platformetrix-prototype/',
  server: {
    // Pin to a fixed port so localStorage (scoped per origin incl. port) stays stable.
    // strictPort fails loudly instead of drifting to another port and "losing" saved data.
    port: 5174,
    strictPort: true,
    proxy: {
      // Dev-only proxy so the browser can reach Roboflow without CORS issues.
      // A production build would need a real proxy/backend instead.
      '/roboflow': {
        target: 'https://serverless.roboflow.com',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/roboflow/, ''),
      },
    },
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
