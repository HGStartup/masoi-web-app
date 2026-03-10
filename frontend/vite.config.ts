import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/gamehub': {
        target: 'http://localhost:5050',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:5050',
      },
    },
  },
})
