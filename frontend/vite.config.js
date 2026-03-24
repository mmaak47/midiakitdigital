import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/midiakit/',
  server: {
    proxy: {
      '/midiakit/api': {
        target: 'http://localhost:3002',
        rewrite: (path) => path.replace(/^\/midiakit\/api/, '')
      },
      '/midiakit/uploads': {
        target: 'http://localhost:3002',
        rewrite: (path) => path.replace(/^\/midiakit/, '')
      }
    }
  }
})
