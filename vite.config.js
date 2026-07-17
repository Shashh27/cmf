import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    // Proxy ONLY for chatbot — all other APIs use direct backend IPs in Config/
    proxy: {
      '/api/chatbot': {
        target: 'http://172.18.7.86:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
