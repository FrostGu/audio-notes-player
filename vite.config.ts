import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const root = path.resolve(__dirname)

import tailwindcss from 'tailwindcss'

export default defineConfig({
  root,
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(root, 'dist/client'),
    emptyOutDir: true,
  },
})
