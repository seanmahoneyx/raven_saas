/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // index + the chart-heavy Dashboard chunk legitimately exceed 500kB; raise the
    // warning threshold so it only fires on genuinely unexpected growth.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split the heaviest third-party libs into their own long-lived chunks so they
        // cache across deploys and stay out of the app/index chunk. recharts (+ its d3
        // deps) and dnd-kit are only needed by the lazy report/scheduler routes.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'charts'
          if (id.includes('@dnd-kit')) return 'dnd'
          if (id.includes('@tanstack')) return 'tanstack'
          if (id.includes('date-fns')) return 'date-fns'
          if (id.includes('lucide-react')) return 'icons'
          // NOTE: do NOT split React (react / react-dom / react-router / scheduler)
          // into its own chunk. Doing so created a circular chunk dependency
          // (react-vendor <-> vendor: react-router's deps live in vendor, while
          // vendor libs import React) which crashes at runtime with
          // "Cannot access 'X' before initialization" (chunk init-order TDZ).
          // Keeping React in the single `vendor` chunk keeps the graph acyclic.
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    css: true,
  },
})
